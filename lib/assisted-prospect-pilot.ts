import type { SupabaseClient } from "@supabase/supabase-js";

export function assistedProspectPilotEnabled(): boolean {
  return process.env.ARCLI_ASSISTED_PROSPECT_PILOT_ENABLED === "true";
}

export async function assistedProspectPilotEnrolled(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
): Promise<boolean> {
  if (!assistedProspectPilotEnabled()) return false;
  const { data, error } = await supabase.rpc(
    "assisted_prospect_pilot_is_enrolled" as never,
    { target_tenant_id: tenantId } as never,
  );
  if (error) {
    // A missing additive contract must never expose a half-deployed pilot.
    console.error("[AssistedProspectPilot] Enrollment lookup failed", {
      code: error.code,
    });
    return false;
  }
  return data === true;
}
