import type { StatusTone } from "@/components/ui/status-badge";
import type { WorkspaceEntitlements } from "@/lib/entitlements";

export type BillingPlanData = {
  planName?: string;
  planStatus?: "free" | "active" | "past_due" | "canceled" | "cancelled" | "canceling";
  description?: string;
  daysRemaining?: number | null;
  priceText?: string;
  isProTier?: boolean;
  isCanceling?: boolean;
  isTrialing?: boolean;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  workspaceName?: string;
  entitlements?: WorkspaceEntitlements;
  amountDueCents?: number;
  currency?: string;
  features?: Array<{
    label: string;
    description: string;
    unlocked: boolean;
  }>;
  autoStartCheckout?: boolean;
};

/** Which of the plan's states the page is showing. One state, one set of words. */
export type BillingState = "free" | "ended" | "trialing" | "active" | "canceling" | "past_due";

export type BillingPlanView = {
  state: BillingState;
  name: string;
  badge: { tone: StatusTone; label: string } | null;
  summary: string;
  /** A Dodo subscription exists, so the billing portal can open. */
  canOpenPortal: boolean;
  canCancel: boolean;
  /** Formatted end of the paid period, trial or failed payment date. */
  periodEnd: string | null;
};

export function formatBillingDate(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    // "$35 a month", but "$35.50" keeps its cents.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function resolveState(plan: BillingPlanData): BillingState {
  const status = plan.planStatus ?? "free";
  if (status === "past_due") return "past_due";
  if (plan.isProTier) {
    if (plan.isCanceling || status === "canceling") return "canceling";
    return plan.isTrialing ? "trialing" : "active";
  }
  return status === "canceled" || status === "cancelled" ? "ended" : "free";
}

/**
 * Turns the server's plan data into the words and actions the billing card
 * shows. Plan names come from the plan tier, not from entitlements'
 * billingLabel, which mixes plan and status ("Payment Past Due").
 */
export function describeBillingPlan(plan: BillingPlanData): BillingPlanView {
  const state = resolveState(plan);
  const paidName = plan.planName === "Enterprise" ? "Enterprise" : "Pro";
  const periodEnd = formatBillingDate(plan.currentPeriodEnd);
  const trialEnd = formatBillingDate(plan.trialEndsAt) ?? periodEnd;
  const amount = formatAmount(plan.amountDueCents ?? 3500, plan.currency ?? "USD");
  const hasSubscription = state === "active" || state === "trialing" || state === "canceling" || state === "past_due";

  const base = {
    state,
    canOpenPortal: hasSubscription,
    canCancel: state === "active" || state === "trialing" || state === "past_due",
    periodEnd,
  };

  switch (state) {
    case "trialing":
      return {
        ...base,
        name: paidName,
        badge: { tone: "info", label: "Free trial" },
        summary: trialEnd
          ? `Free trial until ${trialEnd}. Then ${amount} a month unless you end it before that date.`
          : `Free trial. Then ${amount} a month unless you end it.`,
      };
    case "active":
      return {
        ...base,
        name: paidName,
        badge: { tone: "success", label: "Active" },
        summary: periodEnd
          ? `${amount} a month, billed in USD. Next payment on ${periodEnd}.`
          : `${amount} a month, billed in USD.`,
      };
    case "canceling":
      return {
        ...base,
        name: paidName,
        badge: { tone: "warning", label: "Won't renew" },
        summary: periodEnd
          ? `Pro stays available until ${periodEnd}. No further payments are scheduled.`
          : "Pro stays available until the end of this billing period. No further payments are scheduled.",
      };
    case "past_due":
      return {
        ...base,
        name: paidName,
        badge: { tone: "danger", label: "Payment failed" },
        summary: periodEnd
          ? `The payment due on ${periodEnd} didn't go through. Pro features are paused until the payment method is updated.`
          : "The last payment didn't go through. Pro features are paused until the payment method is updated.",
      };
    case "ended":
      return {
        ...base,
        name: "Free",
        badge: null,
        summary: "Your Pro subscription has ended. Upgrade to search for prospects again.",
      };
    default:
      return {
        ...base,
        name: "Free",
        badge: null,
        summary: "Free prepares your targeting brief from your website. Pro searches public conversations for prospects and lets you review them.",
      };
  }
}
