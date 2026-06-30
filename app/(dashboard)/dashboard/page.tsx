import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveTenantContext } from "@/utils/supabase/tenant";

import RecoveryOverview from "./RecoveryOverview";
import QuickStartGuide from "./QuickStartGuide";

export const metadata: Metadata = {
  title: "Dashboard | Arcli",
  description: "Monitor churn risk and recovery performance.",
};

export default async function DashboardPage() {
  // ============================================================================
  // 1. Resolve Auth + Tenant Context (Fail Closed)
  // ============================================================================

  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    switch (status) {
      case 400:
        // Authenticated user exists but tenant/workspace mapping is broken.
        redirect("/onboarding/workspace");

      case 401:
        // Session missing/expired.
        redirect("/login?next=/dashboard");

      case 403:
        // User authenticated but forbidden.
        redirect("/unauthorized");

      default:
        // Infrastructure or unexpected failure.
        redirect("/error");
    }
  }

  const { supabase: tenantSupabase, tenantId } = tenantResult.context;

  // ============================================================================
  // 2. Deterministic Setup Verification
  // ============================================================================
  // NOTE:
  // - api_keys and events utilize explicit UUID existence checks via select("id")
  // ============================================================================
  
  let apiKeyResult, eventResult;

  try {
    [apiKeyResult, eventResult] = await Promise.all([
      tenantSupabase
        .from("api_keys")
        .select("id")
        .eq("tenant_id", tenantId)
        .is("revoked_at", null)
        .limit(1)
        .maybeSingle(),

      tenantSupabase
        .from("events")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle(),
    ]);
  } catch (error) {
    // Catch unhandled promise rejections (e.g. network failure to Supabase)
    console.error("[Dashboard] Fatal error executing setup queries", error);
  }

  // ============================================================================
  // 3. Infrastructure Failure Handling
  // ============================================================================

  if (
    !apiKeyResult ||
    !eventResult ||
    apiKeyResult.error || 
    eventResult.error
  ) {
    console.error(
      `[Dashboard] Setup verification failed for tenant ${tenantId}`,
      {
        apiKeyError: apiKeyResult?.error,
        eventError: eventResult?.error,
      }
    );

    // Gracefully redirect to the error page instead of throwing an unhandled Error
    // This stops the generic 'Digest' 500 server-side exception from breaking the app.
    redirect("/error");
  }

  // ============================================================================
  // 4. Compute Setup State
  // ============================================================================

  const hasApiKey = !!apiKeyResult.data;
  const hasReceivedData = !!eventResult.data;

  // Granular onboarding states improve UX clarity.
  const setupState = !hasApiKey
    ? "missing_api_key"
    : !hasReceivedData
    ? "awaiting_first_event"
    : "active";

  // ============================================================================
  // 5. Render Deterministically
  // ============================================================================

  return (
    <div className="w-full mx-auto h-full flex flex-col animate-in fade-in duration-300">
      {setupState === "active" ? (
        <RecoveryOverview />
      ) : (
        <QuickStartGuide
          hasApiKey={hasApiKey}
          hasReceivedData={hasReceivedData}
          setupState={setupState}
        />
      )}
    </div>
  );
}