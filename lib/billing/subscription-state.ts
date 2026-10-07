import type { Database } from "@/types/supabase";

import { resolvePaidAccessEnd } from "./cancellation-access";
import {
  compact,
  extractCurrentPeriodEnd,
  extractCustomerId,
  extractSubscriptionId,
  readBoolean,
  readNumber,
  readString,
  type DodoRecord,
} from "./dodo-payload";

export type TenantBillingUpdate = Database["public"]["Tables"]["tenants"]["Update"];

/** The tenant columns that billing reads before deciding what to write. */
export type TenantBillingSnapshot = {
  plan_tier?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  billing_status?: string | null;
  plan?: string | null;
  status?: string | null;
  dodo_customer_id?: string | null;
  dodo_subscription_id?: string | null;
  current_period_end?: string | null;
};

export type SubscriptionLifecycle = "active" | "past_due" | "ended";

export type SubscriptionSyncPlan =
  | { action: "ignore"; reason: "never_active" | "not_current_subscription" }
  | { action: "noop" }
  | { action: "update"; update: TenantBillingUpdate; lifecycle: SubscriptionLifecycle };

/**
 * Maps Dodo's subscription status onto the three states that affect access.
 *
 * `pending` and `failed` subscriptions were never paid for, so they resolve to
 * null and must not change a workspace's plan. Unknown statuses are treated
 * the same way: an unrecognized value never grants or revokes access.
 */
export function resolveSubscriptionLifecycle(
  subscription: DodoRecord
): SubscriptionLifecycle | null {
  switch (readString(subscription, "status")?.toLowerCase()) {
    case "active":
      return "active";
    case "on_hold":
    case "paused":
      return "past_due";
    case "cancelled":
    case "canceled":
    case "expired":
      return "ended";
    default:
      return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the subscription's free trial ends, or null once it is over.
 *
 * Dodo has no trial status: a trialing subscription is simply `active` with a
 * `trial_period_days` counted from its creation.
 */
function resolveTrialEnd(subscription: DodoRecord): string | null {
  const trialDays = readNumber(subscription, "trial_period_days") ?? 0;
  const createdAt = Date.parse(readString(subscription, "created_at") ?? "");

  if (trialDays <= 0 || !Number.isFinite(createdAt)) return null;

  const trialEnd = createdAt + trialDays * DAY_MS;
  return trialEnd > Date.now() ? new Date(trialEnd).toISOString() : null;
}

/**
 * Translates a Dodo subscription into the tenant billing columns.
 *
 * The result is derived only from the subscription's own status, never from
 * the name of the event that delivered it, so every caller (webhook,
 * checkout-return sync, resume) writes the same state for the same
 * subscription.
 */
export function tenantUpdateFromDodoSubscription(
  subscription: DodoRecord
): TenantBillingUpdate | null {
  const lifecycle = resolveSubscriptionLifecycle(subscription);
  if (!lifecycle) return null;

  const common = {
    dodo_customer_id: extractCustomerId(subscription) ?? undefined,
    dodo_subscription_id: extractSubscriptionId(subscription) ?? undefined,
    current_period_end: extractCurrentPeriodEnd(subscription) ?? undefined,
    updated_at: new Date().toISOString(),
  };

  switch (lifecycle) {
    case "active": {
      const subscriptionStatus =
        readBoolean(subscription, "cancel_at_next_billing_date") === true
          ? "canceling"
          : "active";

      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: subscriptionStatus,
        trial_ends_at: resolveTrialEnd(subscription),
        billing_status: subscriptionStatus,
        plan: "pro",
        status: "active",
      }) as TenantBillingUpdate;
    }
    case "past_due":
      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: "past_due",
        billing_status: "past_due",
        plan: "pro",
        status: "past_due",
      }) as TenantBillingUpdate;
    case "ended":
      return compact({
        ...common,
        plan_tier: "free",
        subscription_status: "canceled",
        trial_ends_at: null,
        billing_status: "canceled",
        dodo_subscription_id: null,
        plan: "free",
        status: "active",
      }) as TenantBillingUpdate;
  }
}

function preserveCancellationAccessUntilEnd(
  update: TenantBillingUpdate,
  tenant: TenantBillingSnapshot
): TenantBillingUpdate {
  const accessEnd = resolvePaidAccessEnd([
    typeof update.current_period_end === "string" ? update.current_period_end : null,
    tenant.current_period_end,
    tenant.trial_ends_at,
  ]);

  if (!accessEnd) return update;

  // Dodo can report a subscription as cancelled before the period the customer
  // already paid for has ended. Keep the workspace in the scheduled-cancellation
  // state until that stored end date, rather than immediately revoking access.
  return compact({
    ...update,
    plan_tier: "pro",
    subscription_status: "canceling",
    billing_status: "canceling",
    plan: "pro",
    status: "active",
    current_period_end: accessEnd,
    dodo_subscription_id:
      tenant.dodo_subscription_id ?? update.dodo_subscription_id ?? undefined,
  }) as TenantBillingUpdate;
}

function sameBillingValue(key: string, current: unknown, next: unknown): boolean {
  if (current === next) return true;

  // Postgres and Dodo format the same instant differently.
  const isTimestamp = key === "current_period_end" || key === "trial_ends_at";
  if (isTimestamp && typeof current === "string" && typeof next === "string") {
    const currentTime = Date.parse(current);
    return Number.isFinite(currentTime) && currentTime === Date.parse(next);
  }

  return false;
}

export function tenantAlreadyMatchesBillingUpdate(
  tenant: TenantBillingSnapshot,
  update: TenantBillingUpdate
): boolean {
  const current = tenant as Record<string, unknown>;

  return Object.entries(update)
    .filter(([key]) => key !== "updated_at")
    .every(([key, value]) => sameBillingValue(key, current[key], value));
}

/**
 * Decides what a subscription's current Dodo state means for a workspace.
 *
 * Callers pass the subscription as fetched from Dodo right now, not the body
 * of a webhook, which makes the decision independent of delivery order and
 * safe to repeat.
 */
export function planSubscriptionSync(
  tenant: TenantBillingSnapshot,
  subscription: DodoRecord
): SubscriptionSyncPlan {
  const lifecycle = resolveSubscriptionLifecycle(subscription);
  if (!lifecycle) return { action: "ignore", reason: "never_active" };

  // A workspace can accumulate more than one Dodo subscription (for example an
  // abandoned one that later expires). Only an active subscription may take
  // over the workspace; a lapse on any other subscription must not downgrade
  // the one the workspace is actually paying for.
  const linkedSubscriptionId = tenant.dodo_subscription_id?.trim() || null;
  if (
    lifecycle !== "active" &&
    linkedSubscriptionId &&
    extractSubscriptionId(subscription) !== linkedSubscriptionId
  ) {
    return { action: "ignore", reason: "not_current_subscription" };
  }

  let update = tenantUpdateFromDodoSubscription(subscription);
  if (!update) return { action: "ignore", reason: "never_active" };

  if (lifecycle === "ended") {
    update = preserveCancellationAccessUntilEnd(update, tenant);
  }

  if (tenantAlreadyMatchesBillingUpdate(tenant, update)) {
    return { action: "noop" };
  }

  return { action: "update", update, lifecycle };
}
