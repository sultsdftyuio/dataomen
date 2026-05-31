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
  // Account for PostgREST inner join return shape
  tenants?: {
    status: string;
  } | null;
};

export type TenantContextResult =
  | { context: TenantContext }
  | { response: NextResponse };

const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Strictly for bypassing the Auth -> Public trigger race condition (usually <50ms)
const PROVISIONING_RETRY_BASE_DELAY_MS = 300;
const PROVISIONING_RETRY_MULTIPLIER = 1.5;
const MAX_PROVISIONING_RETRIES = 4;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic Tenant Resolution
 * Enforces strict multi-tenant boundaries by ensuring every active session 
 * maps to an explicit tenant_id in the database.
 */
export async function resolveTenantContext(): Promise<TenantContextResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  // 1. Require an active auth session
  if (error || !data?.user) {
    return { response: unauthorizedResponse() };
  }

  const userId = data.user.id;
  let pendingAssignmentLogged = false;

  for (let attempt = 0; attempt <= MAX_PROVISIONING_RETRIES; attempt += 1) {
    // We intentionally DO NOT filter by "READY" here. We need to know if the record exists at all.
    const { data: mapping, error: mappingError } = await supabase
      .from("tenant_users")
      .select(`
        tenant_id,
        user_id,
        tenants!inner(status)
      `)
      .eq("user_id", userId)
      .maybeSingle<TenantUserMapping>();

    if (mappingError) {
      console.error("[TenantContext] DB error fetching tenant context", {
        userId,
        attempt,
        error: mappingError,
      });

      return {
        response: NextResponse.json(
          { error: "Tenant resolution failed due to a server error." },
          { status: 500 }
        ),
      };
    }

    if (mapping?.tenant_id && mapping.user_id === userId) {
      const tenantStatus = mapping.tenants?.status || "UNKNOWN";

      // 2a. Tenant is fully provisioned and ready
      if (tenantStatus === "READY") {
        return {
          context: {
            supabase,
            tenantId: String(mapping.tenant_id),
            userId: String(mapping.user_id),
          },
        };
      }

      // 2b. Tenant shell exists but is actively building (PROVISIONING, INTEGRATION, BACKFILLING).
      // DO NOT burn retries. Short-circuit immediately to allow the UI polling to handle it.
      if (!pendingAssignmentLogged) {
        console.info(`[TenantContext] Workspace provisioning in progress. Phase: ${tenantStatus}`, { userId });
      }
      
      return {
        response: NextResponse.json(
          {
            error: "Workspace provisioning in progress.",
            code: "workspace_setup_pending",
            phase: tenantStatus // Send exact phase down so UI component can render accurate progress
          },
          { status: 400 }
        ),
      };
    }

    // 3. No mapping exists yet. This implies the auth trigger hasn't fired or committed.
    // This is the ONLY scenario where we use the micro-retry loop.
    if (!pendingAssignmentLogged) {
      console.warn(`[TenantContext] Awaiting initial tenant assignment shell for user...`, {
        userId,
        attempt
      });
      pendingAssignmentLogged = true;
    }

    if (attempt < MAX_PROVISIONING_RETRIES) {
      const delayMs = Math.round(
        PROVISIONING_RETRY_BASE_DELAY_MS * Math.pow(PROVISIONING_RETRY_MULTIPLIER, attempt)
      );

      await delay(delayMs);
    }
  }

  // 4. Exhausted retries without seeing a tenant mapping record.
  console.error("[TenantContext] Auth sync exhausted. No workspace mapping created.", {
    userId,
    maxRetries: MAX_PROVISIONING_RETRIES,
  });

  return {
    response: NextResponse.json(
      {
        error: "No associated workspace found for user.",
        code: "tenant_assignment_failed",
      },
      { status: 400 }
    ),
  };
}