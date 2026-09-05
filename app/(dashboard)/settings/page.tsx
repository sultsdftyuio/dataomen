import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyAndSyncSubscriptionStatus } from "@/app/actions/billing";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { areBillingTestControlsEnabled } from "@/lib/billing/test-controls";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantSettingsRow } from "@/lib/settings/server";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";
import SettingsClient from "./settings-client";
import {
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "@/app/(dashboard)/dashboard/data";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BillingPlanStatus = NonNullable<NonNullable<WorkspaceBillingCardProps["planData"]>["planStatus"]>;

type SettingsPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    upgrade?: string | string[];
  }>;
};

const PRO_QUALIFIED_LEAD_MONTHLY_LIMIT = 500;

function firstSearchParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function fetchCurrentMonthQualifiedLeadUsage(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<number> {
  const cycleStart = new Date();
  cycleStart.setUTCDate(1);
  cycleStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("lead_matches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("match_status", "qualified")
    .gte("created_at", cycleStart.toISOString());

  if (error) {
    console.error("[Settings] Qualified lead usage lookup failed", {
      event: "settings_billing_qualified_lead_usage_failed",
      tenant_id: tenantId,
      cycle_start: cycleStart.toISOString(),
      error,
    });
    return 0;
  }

  return count ?? 0;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const billingReturnState = firstSearchParam(resolvedSearchParams.billing);
  const shouldAutoStartProCheckout = firstSearchParam(resolvedSearchParams.upgrade) === "pro";
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const tenantResult = await resolveTenantContext();
  let settings = buildSettingsSnapshot(null);
  let serviceProfile: ServiceProfileView | null = null;
  let billingPlanData: WorkspaceBillingCardProps["planData"] = {
    planName: "Free Access",
    planStatus: "free",
    description: "Free access includes one discovery domain. Upgrade to Pro to unlock matched leads.",
    priceText: "$35/month",
    isProTier: false,
    amountDueCents: 3500,
    currency: "USD",
  };

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;

    if (billingReturnState === "checkout_complete") {
      try {
        const result = await verifyAndSyncSubscriptionStatus(tenantId);
        if (result.status === "synced" || result.status === "already_synced") {
          redirect("/settings");
        }
      } catch (error) {
        console.error("[Settings] Billing return verification failed", {
          event: "settings_billing_return_verification_failed",
          tenant_id: tenantId,
          error,
        });
      }
    }

    const [settingsResult, entitlements, websiteUrl, qualifiedLeadUsage] = await Promise.all([
      fetchTenantSettingsRow(tenantSupabase, tenantId),
      getWorkspaceEntitlements(tenantSupabase, tenantId),
      fetchTenantWebsiteUrl(tenantSupabase, tenantId),
      fetchCurrentMonthQualifiedLeadUsage(tenantSupabase, tenantId),
    ]);

    if (settingsResult.error) {
      console.error("[SETTINGS_FETCH_ERROR]", settingsResult.error);
    } else {
      settings = buildSettingsSnapshot(settingsResult.data as never, null);
    }

    serviceProfile = await fetchServiceProfile(
      tenantSupabase,
      tenantId,
      websiteUrl ?? settings.workspace.websiteUrl,
    );

    const planTier = entitlements.planTier.toLowerCase();
    const planStatus = (
      entitlements.isPro
        ? entitlements.subscriptionStatus ?? "active"
        : planTier === "pro"
          ? "canceled"
          : entitlements.subscriptionStatus ?? "free"
    ) as BillingPlanStatus;
    billingPlanData = {
      planName: entitlements.billingLabel,
      planStatus,
      description: entitlements.billingDescription,
      priceText: "$35/month",
      isProTier: entitlements.isPro,
      isCanceling: entitlements.isCanceling,
      currentPeriodEnd: entitlements.currentPeriodEnd,
      trialEndsAt: entitlements.trialEndsAt,
      workspaceName: settings.workspace.companyName || "Workspace",
      entitlements,
      qualifiedLeadUsage: {
        discovered: qualifiedLeadUsage,
        limit: PRO_QUALIFIED_LEAD_MONTHLY_LIMIT,
      },
      amountDueCents: 3500,
      currency: "USD",
      autoStartCheckout: shouldAutoStartProCheckout && !entitlements.isPro,
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

  return (
    <SettingsClient
      user={user}
      initialSettings={settings}
      serviceProfile={serviceProfile}
      planData={billingPlanData}
      showBillingTestControls={areBillingTestControlsEnabled()}
    />
  );
}
