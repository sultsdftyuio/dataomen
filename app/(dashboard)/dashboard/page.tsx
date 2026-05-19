import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import RecoveryOverview from "./RecoveryOverview";
import QuickStartGuide from "./QuickStartGuide";

export const metadata = {
  title: "Dashboard | Arcli",
  description: "Monitor churn risk and recovery performance.",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // 1. Secure Authentication Check
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard");
  }

  // 2. Resolve Multi-Tenant Context
  const tenantResult = await resolveTenantContext();
  
  if ("response" in tenantResult) {
    // If tenant resolution fails (e.g., user exists but has no tenant record),
    // trap them in the QuickStart/Onboarding flow to repair their state.
    return (
      <div className="w-full mx-auto max-w-5xl h-full flex flex-col animate-in fade-in duration-300">
        <QuickStartGuide />
      </div>
    );
  }

  const { supabase: tenantSupabase, tenantId } = tenantResult.context;

  // 3. Deterministic Setup Verification (Parallelized for Performance)
  // We check BOTH the presence of an API key AND if we've actually received data.
  const [settingsResponse, eventsResponse] = await Promise.all([
    tenantSupabase
      .from("tenant_settings")
      .select("api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
      
    tenantSupabase
      .from("events")
      .select("id", { count: "exact", head: true }) // head:true makes this a blazing fast COUNT() query
      .eq("tenant_id", tenantId)
      .limit(1)
  ]);

  const hasApiKey = !!settingsResponse.data?.api_key;
  const hasReceivedData = (eventsResponse.count ?? 0) > 0;

  // Setup is only "complete" if data is actively flowing into the system.
  const isSetupComplete = hasApiKey && hasReceivedData;

  // 4. Render the correct state deterministically
  return (
    <div className="w-full mx-auto h-full flex flex-col animate-in fade-in duration-300">
      {!isSetupComplete ? (
        // Passing down the state allows the QuickStartGuide to intelligently 
        // show "Step 1 complete" vs "Awaiting your first event..."
        <QuickStartGuide hasApiKey={hasApiKey} /> 
      ) : (
        <RecoveryOverview />
      )}
    </div>
  );
}