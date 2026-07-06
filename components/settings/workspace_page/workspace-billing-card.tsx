// components/settings/workspace_page/workspace-billing-card.tsx
"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CreditCard, CheckCircle2, LockKeyhole, RefreshCw, XCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { upgradeToProPlan, manageBillingPortal, cancelProPlan } from "@/app/actions/billing";
import { C } from "@/lib/tokens";

export interface WorkspaceBillingCardProps {
  planData?: {
    planName?: string;
    planStatus?: "free" | "active" | "past_due" | "canceled" | "cancelled" | "trialing" | "canceling";
    description?: string;
    daysRemaining?: number | null;
    priceText?: string;
    isProTier?: boolean;
    features?: Array<{
      label: string;
      description: string;
      unlocked: boolean;
    }>;
  };
}

const DEFAULT_PRO_FEATURES = [
  {
    label: "Risk queue customer lists",
    description: "View customers that need recovery attention.",
    unlocked: false,
  },
  {
    label: "Campaign sending",
    description: "Send recovery emails to selected cohorts.",
    unlocked: false,
  },
  {
    label: "Custom templates",
    description: "Create and reuse recovery messaging templates.",
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
  const planStatus = planData.planStatus ?? "free";
  const planName = planData.planName ?? "Free Access";
  const priceText = planData.priceText ?? "$29/month after the 3-day trial";
  const canOpenPortal =
    planData.isProTier === true &&
    ["active", "trialing", "past_due", "canceling"].includes(planStatus);
  const isCancellationScheduled = planStatus === "canceling";
  const canCancelPlan =
    planData.isProTier === true &&
    ["active", "trialing", "past_due"].includes(planStatus);
  const hasOpenProAccess =
    planStatus === "active" || planStatus === "trialing" || planStatus === "canceling";
  const statusTone =
    planStatus === "past_due" || isCancellationScheduled
      ? { color: "#B45309", background: C.amberPale }
      : hasOpenProAccess
        ? { color: C.green, background: C.greenPale }
        : planStatus === "canceled" || planStatus === "cancelled"
          ? { color: "#B91C1C", background: "#FEE2E2" }
          : { color: C.navySoft, background: C.offWhite };
  const planDescription =
    planData.description ??
    (planStatus === "trialing"
      ? "3-day Pro trial active. $29/month after the trial."
      : planStatus === "canceling"
        ? "Plan cancellation is scheduled. Pro features stay open until the current billing period ends."
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
  const actionLabel = isBillingPending
    ? "Redirecting..."
    : canOpenPortal
      ? "Manage Billing"
      : "Start 3-Day Pro Trial";

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Enforces Rule 2 (Async Enrichment Boundary)
  const handleManageBilling = () => {
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
      }
    });
  };

  const handleCancelPlan = () => {
    const confirmed = window.confirm(
      "Cancel your Pro plan at the end of the current billing period? Pro features will stay open until then."
    );

    if (!confirmed) return;

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CreditCard size={16} color={C.blue} />
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
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: statusTone.color,
            background: statusTone.background,
            padding: "2px 8px",
            borderRadius: 12,
            textTransform: "capitalize",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {isCancellationScheduled ? (
            <AlertCircle size={12} />
          ) : (
            hasOpenProAccess && <CheckCircle2 size={12} />
          )}
          {planStatus.replace("_", " ")}
        </span>
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
            {priceText}
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
            {isBillingPending ? (
              <>
                <RefreshCw size={12} className="animate-spin" /> {actionLabel}
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
              <XCircle size={12} />
              Cancel Plan
            </button>
          )}

          {isCancellationScheduled && (
            <span
              style={{
                minHeight: 28,
                display: "inline-flex",
                alignItems: "center",
                color: "#B45309",
                background: C.amberPale,
                border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 6,
                padding: "0 10px",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Cancellation scheduled
            </span>
          )}
        </div>
      </div>

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
