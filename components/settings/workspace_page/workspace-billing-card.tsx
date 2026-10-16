"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SettingsSection } from "@/components/settings/settings-section";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";

import { useBillingActions } from "./billing-actions";
import { describeBillingPlan, type BillingPlanData, type BillingPlanView } from "./billing-plan";

export interface WorkspaceBillingCardProps {
  planData?: BillingPlanData;
  /**
   * Owners and admins only. Every billing server action refuses anyone else,
   * so members see the plan without controls they can't use.
   */
  canManageBilling?: boolean;
  /** Back from checkout but the payment isn't confirmed yet: hide Upgrade so it can't be bought twice. */
  checkoutConfirming?: boolean;
}

const FREE_PLAN: BillingPlanData = { planName: "Free", planStatus: "free", isProTier: false };

const DEFAULT_PRO_FEATURES = [
  { label: "Buyer signals", description: "People asking for a tool like yours or an alternative to a competitor, each linked to the post.", unlocked: false },
  { label: "Why it matched", description: "An AI check explains each signal and drafts a reply you can edit.", unlocked: false },
  { label: "Reusable targeting", description: "Save targeting rules and reuse them across scans.", unlocked: false },
];

export default function WorkspaceBillingCard({
  planData = FREE_PLAN,
  canManageBilling = true,
  checkoutConfirming = false,
}: WorkspaceBillingCardProps) {
  const plan = describeBillingPlan(planData);
  const billing = useBillingActions();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const autoCheckoutAttempted = useRef(false);
  const { openCheckout } = billing;

  // ?upgrade=pro from a pricing link starts checkout once, for workspaces
  // without a subscription. The server already drops it for paying ones.
  useEffect(() => {
    if (!planData.autoStartCheckout || plan.canOpenPortal || !canManageBilling || autoCheckoutAttempted.current) {
      return;
    }
    autoCheckoutAttempted.current = true;
    openCheckout();
  }, [canManageBilling, openCheckout, plan.canOpenPortal, planData.autoStartCheckout]);

  const showsUpgrade = plan.state === "free" || plan.state === "ended";
  const features = planData.features ?? DEFAULT_PRO_FEATURES;
  const pageError = billing.error && billing.error.action !== "cancel" ? billing.error : null;
  const cancelError = billing.error?.action === "cancel" ? billing.error : null;

  return (
    <SettingsSection id="billing" title="Plan and billing" description="This workspace's plan and payments.">
      <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:justify-between md:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg leading-7 font-semibold text-foreground">{plan.name}</p>
            {plan.badge ? <StatusBadge tone={plan.badge.tone}>{plan.badge.label}</StatusBadge> : null}
          </div>
          <p className="mt-1 max-w-[56ch] text-sm leading-6 text-muted-foreground">{plan.summary}</p>
          {canManageBilling ? null : (
            <p className="mt-1 text-sm leading-6 text-subtle">Only workspace owners and admins can change billing.</p>
          )}
        </div>

        {canManageBilling ? (
          <BillingControls
            plan={plan}
            billing={billing}
            showsUpgrade={showsUpgrade}
            checkoutConfirming={checkoutConfirming}
            onEndSubscription={() => {
              billing.clearError();
              setIsCancelDialogOpen(true);
            }}
          />
        ) : null}
      </div>

      {pageError ? (
        <p role="alert" className="px-4 py-3 text-sm leading-6 text-danger md:px-5">
          {pageError.message}
        </p>
      ) : null}

      {showsUpgrade ? (
        <div className="px-4 py-4 md:px-5">
          <h3 className="text-sm leading-6 font-semibold text-foreground">What Pro adds</h3>
          <ul className="mt-2 grid gap-2.5">
            {features.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2.5">
                <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">{feature.label}.</span> {feature.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog
        open={isCancelDialogOpen}
        onOpenChange={(open) => {
          // Keep the dialog up while the request runs so its outcome stays in view.
          if (!billing.isPending) setIsCancelDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End your Pro subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan.periodEnd
                ? `It won't renew. Pro stays available until ${plan.periodEnd}, and you can resume it any time before then.`
                : "It won't renew. Pro stays available until the end of this billing period, and you can resume it any time before then."}{" "}
              Your signals and workspace data are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelError ? (
            <p role="alert" className="rounded-md border border-danger/25 bg-danger-pale px-3 py-2 text-sm leading-6 text-danger">
              {cancelError.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={billing.isPending}>Keep Pro</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={billing.isPending}
              onClick={() => billing.cancelSubscription(() => setIsCancelDialogOpen(false))}
            >
              {billing.pendingAction === "cancel" ? (
                <>
                  <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Ending subscription…
                </>
              ) : (
                "End subscription"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

type BillingControlsProps = {
  plan: BillingPlanView;
  billing: ReturnType<typeof useBillingActions>;
  showsUpgrade: boolean;
  checkoutConfirming: boolean;
  onEndSubscription: () => void;
};

/** The plan's actions: one primary per state, the rest quieter. */
function BillingControls({ plan, billing, showsUpgrade, checkoutConfirming, onEndSubscription }: BillingControlsProps) {
  const { isPending, pendingAction } = billing;

  if (showsUpgrade) {
    if (checkoutConfirming) {
      return <StatusBadge tone="progress">Confirming your payment</StatusBadge>;
    }
    return (
      <div className="flex flex-col items-start gap-2 md:max-w-[20rem] md:shrink-0 md:items-end md:text-right">
        <Button type="button" onClick={billing.openCheckout} disabled={isPending}>
          {pendingAction === "upgrade" ? <PendingLabel>Opening checkout…</PendingLabel> : "Upgrade to Pro"}
        </Button>
        <p className="text-xs leading-5 text-subtle">{PRO_PRICE_NOTE}</p>
      </div>
    );
  }

  const opensPortalAsPrimary = plan.state === "past_due";
  const portalLabel = opensPortalAsPrimary ? "Update payment method" : "Manage billing";

  return (
    <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
      {plan.state === "canceling" ? (
        <Button type="button" onClick={billing.resume} disabled={isPending}>
          {pendingAction === "resume" ? <PendingLabel>Resuming…</PendingLabel> : "Resume subscription"}
        </Button>
      ) : null}
      {plan.canOpenPortal ? (
        <Button
          type="button"
          variant={opensPortalAsPrimary ? "default" : "outline"}
          onClick={billing.openPortal}
          disabled={isPending}
        >
          {pendingAction === "manage" ? <PendingLabel>Opening billing…</PendingLabel> : portalLabel}
        </Button>
      ) : null}
      {plan.canCancel ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onEndSubscription}
          disabled={isPending}
          className="text-muted-foreground hover:text-danger"
        >
          End subscription
        </Button>
      ) : null}
    </div>
  );
}

function PendingLabel({ children }: { children: string }) {
  return (
    <>
      <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> {children}
    </>
  );
}
