"use client";

import React, { useTransition } from "react";
import { CreditCard, CheckCircle2, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { upgradeToProPlan } from "@/app/actions/billing";
import { C } from "@/lib/tokens";

export interface WorkspaceBillingCardProps {
  planData?: {
    planName?: string;
    planStatus?: "active" | "past_due" | "canceled" | "trialing";
    monitoredMrr?: number;
    mrrLimit?: number;
  };
}

export default function WorkspaceBillingCard({
  planData = {
    planName: "Growth Tier",
    planStatus: "active",
    monitoredMrr: 42500,
    mrrLimit: 100000,
  },
}: WorkspaceBillingCardProps) {
  const [isBillingPending, startBillingTransition] = useTransition();

  // Derived Billing & Capacity Metrics
  const monitoredMrr = planData.monitoredMrr || 0;
  const mrrLimit = planData.mrrLimit || 100000;
  const mrrPercentage = Math.min((monitoredMrr / mrrLimit) * 100, 100);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // Enforces Rule 2 (Async Enrichment Boundary) & Section 14 (Stripe Processing)
  const handleManageBilling = () => {
    startBillingTransition(async () => {
      try {
        const { url } = await upgradeToProPlan();
        if (url) {
          window.location.href = url;
        }
      } catch (error: any) {
        toast({
          title: "Billing Error",
          description:
            error.message || "Could not initiate secure checkout session.",
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
            Plan & Recovery Capacity
          </h2>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: planData.planStatus === "active" ? C.green : C.amber,
            background:
              planData.planStatus === "active" ? C.greenPale : C.amberPale,
            padding: "2px 8px",
            borderRadius: 12,
            textTransform: "capitalize",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {planData.planStatus === "active" && <CheckCircle2 size={12} />}
          {planData.planStatus || "Active"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.navy,
              }}
            >
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
            }}
          >
            {isBillingPending ? (
              <>
                <RefreshCw size={12} className="animate-spin" /> Redirecting...
              </>
            ) : (
              "Manage Billing"
            )}
          </button>
        </div>

        {/* Monitored MRR Capacity Meter */}
        <div
          style={{
            background: C.offWhite,
            padding: 12,
            borderRadius: 6,
            border: surfaceBorder,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                color: C.navySoft,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <TrendingUp size={13} color={C.blue} /> Monitored Revenue Capacity
            </span>
            <span style={{ color: C.navy }}>
              {formatCurrency(monitoredMrr)} / {formatCurrency(mrrLimit)}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: 6,
              background: C.rule,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${mrrPercentage}%`,
                height: "100%",
                background: mrrPercentage > 90 ? C.amber : C.blue,
                borderRadius: 3,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}