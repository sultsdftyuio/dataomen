import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { TARGET_FEEDBACK_OPTIONS } from "../app/(dashboard)/dashboard/prospect-types";
import { fetchProspectFeedbackSummary } from "../app/(dashboard)/dashboard/targets/data";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("target outcome vocabulary stays distinct from lead qualification", () => {
  assert.deepEqual(
    TARGET_FEEDBACK_OPTIONS.map((option) => option.value),
    ["target", "not_relevant", "contacted", "meeting", "won"],
  );
});

test("target feedback sends only a server-owned assessment and fixed outcome", () => {
  const actions = source("app/(dashboard)/dashboard/targeting-actions.ts");

  assert.match(actions, /submitProspectTargetFeedback/);
  assert.match(actions, /rpc\("submit_prospect_feedback"/);
  assert.match(actions, /target_assessment_id: parsed\.data\.assessmentId/);
  assert.match(actions, /reason_code_input: null/);
  assert.match(actions, /does not create a lead or CRM record/);
});

test("target desk gives feedback an explicit no-outreach boundary", () => {
  const controls = source("components/prospects/target-feedback-controls.tsx");

  assert.match(controls, /Record outcome/);
  assert.match(controls, /never sends outreach or creates a CRM record/);
  assert.match(controls, /assessmentId/);
});

test("feedback readiness is aggregate-only and never a browser-side ranking change", () => {
  const targetData = source("app/(dashboard)/dashboard/targets/data.ts");
  const desk = source("components/prospects/target-desk.tsx");

  assert.match(targetData, /list_prospect_feedback_summary_for_profile/);
  assert.match(targetData, /aggregate target outcomes/i);
  assert.match(desk, /Aggregate workspace outcome counts/);
  assert.match(desk, /not automatic ranking changes/);
});

test("feedback summary keeps only valid aggregate counters", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: [
          {
            feedback_type: "target",
            feedback_count: "2",
            target_count: "2",
            latest_feedback_at: "2026-09-25T10:00:00.000Z",
          },
          {
            feedback_type: "won",
            feedback_count: 1,
            target_count: 1,
            latest_feedback_at: null,
          },
          { feedback_type: "target", feedback_count: null, target_count: 1 },
          { feedback_type: "unknown", feedback_count: 3, target_count: 3 },
        ],
        error: null,
      };
    },
  };

  const summary = await fetchProspectFeedbackSummary(
    client as never,
    "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4",
  );

  assert.deepEqual(calls, [{
    name: "list_prospect_feedback_summary_for_profile",
    args: { target_profile_id: "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4" },
  }]);
  assert.deepEqual(summary, [
    {
      feedbackType: "target",
      feedbackCount: 2,
      targetCount: 2,
      latestFeedbackAt: "2026-09-25T10:00:00.000Z",
    },
    {
      feedbackType: "won",
      feedbackCount: 1,
      targetCount: 1,
      latestFeedbackAt: null,
    },
  ]);
});
