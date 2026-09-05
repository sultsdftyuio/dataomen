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

test("the dashboard demand scan starts discovery from the server-owned matching brief", () => {
  assert.match(
    actionsSource,
    /export async function startWebsiteDemandScan\(\): Promise<ProspectActionResult>/,
  );
  assert.match(actionsSource, /const context = await requireProTenant\(\)/);
  assert.match(actionsSource, /const serviceProfile = await fetchServiceProfile\(/);
  assert.match(actionsSource, /postEmbeddingTrigger\([\s\S]*serviceProfile\.id/);
  assert.match(dashboardSource, /startWebsiteDemandScan=\{startWebsiteDemandScan\}/);
  assert.match(leadDeskSource, /const result = await startWebsiteDemandScan\(\)/);
  assert.match(leadDeskSource, /const isMatchingBriefApproved =/);
  assert.match(leadDeskSource, /href="\/dashboard\/brief"/);
  assert.match(leadDeskSource, /Approve your matching brief before scanning website demand\./);
  assert.doesNotMatch(leadDeskSource, /body: JSON\.stringify\(\{ websiteUrl \}\)/);
});
