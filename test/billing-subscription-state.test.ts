import assert from "node:assert/strict";
import test from "node:test";

import {
  planSubscriptionSync,
  tenantUpdateFromDodoSubscription,
  type TenantBillingSnapshot,
} from "../lib/billing/subscription-state";

const DAY_MS = 24 * 60 * 60 * 1000;
const nextMonth = new Date(Date.now() + 30 * DAY_MS).toISOString();
const lastWeek = new Date(Date.now() - 7 * DAY_MS).toISOString();

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    subscription_id: "sub_current",
    status: "active",
    cancel_at_next_billing_date: false,
    next_billing_date: nextMonth,
    customer: { customer_id: "cus_1" },
    metadata: { tenant_id: "tenant-1" },
    ...overrides,
  };
}

const freeTenant: TenantBillingSnapshot = {
  plan_tier: "free",
  subscription_status: "free",
  trial_ends_at: null,
  billing_status: "free",
  plan: "free",
  status: "active",
  dodo_customer_id: null,
  dodo_subscription_id: null,
  current_period_end: null,
};

const proTenant: TenantBillingSnapshot = {
  plan_tier: "pro",
  subscription_status: "active",
  trial_ends_at: null,
  billing_status: "active",
  plan: "pro",
  status: "active",
  dodo_customer_id: "cus_1",
  dodo_subscription_id: "sub_current",
  current_period_end: nextMonth,
};

test("an unpaid subscription never grants Pro", () => {
  for (const status of ["pending", "failed", "something_new"]) {
    assert.equal(tenantUpdateFromDodoSubscription(subscription({ status })), null);
    assert.deepEqual(planSubscriptionSync(freeTenant, subscription({ status })), {
      action: "ignore",
      reason: "never_active",
    });
  }
});

test("an active subscription upgrades the workspace and links its ids", () => {
  const plan = planSubscriptionSync(freeTenant, subscription());

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.plan_tier, "pro");
  assert.equal(plan.update.subscription_status, "active");
  assert.equal(plan.update.dodo_subscription_id, "sub_current");
  assert.equal(plan.update.dodo_customer_id, "cus_1");
  assert.equal(plan.update.current_period_end, nextMonth);
});

test("a scheduled cancellation is recorded as canceling, not active", () => {
  const plan = planSubscriptionSync(
    proTenant,
    subscription({ cancel_at_next_billing_date: true }),
  );

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.subscription_status, "canceling");
  assert.equal(plan.update.plan_tier, "pro");
});

test("a failed renewal moves the workspace to past due", () => {
  const plan = planSubscriptionSync(proTenant, subscription({ status: "on_hold" }));

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.subscription_status, "past_due");
});

test("repeating an already-applied state writes nothing", () => {
  assert.deepEqual(planSubscriptionSync(proTenant, subscription()), { action: "noop" });

  // Postgres returns the same instant in a different text format.
  const postgresFormatted = {
    ...proTenant,
    current_period_end: nextMonth.replace("Z", "+00:00"),
  };
  assert.deepEqual(planSubscriptionSync(postgresFormatted, subscription()), { action: "noop" });
});

test("a lapse on another subscription does not touch the current one", () => {
  for (const status of ["on_hold", "cancelled", "expired"]) {
    assert.deepEqual(
      planSubscriptionSync(proTenant, subscription({ subscription_id: "sub_old", status })),
      { action: "ignore", reason: "not_current_subscription" },
    );
  }
});

test("a different active subscription takes over the workspace", () => {
  const plan = planSubscriptionSync(
    { ...proTenant, subscription_status: "past_due", dodo_subscription_id: "sub_old" },
    subscription({ subscription_id: "sub_new" }),
  );

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.dodo_subscription_id, "sub_new");
  assert.equal(plan.update.subscription_status, "active");
});

test("a cancelled subscription keeps access until the paid period ends", () => {
  const plan = planSubscriptionSync(proTenant, subscription({ status: "cancelled" }));

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.plan_tier, "pro");
  assert.equal(plan.update.subscription_status, "canceling");
  assert.equal(plan.update.current_period_end, nextMonth);
});

test("a cancelled subscription with no paid time left downgrades to free", () => {
  const plan = planSubscriptionSync(
    { ...proTenant, current_period_end: lastWeek },
    subscription({ status: "cancelled", next_billing_date: lastWeek }),
  );

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.plan_tier, "free");
  assert.equal(plan.update.subscription_status, "canceled");
  assert.equal(plan.update.dodo_subscription_id, null);
});

test("a trialing subscription is active Pro with a recorded trial end", () => {
  const createdAt = new Date(Date.now() - DAY_MS).toISOString();
  const plan = planSubscriptionSync(
    freeTenant,
    subscription({ created_at: createdAt, trial_period_days: 3 }),
  );

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.plan_tier, "pro");
  assert.equal(plan.update.subscription_status, "active");
  assert.equal(
    Date.parse(String(plan.update.trial_ends_at)),
    Date.parse(createdAt) + 3 * DAY_MS,
  );
});

test("the trial end is cleared once the trial is over", () => {
  const plan = planSubscriptionSync(
    freeTenant,
    subscription({
      created_at: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      trial_period_days: 3,
    }),
  );

  assert.equal(plan.action, "update");
  if (plan.action !== "update") return;
  assert.equal(plan.update.trial_ends_at, null);
});
