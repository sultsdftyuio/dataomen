// components/settings/workspace_page/workspace-billing-card.tsx
"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  upgradeToProPlan,
  manageBillingPortal,
  cancelProPlan,
  resumeSubscription,
} from "@/app/actions/billing";
import { WorkspacePlanBadge } from "@/components/dashboard/WorkspacePlanBadge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { WorkspaceEntitlements } from "@/lib/entitlements";
import { C } from "@/lib/tokens";

export interface WorkspaceBillingCardProps {
  planData?: {
    planName?: string;
    planStatus?: "free" | "active" | "past_due" | "canceled" | "cancelled" | "trialing" | "canceling";
    description?: string;
    daysRemaining?: number | null;
    priceText?: string;
    isProTier?: boolean;
    isCanceling?: boolean;
    currentPeriodEnd?: string | null;
    workspaceName?: string;
    entitlements?: WorkspaceEntitlements;
    qualifiedLeadUsage?: {
      discovered: number;
      limit: number;
    };
    amountDueCents?: number;
    currency?: string;
    features?: Array<{
      label: string;
      description: string;
      unlocked: boolean;
    }>;
  };
}

type PendingBillingAction = "manage" | "upgrade" | "cancel" | "resume" | null;

function formatBillingDate(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatAmountDue(
  amountDueCents: number,
  currency: string,
  nextBillingDate: string | null | undefined
): string | null {
  const formattedDate = formatBillingDate(nextBillingDate);
  if (!formattedDate) return null;

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountDueCents / 100);

  return `${amount} due on ${formattedDate}`;
}

const DEFAULT_PRO_FEATURES = [
  {
    label: "Verified prospect queue",
    description: "Review the prospects most aligned with your service profile.",
    unlocked: false,
  },
  {
    label: "Lead qualification signals",
    description: "Inspect why each lead matched your audience and pain criteria.",
    unlocked: false,
  },
  {
    label: "Reusable matching criteria",
    description: "Create and reuse profile rules for discovery workflows.",
    unlocked: false,
  },
];

export default function WorkspaceBillingCard({
  planData = {
    planName: "Free Access",
    planStatus: "free",
    description: "Restricted Free Access. Pro features are locked until you start the Pro trial.",
    priceText: "$29/month after the 3-day trial",
    isProTier: false,
  },
}: WorkspaceBillingCardProps) {
  const router = useRouter();
  const [isBillingPending, startBillingTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingBillingAction>(null);
  const planStatus = planData.planStatus ?? "free";
  const planName = planData.planName ?? "Free Access";
  const priceText = planData.priceText ?? "$29/month after the 3-day trial";
  const isCanceling = planData.isCanceling ?? planStatus === "canceling";
  const formattedPeriodEnd = formatBillingDate(planData.currentPeriodEnd);
  const activeUntilText = `Active until ${formattedPeriodEnd ?? "the end of the current billing period"}`;
  const amountDueText = formatAmountDue(
    planData.amountDueCents ?? 2900,
    planData.currency ?? "USD",
    planData.currentPeriodEnd
  );
  const canOpenPortal =
    planData.isProTier === true &&
    ["active", "trialing", "past_due", "canceling"].includes(planStatus);
  const canCancelPlan =
    planData.isProTier === true &&
    ["active", "trialing", "past_due"].includes(planStatus) &&
    !isCanceling;
  const hasOpenProAccess =
    planStatus === "active" || planStatus === "trialing" || isCanceling;
  const planDescription =
    isCanceling
      ? activeUntilText
      : planData.description ??
        (planStatus === "trialing"
          ? "3-day Pro trial active. $29/month after the trial."
          : planStatus === "active"
            ? "Pro billing active at $29/month."
            : "Restricted Free Access. Pro features are locked until you start the Pro trial.");
  const proFeatures =
    planData.features ??
    DEFAULT_PRO_FEATURES.map((feature) => ({
      ...feature,
      unlocked: hasOpenProAccess,
    }));
  const unlockedFeatureCount = proFeatures.filter((feature) => feature.unlocked).length;
  const actionLabel = canOpenPortal ? "Manage Billing" : "Upgrade";
  const usage = planData.qualifiedLeadUsage;
  const usagePercent = usage
    ? Math.min(100, Math.round((usage.discovered / Math.max(usage.limit, 1)) * 100))
    : 0;

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Enforces Rule 2 (Async Enrichment Boundary)
  const handleManageBilling = () => {
    setPendingAction(canOpenPortal ? "manage" : "upgrade");
    startBillingTransition(async () => {
      try {
        // Route Dodo-linked Pro workspaces to the portal, others to checkout.
        const result = canOpenPortal
          ? await manageBillingPortal()
          : await upgradeToProPlan();

        if (result.url) {
          window.location.assign(result.url);
          return;
        }

        if (result.status === "already_active") {
          toast({
            title: "Subscription Active",
            description: "Your workspace is already upgraded to Pro.",
          });
          router.refresh();
          return;
        }
      } catch (error: any) {
        const message = error?.message || "Could not initiate billing session.";

        // Graceful handling if the backend catches a duplicate checkout attempt
        if (message.includes("already has an active subscription")) {
          toast({
            title: "Subscription Active",
            description: "Your workspace is already upgraded to Pro.",
          });
          return;
        }

        toast({
          title: "Billing Error",
          description: message,
          variant: "destructive",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleCancelPlan = () => {
    const confirmed = window.confirm(
      "Cancel your Pro plan at the end of the current billing period? Pro features will stay open until then."
    );

    if (!confirmed) return;

    setPendingAction("cancel");
    startBillingTransition(async () => {
      try {
        const result = await cancelProPlan();

        toast({
          title: result.status === "already_canceled" ? "Cancellation Already Scheduled" : "Plan Cancellation Scheduled",
          description:
            result.currentPeriodEnd
              ? "Your Pro access remains open until the current billing period ends."
              : "Your Pro access remains open until the current billing period ends.",
        });

        router.refresh();
      } catch (error: any) {
        toast({
          title: "Cancellation Failed",
          description: error?.message || "Could not cancel your plan. Please try again.",
          variant: "destructive",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleResumeSubscription = () => {
    setPendingAction("resume");
    startBillingTransition(async () => {
      try {
        const result = await resumeSubscription();

        toast({
          title: result.status === "already_resumed" ? "Subscription Active" : "Subscription Resumed",
          description: "Your Pro subscription will continue without interruption.",
        });
        router.refresh();
      } catch (error: any) {
        toast({
          title: "Could Not Resume Subscription",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <section
      style={{
        background: C.white,
        borderRadius: 8,
        border: surfaceBorder,
        boxShadow: surfaceShadow,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${C.rule}`,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <CreditCard size={16} color={C.blue} />
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: C.navySoft,
                margin: 0,
              }}
            >
              Plan & Billing
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span
                style={{
                  color: C.navy,
                  fontSize: 12,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {planData.workspaceName ?? "Workspace"}
              </span>
              {planData.entitlements ? (
                <WorkspacePlanBadge entitlements={planData.entitlements} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            Current status
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
            {planName}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {planDescription}
          </div>
          <div style={{ fontSize: 11, color: C.navySoft, marginTop: 4, fontWeight: 600 }}>
            {isCanceling ? amountDueText ?? priceText : priceText}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={isBillingPending}
            style={{
              height: 28,
              padding: "0 12px",
              background: C.offWhite,
              color: C.navy,
              border: surfaceBorder,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: isBillingPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            {isBillingPending && pendingAction === (canOpenPortal ? "manage" : "upgrade") ? (
              <>
                <Spinner className="size-3" /> {canOpenPortal ? "Opening..." : "Upgrading..."}
              </>
            ) : (
              actionLabel
            )}
          </button>

          {canCancelPlan && (
            <button
              type="button"
              onClick={handleCancelPlan}
              disabled={isBillingPending}
              style={{
                height: 28,
                padding: "0 12px",
                background: "#FFF7ED",
                color: "#B45309",
                border: "1px solid #FED7AA",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: isBillingPending ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              {isBillingPending && pendingAction === "cancel" ? (
                <>
                  <Spinner className="size-3" /> Canceling...
                </>
              ) : (
                <>
                  <XCircle size={12} /> Cancel Plan
                </>
              )}
            </button>
          )}

          {isCanceling && (
            <button
              type="button"
              onClick={handleResumeSubscription}
              disabled={isBillingPending}
              style={{
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                color: C.white,
                background: C.blue,
                border: `1px solid ${C.blue}`,
                borderRadius: 6,
                padding: "0 12px",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: isBillingPending ? "not-allowed" : "pointer",
                gap: 6,
              }}
            >
              {isBillingPending && pendingAction === "resume" ? (
                <>
                  <Spinner className="size-3" /> Resuming...
                </>
              ) : (
                "Resume Subscription"
              )}
            </button>
          )}
        </div>
      </div>

      {usage ? (
        <div
          style={{
            borderTop: `1px solid ${C.rule}`,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          <div
            style={{
              color: C.navy,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {new Intl.NumberFormat("en-US").format(usage.discovered)} / {new Intl.NumberFormat("en-US").format(usage.limit)} Qualified Leads Discovered
          </div>
          <Progress value={usagePercent} aria-label="Qualified leads discovered this month" />
        </div>
      ) : null}

      <div
        style={{
          borderTop: `1px solid ${C.rule}`,
          paddingTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
              Pro feature access
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {unlockedFeatureCount} of {proFeatures.length} workspace features unlocked
            </div>
          </div>
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: 11,
              fontWeight: 700,
              color: hasOpenProAccess ? C.green : C.navySoft,
              background: hasOpenProAccess ? C.greenPale : C.offWhite,
              border: `1px solid ${hasOpenProAccess ? "rgba(16,185,129,0.2)" : C.rule}`,
              padding: "2px 8px",
              borderRadius: 12,
              whiteSpace: "nowrap",
            }}
          >
            {hasOpenProAccess ? "Unlocked" : "Locked"}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {proFeatures.map((feature) => (
            <div
              key={feature.label}
              style={{
                display: "grid",
                gridTemplateColumns: "16px minmax(0, 1fr) auto",
                alignItems: "start",
                gap: 8,
                padding: "8px 0",
              }}
            >
              {feature.unlocked ? (
                <CheckCircle2 size={14} color={C.green} style={{ marginTop: 1 }} />
              ) : (
                <LockKeyhole size={14} color={C.faint} style={{ marginTop: 1 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>
                  {feature.label}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, lineHeight: 1.35 }}>
                  {feature.description}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: feature.unlocked ? C.green : C.faint,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  paddingTop: 1,
                }}
              >
                {feature.unlocked ? "Open" : "Pro"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
