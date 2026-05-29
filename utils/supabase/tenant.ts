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
};

export type TenantContextResult =
  | { context: TenantContext }
  | { response: NextResponse };

const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  let pendingProvisioningLogged = false;

  for (let attempt = 0; attempt <= MAX_PROVISIONING_RETRIES; attempt += 1) {
    const { data: mapping, error: mappingError } = await supabase
      .from("tenant_users")
      .select(`
        tenant_id,
        user_id,
        tenants!inner(status)
      `)
      .eq("user_id", userId)
      .eq("tenants.status", "READY")
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
      const tenantId = String(mapping.tenant_id);

      return {
        context: {
          supabase,
          tenantId,
          userId: String(mapping.user_id),
        },
      };
    }

    if (!pendingProvisioningLogged) {
      console.warn(`[TenantContext] Awaiting async provisioning for user ${userId}...`, {
        userId,
        maxRetries: MAX_PROVISIONING_RETRIES,
        baseDelayMs: PROVISIONING_RETRY_BASE_DELAY_MS,
        retryMultiplier: PROVISIONING_RETRY_MULTIPLIER,
      });
      pendingProvisioningLogged = true;
    }

    if (attempt < MAX_PROVISIONING_RETRIES) {
      const delayMs = Math.round(
        PROVISIONING_RETRY_BASE_DELAY_MS * Math.pow(PROVISIONING_RETRY_MULTIPLIER, attempt)
      );

      await delay(delayMs);
    }
  }

  console.error("[TenantContext] Async provisioning exhausted without workspace mapping", {
    userId,
    maxRetries: MAX_PROVISIONING_RETRIES,
  });

  return {
    response: NextResponse.json(
      {
        error: "No associated workspace found for user.",
        code: "workspace_setup_pending",
      },
      { status: 400 }
    ),
  };
}