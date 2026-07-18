import { redirect } from "next/navigation";
import { verifyAndSyncSubscriptionStatus } from "@/app/actions/billing";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantSettingsRow } from "@/lib/settings/server";
import SettingsClient from "./settings-client";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";
import {
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "@/app/(dashboard)/dashboard/data";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BillingPlanStatus = NonNullable<NonNullable<WorkspaceBillingCardProps["planData"]>["planStatus"]>;

type SettingsPageProps = {
  searchParams: Promise<{ billing?: string | string[] }>;
};

function searchParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function billingTestControlsEnabled(): boolean {
  const explicitFlag = process.env.BILLING_TEST_CONTROLS_ENABLED
    ?.trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV
    ?.trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .toLowerCase();

  if (explicitFlag && ["true", "1", "yes"].includes(explicitFlag)) {
    return true;
  }

  if (explicitFlag && ["false", "0", "no"].includes(explicitFlag)) {
    return false;
  }

  return (
    process.env.NODE_ENV !== "production" ||
    vercelEnv === "preview" ||
    vercelEnv === "development"
  );
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
  let serviceProfile: ServiceProfileView | null = null;
  let tenantId: string | null = null;

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId: resolvedTenantId } =
      tenantResult.context;
    tenantId = resolvedTenantId;

    if (billingReturnState === "trial_started") {
      let shouldRefreshSettings = false;

      try {
        const result = await verifyAndSyncSubscriptionStatus(resolvedTenantId);

        console.info("[Settings] Billing return verification completed", {
          event: "settings_billing_return_verified",
          tenant_id: resolvedTenantId,
          sync_status: result.status,
          lookup_strategy: result.lookupStrategy,
        });

        if (result.status === "synced" || result.status === "already_synced") {
          shouldRefreshSettings = true;
        }
      } catch (error) {
        console.error("[Settings] Billing return verification failed", {
          event: "settings_billing_return_verification_failed",
          tenant_id: resolvedTenantId,
          error,
        });
      }

      if (shouldRefreshSettings) {
        redirect("/settings");
      }
    }
    
    // Removed fetchTenantApiKeySummary from Promise.all
    const [settingsResult, entitlements, websiteUrl] = await Promise.all([
      fetchTenantSettingsRow(tenantSupabase, resolvedTenantId),
      getWorkspaceEntitlements(tenantSupabase, resolvedTenantId),
      fetchTenantWebsiteUrl(tenantSupabase, resolvedTenantId),
    ]);

    const { data, error } = settingsResult;

    if (error) {
      console.error("[SETTINGS_FETCH_ERROR]", error);
    } else {
      // Pass null for apiKeySummary since it is no longer needed
      settings = buildSettingsSnapshot(data as any, null);
    }

    serviceProfile = await fetchServiceProfile(
      tenantSupabase,
      resolvedTenantId,
      websiteUrl ?? settings.workspace.websiteUrl,
    );

    const subscriptionStatus = (entitlements.subscriptionStatus ?? "free") as BillingPlanStatus;
    const planTier = entitlements.planTier.toLowerCase();
    billingPlanData = {
      planName: entitlements.billingLabel,
      planStatus: subscriptionStatus,
      description: entitlements.billingDescription,
      daysRemaining: entitlements.daysUntilTrialEnds,
      priceText: "$29/month after the 3-day trial",
      isProTier: planTier === "pro",
      features: [
        {
          label: "Verified prospect queue",
          description: "Review prospects aligned with your service profile.",
          unlocked: entitlements.canViewCustomerLists,
        },
        {
          label: "Lead qualification signals",
          description: "Inspect why each lead matched your audience and pain criteria.",
          unlocked: entitlements.canSendEmails,
        },
        {
          label: "Reusable matching criteria",
          description: "Create reusable profile rules for discovery workflows.",
          unlocked: entitlements.canCreateTemplates,
        },
      ],
    };
  }

  const showBillingTestControls = billingTestControlsEnabled();

  // 4. Pass clean, safely abstracted state to the Client
  return (
    <SettingsClient 
      user={user} 
      initialSettings={settings} 
      planData={billingPlanData}
      billingTestControlsEnabled={showBillingTestControls}
      serviceProfile={serviceProfile}
      tenantId={tenantId}
    />
  );
}
