"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  cancelProPlan,
  manageBillingPortal,
  resumeSubscription,
  upgradeToProPlan,
} from "@/app/actions/billing";
import { toast } from "@/components/ui/use-toast";

export type BillingAction = "manage" | "upgrade" | "cancel" | "resume";

export type BillingActionError = {
  action: BillingAction;
  message: string;
};

const SUPPORT_HINT = "If it keeps happening, email support@arcli.tech.";

// Written copy for every failure. Server action messages are logged and never
// shown: production builds replace them with an opaque digest anyway, and the
// ones that do arrive are written for operators, not customers.
const FAILURE_COPY: Record<BillingAction, string> = {
  manage: `Couldn't open billing. Try again. ${SUPPORT_HINT}`,
  upgrade: `Couldn't open checkout. Try again. ${SUPPORT_HINT}`,
  cancel: `Couldn't end your subscription, so nothing has changed. Try again. ${SUPPORT_HINT}`,
  resume: `Couldn't resume your subscription, so it still ends on schedule. Try again. ${SUPPORT_HINT}`,
};

const ADMIN_ONLY_COPY = "Only workspace owners and admins can change billing. Ask an owner to do this.";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

function failureMessage(action: BillingAction, error: unknown): string {
  // requireWorkspaceBillingAdmin's refusal survives in development builds;
  // the settings page also hides these controls from members up front.
  return errorText(error).includes("owners and admins") ? ADMIN_ONLY_COPY : FAILURE_COPY[action];
}

function formatAccessEnd(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/**
 * The four billing actions with one pending state and one inline error, shared
 * by the plan card and the page-level payment notice so both behave the same.
 */
export function useBillingActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<BillingAction | null>(null);
  const [error, setError] = useState<BillingActionError | null>(null);

  const run = useCallback(
    (action: BillingAction, task: () => Promise<void>) => {
      setError(null);
      setPendingAction(action);
      startTransition(async () => {
        try {
          await task();
        } catch (caught) {
          console.error(`[Billing] ${action} failed`, caught);
          setError({ action, message: failureMessage(action, caught) });
        } finally {
          setPendingAction(null);
        }
      });
    },
    [],
  );

  const showAlreadyActive = useCallback(() => {
    toast({ title: "Pro is already active", description: "This workspace is already on Pro." });
    router.replace("/settings");
    router.refresh();
  }, [router]);

  const openCheckout = useCallback(() => {
    run("upgrade", async () => {
      try {
        const result = await upgradeToProPlan();
        if (result.url) {
          window.location.assign(result.url);
          return;
        }
        if (result.status === "already_active") showAlreadyActive();
      } catch (caught) {
        // The duplicate-checkout guard means a subscription already exists.
        if (errorText(caught).includes("already has an active subscription")) {
          showAlreadyActive();
          return;
        }
        throw caught;
      }
    });
  }, [run, showAlreadyActive]);

  const openPortal = useCallback(() => {
    run("manage", async () => {
      const result = await manageBillingPortal();
      if (result.url) window.location.assign(result.url);
    });
  }, [run]);

  const cancelSubscription = useCallback(
    (onDone?: () => void) => {
      run("cancel", async () => {
        const result = await cancelProPlan();
        const accessEnd = formatAccessEnd(result.currentPeriodEnd);
        toast({
          title: "Your subscription won't renew",
          description: accessEnd
            ? `Pro stays available until ${accessEnd}.`
            : "Pro stays available until the end of this billing period.",
        });
        onDone?.();
        router.refresh();
      });
    },
    [router, run],
  );

  const resume = useCallback(() => {
    run("resume", async () => {
      await resumeSubscription();
      toast({ title: "Subscription resumed", description: "Pro will renew as usual." });
      router.refresh();
    });
  }, [router, run]);

  return {
    isPending,
    pendingAction: isPending ? pendingAction : null,
    error,
    clearError: () => setError(null),
    openCheckout,
    openPortal,
    cancelSubscription,
    resume,
  };
}
