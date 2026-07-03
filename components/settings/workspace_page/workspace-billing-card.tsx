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
    planStatus?: "active" | "past_due" | "canceled" | "trialing";
  };
}

export default function WorkspaceBillingCard({
  planData = {
    planName: "Growth Tier",
    planStatus: "active",
  },
}: WorkspaceBillingCardProps) {
  const [isBillingPending, startBillingTransition] = useTransition();
  const isActiveSubscriber = planData.planStatus === "active";

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Enforces Rule 2 (Async Enrichment Boundary)
  const handleManageBilling = () => {
    startBillingTransition(async () => {
      try {
        // FORK: Route active paying workspaces to the portal, others to upgrade checkout
        const { url } = isActiveSubscriber
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
            color: isActiveSubscriber ? C.green : C.amber,
            background: isActiveSubscriber ? C.greenPale : C.amberPale,
            padding: "2px 8px",
            borderRadius: 12,
            textTransform: "capitalize",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {isActiveSubscriber && <CheckCircle2 size={12} />}
          {planData.planStatus || "Active"}
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
            {planData.planName}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            Automated churn risk scoring & retention workflows.
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
              <RefreshCw size={12} className="animate-spin" /> Redirecting...
            </>
          ) : isActiveSubscriber ? (
            "Manage Billing"
          ) : (
            "Upgrade Plan"
          )}
        </button>
      </div>
    </section>
  );
}