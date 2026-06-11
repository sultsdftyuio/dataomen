import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/utils/supabase/server";

export type TenantContext = {
  supabase: SupabaseClient<Database>;
  tenantId: string;
  userId: string;
};

type TenantUserMapping = {
  tenant_id: string | null;
  user_id: string | null;
  // Defensive: PostgREST may return an object or an array for a single FK relation
  // depending on metadata inference. We normalize at runtime.
  // FIX: Updated to target provisioning_status instead of the billing status
  tenants: { provisioning_status: string } | { provisioning_status: string }[] | null;
};

export type TenantContextResult =
  | { context: TenantContext }
  | { response: NextResponse };

const unauthorizedResponse = () =>
  NextResponse.json(
    { error: "Unauthorized", code: "unauthorized" },
    { status: 401 }
  );

// Retry budget: 150ms + 225ms + 338ms + 506ms ≈ 1.2s of artificial delay.
// With DB roundtrips and network latency, expect 1.5s–2.5s total under load.
const PROVISIONING_RETRY_BASE_DELAY_MS = 150;
const PROVISIONING_RETRY_MULTIPLIER = 1.5;
const MAX_PROVISIONING_RETRIES = 4;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Public-facing provisioning labels.
 * Never leak internal implementation details.
 */
const PHASE_MESSAGES: Record<string, string> = {
  PENDING: "Creating workspace...",
  PROVISIONING: "Building workspace...",
  SYNCING: "Connecting integrations...",
  INDEXING: "Preparing intelligence baseline...",
  INTEGRATION: "Connecting integrations...",
  BACKFILLING: "Syncing historical data...",
};

/**
 * Deterministic tenant resolution with strict multi-tenant boundaries.
 *
 * Handles:
 * - Authenticated users
 * - Async provisioning races (tenant_users row exists before tenants row)
 * - Tenant readiness verification via an explicit, semantic state machine
 * - Invalid / terminal tenant states with precise HTTP semantics
 * - ACTIVE SELF-HEALING: Synchronously provisions workspaces if missing.
 *
 * Returns 202 Accepted for any provisioning state so the UI can poll.
 * Returns specific 4xx/5xx codes for terminal/error states.
 *
 * SCHEMA ASSUMPTION: tenant_users.user_id must be UNIQUE (or filtered by
 * an active-state condition) for maybeSingle() to be semantically correct.
 * If one user can belong to multiple workspaces, this helper must be replaced
 * with a multi-tenant selection strategy.
 */
export async function resolveTenantContext(): Promise<TenantContextResult> {
  const startedAt = Date.now();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { response: unauthorizedResponse() };
  }

  const userId = data.user.id;
  let loggedMissingMapping = false;

  for (let attempt = 0; attempt <= MAX_PROVISIONING_RETRIES; attempt += 1) {
    const { data: mapping, error: mappingError } = await supabase
      .from("tenant_users")
      .select(`
        tenant_id,
        user_id,
        tenants (provisioning_status)
      `)
      .eq("user_id", userId)
      .maybeSingle<TenantUserMapping>();

    if (mappingError) {
      console.error("[TenantContext] DB error resolving tenant mapping", {
        userId,
        attempt,
        elapsedMs: Date.now() - startedAt,
        error: mappingError,
      });
      return {
        response: NextResponse.json(
          {
            error: "Tenant resolution failed due to a server error.",
            code: "tenant_resolution_error",
          },
          { status: 500 }
        ),
      };
    }

    // ------------------------------------------------------------------
    // Mapping exists with a tenant_id
    // ------------------------------------------------------------------
    if (mapping?.tenant_id && mapping.user_id === userId) {
      // Integrity violation: a single user should never map to multiple
      // tenant rows. Fail loudly rather than silently swallowing it.
      if (Array.isArray(mapping.tenants) && mapping.tenants.length > 1) {
        console.error(
          "[TenantContext] Unexpected multiple tenant rows returned",
          {
            userId,
            tenantId: mapping.tenant_id,
            count: mapping.tenants.length,
            elapsedMs: Date.now() - startedAt,
          }
        );
        return {
          response: NextResponse.json(
            {
              error: "Tenant relationship integrity violation.",
              code: "tenant_integrity_error",
            },
            { status: 500 }
          ),
        };
      }

      // Runtime normalization: safely extract object whether PostgREST
      // returns an array or a single object.
      const rawTenant = Array.isArray(mapping.tenants)
        ? mapping.tenants[0]
        : mapping.tenants;

      // Race condition: tenant_users row was inserted but the tenants
      // row has not yet been committed by the backend pipeline.
      if (!rawTenant) {
        console.warn(
          "[TenantContext] Partial state: tenant_users exists but tenants row is missing",
          {
            userId,
            tenantId: mapping.tenant_id,
            elapsedMs: Date.now() - startedAt,
          }
        );
        return {
          response: NextResponse.json(
            {
              error: "Workspace shell assembling.",
              code: "workspace_setup_pending",
              phase: "PROVISIONING",
            },
            { status: 202 }
          ),
        };
      }

      // FIX: Extract provisioning_status rather than the billing status
      const tenantStatus = rawTenant.provisioning_status;

      // ----------------------------------------------------------------
      // Explicit, semantic state machine — fail closed for unknown states
      // ----------------------------------------------------------------
      switch (tenantStatus) {
        case "READY": {
          if (attempt > 0) {
            console.info("[TenantContext] Tenant resolved after retry", {
              userId,
              attempts: attempt,
              elapsedMs: Date.now() - startedAt,
            });
          }
          return {
            context: {
              supabase,
              tenantId: String(mapping.tenant_id),
              userId: String(mapping.user_id),
            },
          };
        }

        case "PENDING":
        case "PROVISIONING":
        case "SYNCING":
        case "INDEXING":
        case "INTEGRATION":
        case "BACKFILLING": {
          return {
            response: NextResponse.json(
              {
                status: "PROVISIONING",
                phase: tenantStatus,
                message:
                  PHASE_MESSAGES[tenantStatus] ?? "Preparing your workspace...",
                code: "workspace_setup_pending",
              },
              { status: 202 }
            ),
          };
        }

        // Terminal states — explicit HTTP semantics
        case "SUSPENDED":
          console.warn("[TenantContext] Workspace suspended", {
            userId,
            tenantId: mapping.tenant_id,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            response: NextResponse.json(
              {
                error: "Workspace suspended.",
                code: "workspace_suspended",
                status: tenantStatus,
              },
              { status: 403 }
            ),
          };

        case "ARCHIVED":
          console.warn("[TenantContext] Workspace archived", {
            userId,
            tenantId: mapping.tenant_id,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            response: NextResponse.json(
              {
                error: "Workspace archived.",
                code: "workspace_archived",
                status: tenantStatus,
              },
              { status: 423 }
            ),
          };

        case "DELETED":
          console.warn("[TenantContext] Workspace deleted", {
            userId,
            tenantId: mapping.tenant_id,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            response: NextResponse.json(
              {
                error: "Workspace deleted.",
                code: "workspace_deleted",
                status: tenantStatus,
              },
              { status: 410 }
            ),
          };

        case "FAILED":
          console.error("[TenantContext] Workspace provisioning failed", {
            userId,
            tenantId: mapping.tenant_id,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            response: NextResponse.json(
              {
                error: "Workspace provisioning failed.",
                code: "workspace_failed",
                status: tenantStatus,
              },
              { status: 503 }
            ),
          };

        default:
          console.error("[TenantContext] Unknown tenant status", {
            userId,
            tenantId: mapping.tenant_id,
            status: tenantStatus,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            response: NextResponse.json(
              {
                error: "Workspace state is invalid.",
                code: "workspace_unknown",
                status: tenantStatus,
              },
              { status: 500 }
            ),
          };
      }
    }

    // ------------------------------------------------------------------
    // No mapping yet — Active Self-Healing Protocol (Rule 1 Enforcement)
    // ------------------------------------------------------------------
    if (!loggedMissingMapping) {
      console.info("[TenantContext] Awaiting tenant assignment. Attempting active self-healing.", { userId });
      loggedMissingMapping = true;

      // Deterministic company name derivation from email matching auth callback
      const email = data.user.email || '';
      const rawCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace';
      const fallbackCompany = rawCompany.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace';
      const workspaceName = `${fallbackCompany.charAt(0).toUpperCase() + fallbackCompany.slice(1)} Workspace`;

      // Execute race-safe SQL function to enforce synchronous identity.
      // Idempotent: If another process creates it in parallel, this fails safely or skips.
      const { error: healError } = await supabase.rpc('provision_initial_workspace', {
        target_user_id: userId,
        default_name: workspaceName,
      });

      if (healError) {
        console.error("[TenantContext] CRITICAL: Self-healing RPC failed", {
          userId,
          error: healError
        });
      }
    }

    // Exponential backoff before checking if mapping/healing succeeded
    if (attempt < MAX_PROVISIONING_RETRIES) {
      const delayMs = Math.round(
        PROVISIONING_RETRY_BASE_DELAY_MS *
          Math.pow(PROVISIONING_RETRY_MULTIPLIER, attempt)
      );
      await delay(delayMs);
    }
  }

  // Retries exhausted — hand off to the frontend poller.
  // Because we added self-healing, reaching here means a true backend/DB outage.
  console.error("[TenantContext] Tenant assignment still pending after max retries and self-healing", {
    userId,
    attempts: MAX_PROVISIONING_RETRIES,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    response: NextResponse.json(
      {
        status: "PROVISIONING",
        phase: "PROVISIONING",
        message: "Securing your workspace...",
        code: "workspace_setup_pending",
      },
      { status: 202 }
    ),
  };
}