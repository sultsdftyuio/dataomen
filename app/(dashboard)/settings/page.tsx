// app/(dashboard)/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantApiKeySummary, fetchTenantSettingsRow } from "@/lib/settings/server";
import SettingsClient from "./settings-client";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";

type BillingPlanStatus = NonNullable<NonNullable<WorkspaceBillingCardProps["planData"]>["planStatus"]>;

export default async function SettingsPage({ 
  searchParams 
}: { 
  searchParams: { recovery?: string } 
}) {
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
    };
  }

  const isRecoveryMode = searchParams.recovery === "1";

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
