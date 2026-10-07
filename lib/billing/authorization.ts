import { createClient } from "@/utils/supabase/server";

const BILLING_ADMIN_ROLES = ["owner", "admin"];

/**
 * Throws unless the user is an owner or admin of the workspace.
 *
 * Every action that can start, change, or end a paid subscription calls this:
 * membership alone is not enough to spend or cancel on a workspace's behalf.
 */
export async function requireWorkspaceBillingAdmin(
  tenantId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  const { data: membership, error } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle<{ role: string | null }>();

  const role = membership?.role?.trim().toLowerCase();
  if (error || !role || !BILLING_ADMIN_ROLES.includes(role)) {
    console.error("[Billing] Unauthorized billing management attempt", {
      event: "billing_management_unauthorized",
      tenant_id: tenantId,
      user_id: userId,
      role: role ?? null,
      error,
    });
    throw new Error("Only workspace owners and admins can manage billing.");
  }
}
