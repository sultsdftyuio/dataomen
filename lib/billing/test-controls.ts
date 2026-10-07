import type { Database } from "@/types/supabase";

function normalizedEnvironmentValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Keeps manual billing overrides available during local development while
 * requiring an explicit opt-in in deployed environments.
 */
export function areBillingTestControlsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicitFlag = normalizedEnvironmentValue(
    environment.BILLING_TEST_CONTROLS_ENABLED,
  );

  if (["true", "1", "yes"].includes(explicitFlag)) return true;
  if (["false", "0", "no"].includes(explicitFlag)) return false;

  return environment.NODE_ENV !== "production";
}

export type BillingTestState =
  | "free"
  | "active"
  | "past_due"
  | "canceling"
  | "canceled";

export function isBillingTestState(value: string): value is BillingTestState {
  return ["free", "active", "past_due", "canceling", "canceled"].includes(value);
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Tenant billing columns for a manually selected test state. Persisted Dodo
 * customer and subscription ids are intentionally left untouched.
 */
export function billingTestUpdateFromState(
  state: BillingTestState,
): Database["public"]["Tables"]["tenants"]["Update"] {
  const now = new Date().toISOString();

  switch (state) {
    case "active":
      return {
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: null,
        billing_status: "active",
        plan: "pro",
        status: "active",
        current_period_end: daysFromNow(30),
        updated_at: now,
      };
    case "past_due":
      return {
        plan_tier: "pro",
        subscription_status: "past_due",
        trial_ends_at: null,
        billing_status: "past_due",
        plan: "pro",
        status: "past_due",
        current_period_end: daysFromNow(-1),
        updated_at: now,
      };
    case "canceling":
      return {
        plan_tier: "pro",
        subscription_status: "canceling",
        trial_ends_at: null,
        billing_status: "canceling",
        plan: "pro",
        status: "active",
        current_period_end: daysFromNow(14),
        updated_at: now,
      };
    case "canceled":
      return {
        plan_tier: "free",
        subscription_status: "canceled",
        trial_ends_at: null,
        billing_status: "canceled",
        plan: "free",
        status: "active",
        current_period_end: null,
        updated_at: now,
      };
    case "free":
      return {
        plan_tier: "free",
        subscription_status: "free",
        trial_ends_at: null,
        billing_status: "free",
        plan: "free",
        status: "active",
        current_period_end: null,
        updated_at: now,
      };
  }
}
