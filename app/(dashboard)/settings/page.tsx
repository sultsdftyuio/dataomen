// app/(dashboard)/settings/page.tsx
import { redirect } from "next/navigation";
import { verifyAndSyncSubscriptionStatus } from "@/app/actions/billing";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantApiKeySummary, fetchTenantSettingsRow } from "@/lib/settings/server";
import SettingsClient from "./settings-client";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";

type BillingPlanStatus = NonNullable<NonNullable<WorkspaceBillingCardProps["planData"]>["planStatus"]>;

type SettingsPageProps = {
  searchParams: Promise<{ recovery?: string | string[]; billing?: string | string[] }>;
};

function searchParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SettingsPage({ 
  searchParams 
}: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const billingReturnState = searchParamValue(resolvedSearchParams.billing);

  // 1. Deterministic Server Auth Fetch
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // 2. Resolve Tenant Context
  const tenantResult = await resolveTenantContext();
  
  // 3. Build a normalized snapshot for the client
  let settings = buildSettingsSnapshot(null);
  let billingPlanData: WorkspaceBillingCardProps["planData"] = {
    planName: "Free Access",
    planStatus: "free",
    description: "Restricted Free Access. Pro features are locked until you start the Pro trial.",
    priceText: "$29/month after the 3-day trial",
    isProTier: false,
  };

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;

    if (billingReturnState === "trial_started") {
      let shouldRefreshSettings = false;

      try {
        const result = await verifyAndSyncSubscriptionStatus(tenantId);

        console.info("[Settings] Billing return verification completed", {
          event: "settings_billing_return_verified",
          tenant_id: tenantId,
          sync_status: result.status,
          lookup_strategy: result.lookupStrategy,
        });

        if (result.status === "synced" || result.status === "already_synced") {
          shouldRefreshSettings = true;
        }
      } catch (error) {
        console.error("[Settings] Billing return verification failed", {
          event: "settings_billing_return_verification_failed",
          tenant_id: tenantId,
          error,
        });
      }

      if (shouldRefreshSettings) {
        redirect("/settings");
      }
    }
    
    const [settingsResult, apiKeyResult, entitlements] = await Promise.all([
      fetchTenantSettingsRow(tenantSupabase, tenantId),
      fetchTenantApiKeySummary(tenantSupabase, tenantId),
      getWorkspaceEntitlements(tenantSupabase, tenantId),
    ]);

    const { data, error } = settingsResult;
    const { data: apiKeySummary, error: apiKeyError } = apiKeyResult;

    if (error) {
      console.error("[SETTINGS_FETCH_ERROR]", error);
    } else {
      if (apiKeyError) {
        console.error("[API_KEY_SUMMARY_ERROR]", apiKeyError);
      }
      settings = buildSettingsSnapshot(data as any, apiKeySummary);
    }

    const subscriptionStatus = (entitlements.subscriptionStatus ?? "free") as BillingPlanStatus;
    billingPlanData = {
      planName: entitlements.billingLabel,
      planStatus: subscriptionStatus,
      description: entitlements.billingDescription,
      daysRemaining: entitlements.daysUntilTrialEnds,
      priceText: "$29/month after the 3-day trial",
      isProTier: entitlements.planTier === "pro",
      features: [
        {
          label: "Risk queue customer lists",
          description: "View and prioritize the customers most likely to churn.",
          unlocked: entitlements.canViewCustomerLists,
        },
        {
          label: "Campaign sending",
          description: "Send recovery emails to selected customers and cohorts.",
          unlocked: entitlements.canSendEmails,
        },
        {
          label: "Custom templates",
          description: "Create reusable recovery messaging for your team.",
          unlocked: entitlements.canCreateTemplates,
        },
      ],
    };
  }

  const isRecoveryMode = searchParamValue(resolvedSearchParams.recovery) === "1";

  // 4. Pass clean, safely abstracted state to the Client
  return (
    <SettingsClient 
      user={user} 
      initialSettings={settings} 
      isRecoveryMode={isRecoveryMode} 
      planData={billingPlanData}
    />
  );
}
