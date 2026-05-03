import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BusinessBreakDetector from "./BusinessBreakDetector";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard");
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (tenantError || !tenant?.tenant_id) {
    redirect("/onboarding");
  }

  return <BusinessBreakDetector tenantId={tenant.tenant_id} />;
}
