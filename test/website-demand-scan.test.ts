import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const actionsSource = readFileSync(
  fileURLToPath(new URL("../app/(dashboard)/dashboard/actions.ts", import.meta.url)),
  "utf8",
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("../app/(dashboard)/dashboard/page.tsx", import.meta.url)),
  "utf8",
);
const leadDeskSource = readFileSync(
  fileURLToPath(
    new URL("../components/prospects/prospect-lead-desk.tsx", import.meta.url),
  ),
  "utf8",
);
const profileSettingsSource = readFileSync(
  fileURLToPath(
    new URL(
      "../components/settings/workspace_page/service-profile-settings.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const workspaceRouteSource = readFileSync(
  fileURLToPath(new URL("../app/api/settings/workspace/route.ts", import.meta.url)),
  "utf8",
);
const workspaceRefreshCenterSource = readFileSync(
  fileURLToPath(
    new URL(
      "../components/settings/workspace_page/workspace-refresh-center.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const demandScanStart = actionsSource.slice(
  actionsSource.indexOf("export async function startWebsiteDemandScan"),
  actionsSource.indexOf("export async function requestBuyerLanguageResearch"),
);

test("the dashboard demand scan starts discovery from the server-owned matching brief", () => {
  assert.match(
    actionsSource,
    /export async function startWebsiteDemandScan\(\): Promise<ProspectActionResult>/,
  );
  assert.match(demandScanStart, /const context = await requireProTenant\(\)/);
  assert.match(demandScanStart, /const serviceProfile = await fetchServiceProfile\(/);
  assert.match(demandScanStart, /postCrawlerTrigger\([\s\S]*"dashboard_demand_scan"/);
  assert.match(demandScanStart, /postEmbeddingTrigger\([\s\S]*serviceProfile\.id[\s\S]*"dashboard_demand_scan"/);
  assert.doesNotMatch(demandScanStart, /isServiceProfileApproved/);
  assert.match(dashboardSource, /startWebsiteDemandScan=\{startWebsiteDemandScan\}/);
  assert.match(leadDeskSource, /const result = await startWebsiteDemandScan\(\)/);
  assert.match(
    leadDeskSource,
    /<Link href="\/dashboard\/brief">Update website<\/Link>/,
  );
  assert.match(leadDeskSource, /Scan website demand/);
  assert.doesNotMatch(leadDeskSource, /body: JSON\.stringify\(\{ websiteUrl \}\)/);
});

test("website re-crawls and brief updates each start only their own job", () => {
  assert.match(
    profileSettingsSource,
    /body: JSON\.stringify\(\{ websiteUrl: normalizedWebsiteUrl \}\)/,
  );
  assert.match(profileSettingsSource, /WorkspaceRefreshCenter/);
  assert.match(workspaceRefreshCenterSource, /Re-crawl website/);
  assert.match(workspaceRefreshCenterSource, /Refresh brief/);
  assert.match(workspaceRefreshCenterSource, /Scan website demand/);
  assert.match(
    workspaceRefreshCenterSource,
    /What your next update will improve/,
  );
  assert.match(workspaceRefreshCenterSource, /does not re-crawl the website/);
  assert.doesNotMatch(profileSettingsSource, /Replace & analyze|Analyze again/);
  assert.match(
    workspaceRouteSource,
    /const triggerResult = triggerRequest[\s\S]*?postCrawlTrigger[\s\S]*?: triggerResponse\.serviceProfileUpdated[\s\S]*?postEmbeddingTrigger/,
  );
  assert.doesNotMatch(workspaceRouteSource, /const triggerResults = await Promise\.all/);
});
