// app/(dashboard)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RecoveryOverview from "./RecoveryOverview";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard");
  }

  // 1. Fetch the data explicitly from the database mapping
  const { data: tenantData, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const tenant = tenantData as { tenant_id: string } | null;

  // 2. The Open-Access Fallback (Implicit Isolation)
  // We check for explicit DB mapping first. If none exists (new signup),
  // we default to their unique user ID to serve as their personal workspace.
  // We explicitly REMOVE the email domain fallback to prevent accidental data mixing.
  const tenantId = tenant?.tenant_id || user.id;

  if (tenantError && !tenant?.tenant_id) {
    console.info("New user sign-up detected. Provisioning implicit workspace.", {
      userId: user.id,
      assignedTenantId: tenantId
    });
  }

  // 3. Render the deterministic dashboard
  return <RecoveryOverview tenantId={tenantId} />;
}