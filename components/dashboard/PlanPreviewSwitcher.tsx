"use client";

import { useTransition } from "react";
import { CheckCircle2, FlaskConical, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { setBillingTestState } from "@/app/actions/billing";
import { toast } from "@/components/ui/use-toast";
import { C } from "@/lib/tokens";

type PlanPreviewSwitcherProps = {
  activePlan: "free" | "pro";
};

const plans = [
  {
    id: "free",
    label: "Free",
    detail: "Preview the locked desk",
    state: "free",
  },
  {
    id: "pro",
    label: "Pro trial",
    detail: "Preview full access",
    state: "active",
  },
] as const;

export function PlanPreviewSwitcher({ activePlan }: PlanPreviewSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchPlan = (state: "free" | "active", label: string) => {
    startTransition(async () => {
      try {
        await setBillingTestState(state);
        toast({
          title: `${label} preview enabled`,
          description: "The dashboard has refreshed with the selected access level.",
        });
        router.refresh();
      } catch (error: unknown) {
        toast({
          title: "Could not switch preview",
          description:
            error instanceof Error
              ? error.message
              : "Please try switching the plan preview again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <section
      aria-label="Temporary plan preview"
      className="flex items-center gap-1 rounded-lg border p-1"
      style={{ borderColor: C.rule, backgroundColor: C.white }}
    >
      <span className="hidden items-center gap-1 px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] md:inline-flex" style={{ color: C.muted }}>
        <FlaskConical className="size-3" style={{ color: C.amber }} aria-hidden="true" /> Preview
      </span>
      {plans.map((plan) => {
        const isActive = activePlan === plan.id;

        return (
          <button
            key={plan.id}
            type="button"
            disabled={isPending || isActive}
            aria-pressed={isActive}
            onClick={() => switchPlan(plan.state, plan.label)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold transition-colors disabled:cursor-default"
            style={{
              color: isActive ? (plan.id === "pro" ? C.white : C.navy) : C.navySoft,
              backgroundColor: isActive ? (plan.id === "pro" ? C.blue : C.offWhite) : "transparent",
              boxShadow: isActive ? "0 1px 3px rgba(10,22,40,0.08)" : "none",
            }}
          >
            {plan.id === "pro" ? (
              <Sparkles className="size-3" aria-hidden="true" />
            ) : isActive ? (
              <CheckCircle2 className="size-3" style={{ color: C.green }} aria-hidden="true" />
            ) : null}
            <span>{plan.label}</span>
            <span className="sr-only"> — {plan.detail}</span>
          </button>
        );
      })}
    </section>
  );
}
