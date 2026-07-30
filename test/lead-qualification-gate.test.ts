import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const leadsActionSource = readFileSync(
  fileURLToPath(new URL("../app/actions/leads.ts", import.meta.url)),
  "utf8",
);
const dashboardSource = readFileSync(
  fileURLToPath(
    new URL("../app/(dashboard)/dashboard/prospect-dashboard-client.tsx", import.meta.url),
  ),
  "utf8",
);

test("a discovery candidate cannot reach the qualification or CRM path", () => {
  // This is the conditional database write that runs before tenant settings or
  // CRM webhook delivery are considered. Keep this assertion focused on the
  // executable action boundary rather than a UI-only affordance.
  assert.match(
    leadsActionSource,
    /\.in\(\s*"match_status",\s*\["ready_for_review"\]\s*\)/,
  );
  assert.doesNotMatch(
    leadsActionSource,
    /\.in\(\s*"match_status",\s*\[[^\]]*"discovery_candidate"/,
  );

  const qualificationUpdate = leadsActionSource.indexOf(
    '.update({\n      match_status: "qualified",',
  );
  const crmDelivery = leadsActionSource.indexOf("await sendCrmWebhook(");

  assert.ok(qualificationUpdate >= 0, "the action must retain its guarded update");
  assert.ok(crmDelivery > qualificationUpdate, "CRM delivery must remain after the guarded update");
});

test("Watch cards replace qualification with review-only guidance", () => {
  assert.match(
    dashboardSource,
    /const isReviewOnly = reviewOnly \|\| lead\.matchStatus === "discovery_candidate"/,
  );
  assert.match(
    dashboardSource,
    /const qualificationAction = !isReviewOnly \? \(/,
  );
  assert.match(dashboardSource, /Review only/);
  assert.match(dashboardSource, /cannot be\s+qualified or exported to your CRM/);
  assert.match(dashboardSource, /reviewOnly=\{isWatch\}/);
});
