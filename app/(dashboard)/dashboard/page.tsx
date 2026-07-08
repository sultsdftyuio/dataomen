import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { verifyAndSyncSubscriptionStatus } from "@/app/actions/billing";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";

import RecoveryOverview from "./RecoveryOverview";
import QuickStartGuide from "./QuickStartGuide";

export const metadata: Metadata = {
  title: "Dashboard | Arcli",
  description: "Monitor churn risk and recovery performance.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DashboardPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function searchParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const billingReturnState = searchParamValue(resolvedSearchParams.billing);

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

  if (billingReturnState === "trial_started") {
    let shouldRefreshDashboard = false;

    try {
      const result = await verifyAndSyncSubscriptionStatus(tenantId, {
        skipRevalidate: true,
      });

      console.info("[Dashboard] Billing return verification completed", {
        event: "dashboard_billing_return_verified",
        tenant_id: tenantId,
        sync_status: result.status,
        lookup_strategy: result.lookupStrategy,
      });

      if (result.status === "synced" || result.status === "already_synced") {
        shouldRefreshDashboard = true;
      }
    } catch (error) {
      console.error("[Dashboard] Billing return verification failed", {
        event: "dashboard_billing_return_verification_failed",
        tenant_id: tenantId,
        error,
      });
    }

    if (shouldRefreshDashboard) {
      redirect("/dashboard");
    }
  }

  // ============================================================================
  // 2. Deterministic Setup Verification
  // ============================================================================
  // NOTE:
  // - api_keys and events utilize explicit UUID existence checks via select("id")
  // ============================================================================
  
  let apiKeyResult, eventResult;
  let entitlements: Awaited<ReturnType<typeof getWorkspaceEntitlements>> | null = null;

  try {
    [apiKeyResult, eventResult, entitlements] = await Promise.all([
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

      getWorkspaceEntitlements(tenantSupabase, tenantId),
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
    !entitlements ||
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
        <RecoveryOverview entitlements={entitlements} />
      ) : (
        <QuickStartGuide
          hasApiKey={hasApiKey}
          hasReceivedData={hasReceivedData}
          setupState={setupState}
          entitlements={entitlements}
        />
      )}
    </div>
  );
}
