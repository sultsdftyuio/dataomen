import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import RecoveryOverview from "./RecoveryOverview";
import QuickStartGuide from "./QuickStartGuide";

export const metadata = {
  title: "Dashboard | Arcli",
  description: "Monitor churn risk and recovery performance.",
};

export default async function DashboardPage() {
  // 1. Resolve Multi-Tenant Context (Handles Auth Internally)
  const tenantResult = await resolveTenantContext();

  // 2. Handle Broken Tenant States & Auth Failures Deterministically
  if ("response" in tenantResult) {
    if (tenantResult.response.status === 400) {
      // User is authenticated but has no tenant mapping in the DB.
      // Do NOT show them the QuickStart Guide, route them to create a workspace.
      redirect("/onboarding/workspace"); 
    }
    // For 401 Unauthorized or 500 errors, force re-authentication.
    redirect("/login?next=/dashboard");
  }

  const { supabase: tenantSupabase, tenantId } = tenantResult.context;

  // 3. Deterministic Setup Verification (Parallelized for Performance)
  // We check BOTH the presence of an API key AND if we've actually received data.
  // head: true makes these blazing fast COUNT() queries.
  const [apiKeyResponse, eventsResponse] = await Promise.all([
    tenantSupabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("revoked_at", null)
      .limit(1),
    tenantSupabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .limit(1)
  ]);

  // Observability: Log infrastructure failures so we can debug stuck users
  if (apiKeyResponse.error || eventsResponse.error) {
    console.error(`[Dashboard] Setup verification query failed for tenant ${tenantId}`, {
      apiError: apiKeyResponse.error,
      eventError: eventsResponse.error
    });
  }

  const hasApiKey = (apiKeyResponse.count ?? 0) > 0;
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