import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getWorkspaceEntitlements } from "../lib/entitlements";
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
                trial_ends_at: null,
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

function verifyNoTrialCheckoutOrLeadLeak() {
  const billing = readFileSync(join(process.cwd(), "app/actions/billing.ts"), "utf8");
  const webhook = readFileSync(join(process.cwd(), "app/api/webhooks/dodo/route.ts"), "utf8");
  const freePreview = readFileSync(
    join(process.cwd(), "app/(dashboard)/dashboard/free-prospect-preview.tsx"),
    "utf8",
  );
  const dashboardData = readFileSync(
    join(process.cwd(), "app/(dashboard)/dashboard/data.ts"),
    "utf8",
  );
  const databaseGuard = readFileSync(
    join(process.cwd(), "scripts/enforce-free-plan-limits.sql"),
    "utf8",
  );

  assert.equal(
    billing.includes("trial_period_days"),
    false,
    "checkout must not create a trial",
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
    dashboardData.includes('rpc(\n    "free_plan_lead_queue_counts"'),
    true,
    "Free preview counts must come from the aggregate-only RPC",
  );
  assert.equal(
    databaseGuard.includes('CREATE POLICY "lead_matches_select_tenant"'),
    true,
    "database policy must restrict direct lead reads to Pro",
  );
}

async function main() {
  await verifyEntitlementStates();
  await verifyFreeDomainLimit();
  verifyNoTrialCheckoutOrLeadLeak();
  console.log("Subscription access, Free domain limits, and no-trial checkout are verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
