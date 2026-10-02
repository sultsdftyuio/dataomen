import type { SupabaseClient } from "@supabase/supabase-js";

/** Staff scripts recheck the same tenant, approved brief revision, and finite
 * pilot enrollment before writing. Database triggers remain the final gate. */
export async function assertActivePilotBrief(
  db: SupabaseClient<any, any, any>,
  tenantId: string,
  targetingProfileId: string,
  targetingProfileVersion: number,
  targetKind?: "account" | "builder" | "project",
): Promise<void> {
  const { data: profile, error: profileError } = await db.from("targeting_profiles")
    .select("id,profile_version,approval_status,target_types")
    .eq("id", targetingProfileId).eq("tenant_id", tenantId).maybeSingle();
  if (profileError || !profile || profile.approval_status !== "approved"
      || profile.profile_version !== targetingProfileVersion
      || (targetKind && (!Array.isArray(profile.target_types)
        || !profile.target_types.includes(targetKind)))) {
    throw new Error("Targeting brief is missing, stale, unapproved, or excludes this entity kind.");
  }
  const { data: pilot, error: pilotError } = await db.from("assisted_prospect_pilots")
    .select("pilot_status,access_expires_at").eq("tenant_id", tenantId).maybeSingle();
  if (pilotError || !pilot || pilot.pilot_status !== "active"
      || Date.parse(pilot.access_expires_at) <= Date.now()) {
    throw new Error("Workspace does not have active assisted-pilot access.");
  }
}
