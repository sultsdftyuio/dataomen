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

function verifyApiKeyRoutingContracts() {
  const nextConfig = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
  const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

  assert.match(
    nextConfig,
    /source:\s*['"]\/api\/v1\/:path\*['"]/,
    "Next.js must keep the browser-facing /api/v1 proxy route"
  );
  assert.match(
    nextConfig,
    /destination:\s*`\$\{backendUrl\}\/v1\/:path\*`/,
    "Next.js /api/v1 proxy must target the FastAPI /v1 router"
  );
  assert.equal(
    proxy.includes("'/api/v1/track'"),
    true,
    "Edge middleware must allow API-key bearer auth through to /api/v1/track"
  );
}

function verifyApiKeySchemaContracts() {
  const trackRoute = readFileSync(join(process.cwd(), "api/routes/track.py"), "utf8");
  const apiRoute = readFileSync(join(process.cwd(), "api/routes/api_keys.py"), "utf8");

  assert.equal(
    trackRoute.includes("expires_at"),
    false,
    "api/routes/track.py must not query api_keys.expires_at until that column exists in the schema"
  );
  assert.equal(
    apiRoute.includes("Maximum number of active API keys reached."),
    false,
    "api/routes/api_keys.py must align with the one-active-key rotation model"
  );
  assert.equal(
    apiRoute.includes("23505"),
    true,
    "api/routes/api_keys.py must handle the active-key unique constraint"
  );
}

async function main() {
  await verifyUniversalEntitlement();
  verifyNoApiKeyPaywallTokens();
  verifyApiKeyRoutingContracts();
  verifyApiKeySchemaContracts();

  console.log("API key access, routing, and schema contracts are aligned.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
