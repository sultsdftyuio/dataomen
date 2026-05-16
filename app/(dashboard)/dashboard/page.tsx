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

  const deriveTenantId = () => {
    const appTenant = user.app_metadata?.tenant_id;
    if (typeof appTenant === "string" && appTenant.trim()) return appTenant;

    const userTenant = user.user_metadata?.tenant_id;
    if (typeof userTenant === "string" && userTenant.trim()) return userTenant;

    const emailDomain = user.email?.split("@")[1];
    if (emailDomain) return emailDomain;

    return user.id;
  };

  // 1. Fetch the data
  const { data: tenantData, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // 2. Safely cast the response to bypass the 'never' type error
  const tenant = tenantData as { tenant_id: string } | null;

  const fallbackTenantId = deriveTenantId();

  if (tenantError && !tenant?.tenant_id) {
    console.warn("tenant lookup failed, using fallback tenant id", {
      userId: user.id,
    });
  }

  const tenantId = tenant?.tenant_id || fallbackTenantId;

  // We are passing the tenantId down to our new deterministic dashboard
  return <RecoveryOverview tenantId={tenantId} />;
}