import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("keeps the targeting workflow focused on buyer, problem, and public signals", () => {
  const editor = source(
    "components/settings/workspace_page/targeting-editor.tsx",
  );

  assert.match(editor, /Who should Arcli look for\?/);
  assert.match(editor, /What are they trying to solve\?/);
  assert.match(editor, /What should Arcli recognise publicly\?/);
  assert.match(editor, /Save & update targeting/);
  assert.match(editor, /Advanced targeting/);
  assert.match(editor, /Change website/);
  assert.match(editor, /Latest discovery/);
  assert.match(editor, /TargetingStepCard/);
  assert.match(editor, /activeStep/);
  assert.match(editor, /aria-expanded=\{isOpen\}/);
});

test("does not load source-planning or guide content into targeting setup", () => {
  const page = source("app/(dashboard)/dashboard/brief/page.tsx");
  const settings = source(
    "components/settings/workspace_page/service-profile-settings.tsx",
  );

  assert.doesNotMatch(page, /MatchingBriefGuide|fetchSourceFeedbackInsights/);
  assert.doesNotMatch(settings, /CommunitySourcePlan|ProductBuyerMap|WorkspaceRefreshCenter/);
});
