import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/utils/supabase/server";

type TenantContext = {
  supabase: SupabaseClient<Database>;
  tenantId: string;
  userId: string;
};

type TenantContextResult =
  | { context: TenantContext }
  | { response: NextResponse };

const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // 2. Fetch explicit mapping from the database
  const { data: mapping, error: mappingError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  // 3. Handle Infrastructure/Database Errors
  if (mappingError) {
    console.error(`[TenantContext] DB Error fetching tenant for user ${userId}:`, mappingError);
    return {
      response: NextResponse.json(
        { error: "Tenant resolution failed due to a server error." },
        { status: 500 }
      ),
    };
  }

  // 4. Enforce Multi-Tenant Boundaries (Fail Loudly)
  // We NEVER fallback to user_id. If they have no workspace, they are in a broken state.
  if (!mapping?.tenant_id) {
    console.warn(`[TenantContext] User ${userId} authenticated, but has no workspace mapping.`);
    return {
      response: NextResponse.json(
        { error: "No associated workspace found for user." },
        { status: 400 } // Callers should catch 400 and redirect to onboarding/workspace-creation
      ),
    };
  }

  // 5. Return safe, isolated context
  return {
    context: {
      supabase,
      tenantId: String(mapping.tenant_id),
      userId,
    },
  };
}