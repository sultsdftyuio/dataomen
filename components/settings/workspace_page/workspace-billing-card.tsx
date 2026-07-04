// components/settings/workspace_page/workspace-billing-card.tsx
"use client";

import React, { useTransition } from "react";
import { CreditCard, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { upgradeToProPlan, manageBillingPortal } from "@/app/actions/billing";
import { C } from "@/lib/tokens";

export interface WorkspaceBillingCardProps {
  planData?: {
    planName?: string;
    planStatus?: "free" | "active" | "past_due" | "canceled" | "cancelled" | "trialing";
    description?: string;
    daysRemaining?: number | null;
    priceText?: string;
    isProTier?: boolean;
  };
}

export default function WorkspaceBillingCard({
  planData = {
    planName: "Free Access",
    planStatus: "free",
    description: "Restricted Free Access. Pro features are locked until you start the Pro trial.",
    priceText: "$29/month after the 3-day trial",
    isProTier: false,
  },
}: WorkspaceBillingCardProps) {
  const [isBillingPending, startBillingTransition] = useTransition();
  const planStatus = planData.planStatus ?? "free";
  const planName = planData.planName ?? "Free Access";
  const priceText = planData.priceText ?? "$29/month after the 3-day trial";
  const canOpenPortal =
    planData.isProTier === true &&
    ["active", "trialing", "past_due"].includes(planStatus);
  const isHealthySubscriber = planStatus === "active" || planStatus === "trialing";
  const statusTone =
    planStatus === "past_due"
      ? { color: "#B45309", background: C.amberPale }
      : isHealthySubscriber
        ? { color: C.green, background: C.greenPale }
        : planStatus === "canceled" || planStatus === "cancelled"
          ? { color: "#B91C1C", background: "#FEE2E2" }
          : { color: C.navySoft, background: C.offWhite };
  const planDescription =
    planData.description ??
    (planStatus === "trialing"
      ? "3-day Pro trial active. $29/month after the trial."
      : planStatus === "active"
        ? "Pro billing active at $29/month."
        : "Restricted Free Access. Pro features are locked until you start the Pro trial.");
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
        const { url } = canOpenPortal
          ? await manageBillingPortal()
          : await upgradeToProPlan();

        if (url) {
          window.location.assign(url);
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
          {isHealthySubscriber && <CheckCircle2 size={12} />}
          {planStatus.replace("_", " ")}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div>
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
      </div>
    </section>
  );
}
