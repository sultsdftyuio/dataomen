"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, CheckCircle2, RefreshCw } from "lucide-react";

import { setBillingTestState } from "@/app/actions/billing";
import { toast } from "@/components/ui/use-toast";
import { C } from "@/lib/tokens";

type BillingTestOption = {
  state: string;
  label: string;
  detail: string;
};

interface BillingTestSwitcherProps {
  currentStatus?: string | null;
}

const TEST_STATES: BillingTestOption[] = [
  {
    state: "free",
    label: "Free",
    detail: "Locked",
  },
  {
    state: "trialing",
    label: "Trialing",
    detail: "3 days",
  },
  {
    state: "active",
    label: "Active",
    detail: "Pro open",
  },
  {
    state: "canceling",
    label: "Canceling",
    detail: "Pro open",
  },
  {
    state: "past_due",
    label: "Past Due",
    detail: "Locked",
  },
  {
    state: "canceled",
    label: "Canceled",
    detail: "Locked",
  },
];

export default function BillingTestSwitcher({
  currentStatus = "free",
}: BillingTestSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const normalizedCurrentStatus = currentStatus?.toLowerCase() ?? "free";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  const handleSelectState = (state: string) => {
    startTransition(async () => {
      try {
        const result = await setBillingTestState(state);

        toast({
          title: "Billing Test State Updated",
          description: `Workspace is now ${result.subscriptionStatus.replace("_", " ")}.`,
        });

        router.refresh();
      } catch (error: any) {
        toast({
          title: "Billing Test Update Failed",
          description: error?.message || "Could not update the workspace billing state.",
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
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Bug size={15} color={C.amber} />
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: C.navySoft,
                margin: 0,
              }}
            >
              Billing Test State
            </h3>
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0", lineHeight: 1.35 }}>
              Local entitlement override. Dodo IDs are preserved.
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#B45309",
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: 12,
            padding: "2px 7px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          Testing only
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Billing test state"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {TEST_STATES.map((option) => {
          const isSelected = normalizedCurrentStatus === option.state;

          return (
            <button
              key={option.state}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-pressed={isSelected}
              disabled={isPending}
              onClick={() => handleSelectState(option.state)}
              style={{
                minHeight: 42,
                padding: "7px 9px",
                borderRadius: 6,
                border: isSelected ? `1px solid ${C.blue}` : surfaceBorder,
                background: isSelected ? C.blueTint : C.white,
                color: isSelected ? C.navy : C.navySoft,
                cursor: isPending ? "not-allowed" : "pointer",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 8,
                textAlign: "left",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>
                  {option.label}
                </span>
                <span style={{ display: "block", fontSize: 10, color: C.muted, marginTop: 1 }}>
                  {option.detail}
                </span>
              </span>
              {isPending && isSelected ? (
                <RefreshCw size={13} className="animate-spin" color={C.blue} />
              ) : (
                isSelected && <CheckCircle2 size={13} color={C.blue} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
