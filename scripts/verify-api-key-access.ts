import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceEntitlements } from "../lib/entitlements";

type TenantPlanFixture = {
  readonly label: string;
  readonly plan_tier: string;
  readonly subscription_status: string;
};

const tenantFixtures: readonly TenantPlanFixture[] = [
  { label: "free", plan_tier: "free", subscription_status: "free" },
  { label: "trialing", plan_tier: "pro", subscription_status: "trialing" },
  { label: "pro", plan_tier: "pro", subscription_status: "active" },
  { label: "enterprise", plan_tier: "enterprise", subscription_status: "active" },
  { label: "past_due", plan_tier: "pro", subscription_status: "past_due" },
];

function createSupabaseMock(row: TenantPlanFixture) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({
      data: {
        tenant_id: `tenant-${row.label}`,
        plan_tier: row.plan_tier,
        subscription_status: row.subscription_status,
        trial_ends_at: null,
        current_period_end: null,
      },
      error: null,
    }),
  };

  return {
    from(table: string) {
      assert.equal(table, "tenants");
      return chain;
    },
  };
}

async function verifyUniversalEntitlement() {
  for (const fixture of tenantFixtures) {
    const entitlements = await getWorkspaceEntitlements(
      createSupabaseMock(fixture) as any,
      `tenant-${fixture.label}`
    );

    assert.equal(
      entitlements.canGenerateApiKeys,
      true,
      `${fixture.label} workspaces must be able to generate API keys`
    );
  }
}

function verifyNoApiKeyPaywallTokens() {
  const apiRoute = readFileSync(join(process.cwd(), "api/routes/api_keys.py"), "utf8");
  const apiKeysManager = readFileSync(
    join(process.cwd(), "components/settings/api-keys-manager.tsx"),
    "utf8"
  );

  assert.equal(
    apiRoute.includes("requireProEntitlement"),
    false,
    "api/routes/api_keys.py must not use requireProEntitlement"
  );
  assert.equal(
    apiKeysManager.includes("UpgradeButton"),
    false,
    "ApiKeysManager must not render UpgradeButton"
  );
}

async function main() {
  await verifyUniversalEntitlement();
  verifyNoApiKeyPaywallTokens();

  console.log("API key access is universal across free, trialing, pro, enterprise, and past_due workspaces.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
