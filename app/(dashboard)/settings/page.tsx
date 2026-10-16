import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { verifyAndSyncSubscriptionStatus } from "@/app/actions/billing";
import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantSettingsRow } from "@/lib/settings/server";
import { resultEmailsEnabled } from "@/lib/result-email-preference";
import { workspaceDisplayName } from "@/lib/workspace/display-name";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";
import SettingsClient, { type WorkspaceRole } from "./settings-client";
import {
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "@/app/(dashboard)/dashboard/data";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Settings | Arcli",
  description: "Your Arcli account, plan, signal setup and email preferences.",
};

type BillingPlanStatus = NonNullable<NonNullable<WorkspaceBillingCardProps["planData"]>["planStatus"]>;

type SettingsPageProps = {
  searchParams: Promise<{
    billing?: string | string[];
    upgrade?: string | string[];
    recovery?: string | string[];
  }>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const billingReturnState = firstSearchParam(resolvedSearchParams.billing);
  const shouldAutoStartProCheckout = firstSearchParam(resolvedSearchParams.upgrade) === "pro";
  const passwordRecovery = firstSearchParam(resolvedSearchParams.recovery) === "1";
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
  let crawlNotificationEmailsEnabled = false;
  let canReceiveResultEmails = false;
  let workspaceRole: WorkspaceRole = "unknown";
  let emailPreferenceUnavailable = false;
  // Stays undefined when the workspace can't be resolved, so the page shows a
  // load error instead of presenting a paying workspace as Free with Upgrade.
  let billingPlanData: WorkspaceBillingCardProps["planData"];
  let checkoutReturn: "confirming" | "confirmed" | null =
    billingReturnState === "confirmed" ? "confirmed" : null;

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;

    if (billingReturnState === "checkout_complete") {
      let billingSynced = false;

      try {
        // Cache revalidation is not allowed while a page renders; the redirect
        // below already produces a fresh render of this route.
        const result = await verifyAndSyncSubscriptionStatus(tenantId, {
          skipRevalidate: true,
        });
        billingSynced = result.status === "synced" || result.status === "already_synced";
      } catch (error) {
        console.error("[Settings] Billing return verification failed", {
          event: "settings_billing_return_verification_failed",
          tenant_id: tenantId,
          error,
        });
      }

      // redirect() works by throwing, so it must stay outside the try block or
      // the catch above would swallow it. Swapping the query string also stops
      // a refresh from repeating the Dodo lookup, and ?billing=confirmed lets
      // the page say the upgrade worked.
      if (billingSynced) {
        redirect("/settings?billing=confirmed");
      }
      // Not confirmed yet (webhook lag or a failed lookup): say so, and hide
      // Upgrade so the same plan can't be bought twice while it catches up.
      checkoutReturn = "confirming";
    }

    const [
      settingsResult,
      entitlements,
      websiteUrl,
      notificationPreference,
      notificationMembership,
    ] = await Promise.all([
      fetchTenantSettingsRow(tenantSupabase, tenantId),
      getWorkspaceEntitlements(tenantSupabase, tenantId),
      fetchTenantWebsiteUrl(tenantSupabase, tenantId),
      tenantSupabase
        .from("crawl_notification_preferences")
        .select("enabled,opted_in_at,opted_in_email,notice_version")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .maybeSingle(),
      tenantSupabase
        .from("tenant_users")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (notificationMembership.error) {
      console.error("[CRAWL_NOTIFICATION_MEMBERSHIP_FETCH_ERROR]", {
        event: "crawl_notification_membership_fetch_failed",
        tenant_id: tenantId,
        user_id: user.id,
        error: notificationMembership.error,
      });
    } else {
      canReceiveResultEmails = ["owner", "admin"].includes(
        notificationMembership.data?.role?.trim().toLowerCase() ?? "",
      );
      workspaceRole = canReceiveResultEmails ? "admin" : "member";
    }

    if (settingsResult.error) {
      console.error("[SETTINGS_FETCH_ERROR]", settingsResult.error);
    } else {
      settings = buildSettingsSnapshot(settingsResult.data as never, null);
    }

    if (notificationPreference.error) {
      console.error("[CRAWL_NOTIFICATION_PREFERENCE_FETCH_ERROR]", {
        event: "crawl_notification_preference_fetch_failed",
        tenant_id: tenantId,
        user_id: user.id,
        error: notificationPreference.error,
      });
      emailPreferenceUnavailable = true;
    } else {
      crawlNotificationEmailsEnabled = canReceiveResultEmails && resultEmailsEnabled(notificationPreference.data, user.email);
    }

    serviceProfile = await fetchServiceProfile(
      tenantSupabase,
      tenantId,
      websiteUrl ?? settings.workspace.websiteUrl,
    );

    const planTier = entitlements.planTier.toLowerCase();
    // A past-due workspace still has a subscription to repair, so it keeps its
    // own status instead of being shown as canceled and sent to a new checkout.
    const planStatus = (
      entitlements.isPro
        ? entitlements.subscriptionStatus ?? "active"
        : entitlements.isPastDue
          ? "past_due"
          : planTier === "pro"
            ? "canceled"
            : entitlements.subscriptionStatus ?? "free"
    ) as BillingPlanStatus;
    const hasSubscriptionOnFile = entitlements.isPro || entitlements.isPastDue;
    billingPlanData = {
      planName: entitlements.billingLabel,
      planStatus,
      description: entitlements.billingDescription,
      priceText: "$35/month",
      isProTier: hasSubscriptionOnFile,
      isCanceling: entitlements.isCanceling,
      isTrialing: entitlements.isTrialing,
      currentPeriodEnd: entitlements.currentPeriodEnd,
      trialEndsAt: entitlements.trialEndsAt,
      workspaceName: workspaceDisplayName(settings.workspace.companyName),
      entitlements,
      amountDueCents: 3500,
      currency: "USD",
      autoStartCheckout: shouldAutoStartProCheckout && !hasSubscriptionOnFile,
      features: [
        {
          label: "Buyer signals",
          description: "People asking for a tool like yours or an alternative to a competitor, each linked to the post.",
          unlocked: entitlements.canViewCustomerLists,
        },
        {
          label: "Why it matched",
          description: "An AI check explains each signal and drafts a reply you can edit.",
          unlocked: entitlements.canSendEmails,
        },
        {
          label: "Reusable targeting",
          description: "Save targeting rules and reuse them across scans.",
          unlocked: entitlements.canCreateTemplates,
        },
      ],
    };
  }

  return (
    <SettingsClient
      user={user}
      initialSettings={settings}
      initialCrawlNotificationEmailsEnabled={crawlNotificationEmailsEnabled}
      canReceiveResultEmails={canReceiveResultEmails}
      serviceProfile={serviceProfile}
      planData={billingPlanData}
      workspaceUnavailable={"response" in tenantResult}
      workspaceRole={workspaceRole}
      emailPreferenceUnavailable={emailPreferenceUnavailable}
      checkoutReturn={checkoutReturn}
      passwordRecovery={passwordRecovery}
    />
  );
}
