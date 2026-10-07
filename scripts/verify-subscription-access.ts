import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTIVE_RENEWAL_GRACE_MS,
  getWorkspaceEntitlements,
  PRO_TRIAL_DAYS,
} from "../lib/entitlements";
import { resolvePaidAccessEnd } from "../lib/billing/cancellation-access";
import { areBillingTestControlsEnabled } from "../lib/billing/test-controls";
import {
  FREE_PLAN_DOMAIN_LIMIT_MESSAGE,
  freePlanDomainChangeError,
  normalizedWebsiteDomain,
} from "../lib/plan-limits";

type Fixture = {
  planTier: string;
  subscriptionStatus: string;
  websiteUrl?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
};

function createSupabaseMock(fixture: Fixture) {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "tenants") {
            return {
              data: {
                tenant_id: "tenant-test",
                plan_tier: fixture.planTier,
                subscription_status: fixture.subscriptionStatus,
                trial_ends_at: fixture.trialEndsAt ?? null,
                current_period_end: fixture.currentPeriodEnd ?? null,
              },
              error: null,
            };
          }

          assert.equal(table, "tenant_settings");
          return {
            data: { website_url: fixture.websiteUrl ?? null },
            error: null,
          };
        },
      };
      return chain;
    },
  };
}

async function verifyEntitlementStates() {
  const active = await getWorkspaceEntitlements(
    createSupabaseMock({ planTier: "pro", subscriptionStatus: "active" }) as any,
    "tenant-active",
  );
  assert.equal(active.isPro, true, "active Pro must be entitled");

  const free = await getWorkspaceEntitlements(
    createSupabaseMock({ planTier: "free", subscriptionStatus: "free" }) as any,
    "tenant-free",
  );
  assert.equal(free.isPro, false, "Free must not be entitled");

  const retiredTrial = await getWorkspaceEntitlements(
    createSupabaseMock({ planTier: "pro", subscriptionStatus: "trialing" }) as any,
    "tenant-retired-trial",
  );
  assert.equal(retiredTrial.isPro, false, "trialing must not grant access");

  const expiredCancellation = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "canceling",
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
    }) as any,
    "tenant-expired-cancellation",
  );
  assert.equal(expiredCancellation.isPro, false, "expired cancellations must be locked");

  const awaitingRenewalWebhook = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
    }) as any,
    "tenant-awaiting-renewal-webhook",
  );
  assert.equal(
    awaitingRenewalWebhook.isPro,
    true,
    "an active subscription must stay entitled while its renewal webhook is in flight",
  );

  const expiredActivePeriod = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() - ACTIVE_RENEWAL_GRACE_MS - 60_000).toISOString(),
    }) as any,
    "tenant-expired-active-period",
  );
  assert.equal(
    expiredActivePeriod.isPro,
    false,
    "an active record must be locked once the renewal grace window has passed",
  );

  const pastDue = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "past_due",
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
    }) as any,
    "tenant-past-due",
  );
  assert.equal(pastDue.isPro, false, "a failed renewal must lock Pro without a grace window");
  assert.equal(pastDue.isPastDue, true, "a failed renewal must be reported as past due");

  const trialEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const trialing = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "active",
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    }) as any,
    "tenant-trialing",
  );
  assert.equal(trialing.isPro, true, "a trial with a card on file must have Pro access");
  assert.equal(trialing.isTrialing, true, "a running trial must be reported as a trial");
  assert.equal(active.isTrialing, false, "a paid subscription must not be reported as a trial");

  const cancellationWithoutPeriodEnd = await getWorkspaceEntitlements(
    createSupabaseMock({ planTier: "pro", subscriptionStatus: "canceling" }) as any,
    "tenant-canceling-without-period-end",
  );
  assert.equal(
    cancellationWithoutPeriodEnd.isPro,
    false,
    "a cancellation without a known paid-until date must fail closed",
  );

  const finalCancellationBeforePeriodEnd = await getWorkspaceEntitlements(
    createSupabaseMock({
      planTier: "pro",
      subscriptionStatus: "canceled",
      currentPeriodEnd: new Date(Date.now() + 60_000).toISOString(),
    }) as any,
    "tenant-final-cancellation-before-period-end",
  );
  assert.equal(
    finalCancellationBeforePeriodEnd.isPro,
    true,
    "a final cancellation event must not revoke Pro before the paid period ends",
  );
}

function verifyCancellationAccessEndResolution() {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const webhookPeriodEnd = "2026-09-05T00:00:00.000Z";
  const recordedPeriodEnd = "2026-09-20T00:00:00.000Z";

  assert.equal(
    resolvePaidAccessEnd([webhookPeriodEnd, recordedPeriodEnd], now),
    recordedPeriodEnd,
    "a stale cancellation webhook must not shorten a paid access window",
  );
  assert.equal(
    resolvePaidAccessEnd(["invalid-date", webhookPeriodEnd], now),
    null,
    "expired or malformed dates must not grant paid access",
  );
}

function verifyBillingTestControls() {
  assert.equal(
    areBillingTestControlsEnabled({ NODE_ENV: "development" }),
    true,
    "billing overrides must be available during local development",
  );
  assert.equal(
    areBillingTestControlsEnabled({ NODE_ENV: "production" }),
    false,
    "billing overrides must require an explicit production opt-in",
  );
  assert.equal(
    areBillingTestControlsEnabled({
      NODE_ENV: "production",
      BILLING_TEST_CONTROLS_ENABLED: "true",
    }),
    true,
    "the explicit billing override flag must enable controls in production",
  );
}

async function verifyFreeDomainLimit() {
  assert.equal(normalizedWebsiteDomain("https://www.example.com/pricing"), "example.com");

  const freeWorkspace = createSupabaseMock({
    planTier: "free",
    subscriptionStatus: "free",
    websiteUrl: "https://example.com/",
  }) as any;
  assert.equal(
    await freePlanDomainChangeError(freeWorkspace, "tenant-free", "https://www.example.com/about"),
    null,
    "Free must be able to retry the same domain",
  );
  assert.equal(
    await freePlanDomainChangeError(freeWorkspace, "tenant-free", "https://another.example/"),
    FREE_PLAN_DOMAIN_LIMIT_MESSAGE,
    "Free must not switch domains",
  );

  const proWorkspace = createSupabaseMock({
    planTier: "pro",
    subscriptionStatus: "active",
    websiteUrl: "https://example.com/",
  }) as any;
  assert.equal(
    await freePlanDomainChangeError(proWorkspace, "tenant-pro", "https://another.example/"),
    null,
    "Pro may change domains",
  );
}

function verifyTrialCheckoutAndLeadLeak() {
  const billing = readFileSync(join(process.cwd(), "app/actions/billing.ts"), "utf8");
  const webhook = readFileSync(join(process.cwd(), "app/api/webhooks/dodo/route.ts"), "utf8");
  const subscriptionState = readFileSync(
    join(process.cwd(), "lib/billing/subscription-state.ts"),
    "utf8",
  );
  const freePreview = readFileSync(
    join(process.cwd(), "app/(dashboard)/dashboard/free-prospect-preview.tsx"),
    "utf8",
  );
  const freeScanPreview = readFileSync(
    join(process.cwd(), "app/(dashboard)/dashboard/free-scan-preview.ts"),
    "utf8",
  );
  const workerEntitlements = readFileSync(
    join(process.cwd(), "api/services/tenant_entitlements.py"),
    "utf8",
  );
  const databaseGuard = readFileSync(
    join(process.cwd(), "scripts/enforce-free-plan-limits.sql"),
    "utf8",
  );

  // The trial length comes from one constant, and a workspace that has already
  // had a Dodo customer is sent 0 so it cannot start a second trial.
  assert.equal(PRO_TRIAL_DAYS, 3, "the free trial is three days");
  assert.equal(
    billing.includes("trial_period_days: trialPeriodDays") &&
      billing.includes("billingProfile?.dodo_customer_id ? 0 : PRO_TRIAL_DAYS"),
    true,
    "checkout must grant the trial once per workspace",
  );
  assert.equal(
    subscriptionState.includes('subscription_status: "trialing"'),
    false,
    "billing sync must not persist a trial status; a trial is an active subscription",
  );
  assert.equal(
    webhook.includes('subscription_status: "trialing"'),
    false,
    "webhooks must not persist a trial state",
  );
  assert.equal(
    freePreview.includes("sourcePost"),
    false,
    "Free preview must not receive individual lead data",
  );
  assert.equal(
    freeScanPreview.includes('rpc("free_plan_first_scan_preview"'),
    true,
    "Free preview must come from the tenant-scoped preview RPC, not direct lead reads",
  );
  assert.equal(
    databaseGuard.includes('CREATE POLICY "lead_matches_select_tenant"'),
    true,
    "database policy must restrict direct lead reads to Pro",
  );

  // The paid-access rule exists once per runtime; each copy must keep the
  // renewal grace window in step with the web app's.
  const graceDays = ACTIVE_RENEWAL_GRACE_MS / (24 * 60 * 60 * 1000);
  assert.equal(
    databaseGuard.includes(`p_current_period_end + INTERVAL '${graceDays} days' > NOW()`),
    true,
    "the database paid-access rule must use the same renewal grace window",
  );
  assert.equal(
    workerEntitlements.includes(`ACTIVE_RENEWAL_GRACE_DAYS = ${graceDays}`),
    true,
    "the worker paid-access rule must use the same renewal grace window",
  );
  assert.equal(
    databaseGuard.split("AND public.tenant_has_paid_access(").length - 1,
    4,
    "every Pro-gated lead policy must use the shared paid-access rule",
  );
}

async function main() {
  await verifyEntitlementStates();
  verifyCancellationAccessEndResolution();
  verifyBillingTestControls();
  await verifyFreeDomainLimit();
  verifyTrialCheckoutAndLeadLeak();
  console.log("Subscription access, Free domain limits, and trial checkout are verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
