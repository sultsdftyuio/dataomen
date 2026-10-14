"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useBillingActions } from "./billing-actions";
import { describeBillingPlan, formatBillingDate, type BillingPlanData } from "./billing-plan";

/** Where the person is in the checkout round trip, read from ?billing= by the page. */
export type CheckoutReturn = "confirming" | "confirmed" | null;

type BillingNoticeProps = {
  planData?: BillingPlanData;
  checkoutReturn: CheckoutReturn;
  canManageBilling: boolean;
};

type NoticeFrameProps = {
  tone: "danger" | "info" | "success";
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

const TONE_CLASSES: Record<NoticeFrameProps["tone"], { frame: string; icon: string }> = {
  danger: { frame: "border-danger/30 bg-danger-pale", icon: "text-danger" },
  info: { frame: "border-info/25 bg-info-pale", icon: "text-info" },
  success: { frame: "border-success/25 bg-success-pale", icon: "text-success" },
};

function NoticeFrame({ tone, icon: Icon, title, children, actions }: NoticeFrameProps) {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <section
      aria-labelledby="billing-notice-title"
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5",
        toneClasses.frame,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className={cn("mt-0.5 size-5 shrink-0", toneClasses.icon)}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 id="billing-notice-title" className="text-base leading-6 font-semibold text-foreground">
            {title}
          </h2>
          <div className="mt-0.5 max-w-[64ch] text-sm leading-6 text-navy-soft">{children}</div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8 md:shrink-0 md:pl-0">{actions}</div> : null}
    </section>
  );
}

/**
 * The one billing message that must be seen before anything else on the page:
 * a failed payment, a checkout still being confirmed, or a confirmed upgrade.
 * Renders nothing when billing is in good standing.
 */
export function BillingNotice({ planData, checkoutReturn, canManageBilling }: BillingNoticeProps) {
  const router = useRouter();
  const [isRechecking, startRecheck] = useTransition();
  const billing = useBillingActions();

  if (!planData) return null;
  const plan = describeBillingPlan(planData);

  if (plan.state === "past_due") {
    return (
      <NoticeFrame
        tone="danger"
        icon={AlertTriangle}
        title="Your last payment failed"
        actions={
          canManageBilling ? (
            <Button type="button" onClick={billing.openPortal} disabled={billing.isPending}>
              {billing.pendingAction === "manage" ? (
                <>
                  <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Opening billing…
                </>
              ) : (
                "Update payment method"
              )}
            </Button>
          ) : null
        }
      >
        <p>
          Pro features are paused until the payment method is updated. Your prospects and workspace data are kept.
          {canManageBilling ? null : " Ask a workspace owner or admin to update it."}
        </p>
        {billing.error ? (
          <p role="alert" className="mt-1 font-medium text-danger">
            {billing.error.message}
          </p>
        ) : null}
      </NoticeFrame>
    );
  }

  if (checkoutReturn === "confirming" && (plan.state === "free" || plan.state === "ended")) {
    return (
      <NoticeFrame
        tone="info"
        icon={Clock3}
        title="Confirming your payment"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isRechecking}
              onClick={() => startRecheck(() => router.refresh())}
            >
              {isRechecking ? "Checking…" : "Check again"}
            </Button>
            <Link
              href="/settings"
              className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              I didn&apos;t finish checkout
            </Link>
          </>
        }
      >
        Checkout is finished. We&apos;re waiting for the payment provider to confirm it, which usually takes under a
        minute. Your plan below updates once it does.
      </NoticeFrame>
    );
  }

  if (checkoutReturn === "confirmed" && (plan.state === "active" || plan.state === "trialing")) {
    const trialEnd = formatBillingDate(planData.trialEndsAt) ?? plan.periodEnd;

    return (
      <NoticeFrame
        tone="success"
        icon={CheckCircle2}
        title={plan.state === "trialing" ? "Your Pro trial has started" : "You're on Pro"}
        actions={
          <Link
            href="/settings"
            replace
            scroll={false}
            className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Dismiss
          </Link>
        }
      >
        {plan.state === "trialing" && trialEnd
          ? `Your free trial runs until ${trialEnd}. After that it's $35 a month unless you end it. You can now run prospect scans.`
          : "You can now run prospect scans and review prospects."}
      </NoticeFrame>
    );
  }

  return null;
}
