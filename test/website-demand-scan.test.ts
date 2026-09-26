import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
const targetingEditorSource = readFileSync(
  fileURLToPath(
    new URL(
      "../components/settings/workspace_page/targeting-editor.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const targetingBriefEditorSource = readFileSync(
  fileURLToPath(
    new URL(
      "../components/settings/workspace_page/targeting-brief-editor.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const matchingBriefPageSource = readFileSync(
  fileURLToPath(
    new URL("../app/(dashboard)/dashboard/brief/page.tsx", import.meta.url),
  ),
  "utf8",
);
test("the prospect desk points people to targeting instead of launching website scans", () => {
  assert.match(
    leadDeskSource,
    /<Link href="\/dashboard\/brief">Edit targeting<\/Link>/,
  );
  assert.doesNotMatch(leadDeskSource, /startWebsiteDemandScan/);
  assert.doesNotMatch(leadDeskSource, /Scan website demand/);
  assert.doesNotMatch(leadDeskSource, /body: JSON\.stringify\(\{ websiteUrl \}\)/);
});

test("website updates rebuild targeting before future discovery", () => {
  assert.match(
    profileSettingsSource,
    /body: JSON\.stringify\(\{ websiteUrl: normalizedWebsiteUrl \}\)/,
  );
  assert.match(profileSettingsSource, /onWebsiteSave=\{refreshWebsiteContext\}/);
  assert.match(targetingEditorSource, /Save and rebuild/);
  assert.match(
    targetingEditorSource,
    /Changing the source rebuilds this targeting profile before Arcli looks for new conversations/,
  );
  assert.match(targetingEditorSource, /Refresh website profile/);
  assert.doesNotMatch(profileSettingsSource, /Replace & analyze|Analyze again/);
  assert.match(
    workspaceRouteSource,
    /const triggerResult = triggerRequest[\s\S]*?postCrawlTrigger[\s\S]*?: triggerResponse\.serviceProfileUpdated[\s\S]*?postEmbeddingTrigger/,
  );
  assert.doesNotMatch(workspaceRouteSource, /const triggerResults = await Promise\.all/);
});

test("the targeting brief separates target fit from buyer evidence", () => {
  assert.match(matchingBriefPageSource, /<TargetingBriefEditor/);
  assert.match(targetingBriefEditorSource, /Target universe/);
  assert.match(targetingBriefEditorSource, /Ideal customer traits/);
  assert.match(targetingBriefEditorSource, /Relevant change triggers/);
  assert.match(targetingBriefEditorSource, /What counts as strong buyer evidence\?/);
  assert.match(targetingBriefEditorSource, /Outside the target universe/);
  assert.match(
    targetingBriefEditorSource,
    /a high-fit target is not automatically a lead/,
  );
});
