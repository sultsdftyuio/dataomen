import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fetchProspectTargetMonitoringStatuses } from "../app/(dashboard)/dashboard/targets/data";
import { supportsRetainedPublicTargetMonitoring } from "../lib/retained-public-monitoring";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("monitoring supports only exact public builder locators", () => {
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://github.com/octocat"),
    true,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://bsky.app/profile/example.bsky.social"),
    true,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring(
      "builder",
      "https://news.ycombinator.com/user?id=example_user",
    ),
    true,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("project", "https://github.com/octocat"),
    false,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://github.com/octocat/project"),
    false,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://github.com/octocat?tab=repositories"),
    false,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://github.com:443/octocat"),
    false,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring(
      "builder",
      "https://news.ycombinator.com/user?id=example%5Fuser",
    ),
    false,
  );
  assert.equal(
    supportsRetainedPublicTargetMonitoring("builder", "https://example.test/profile"),
    false,
  );
});

test("target monitoring action supplies only a server-owned assessment and boolean", () => {
  const actions = source("app/(dashboard)/dashboard/targeting-actions.ts");
  const monitoringAction = actions.slice(actions.indexOf("setProspectTargetMonitoring"));

  assert.match(monitoringAction, /rpc\("set_prospect_target_monitoring"/);
  assert.match(monitoringAction, /target_assessment_id: parsed\.data\.assessmentId/);
  assert.match(monitoringAction, /enabled_input: parsed\.data\.enabled/);
  assert.match(monitoringAction, /cannot create a lead, outreach, or CRM record/);
  assert.doesNotMatch(monitoringAction, /canonicalUrl|source_url|author_handle|request_nonce/);
});

test("monitor controls state the retained-record and no-CRM boundary", () => {
  const controls = source("components/prospects/target-monitoring-controls.tsx");

  assert.match(controls, /Retained-public monitoring/);
  assert.match(controls, /Watch retained evidence/);
  assert.match(controls, /never fetches profiles, scans posting history, sends outreach, creates a lead, or exports to a CRM/);
  assert.match(controls, /onChange\(assessmentId, !isActive\)/);
});

test("monitor projection keeps only valid display-safe status fields", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: [
          {
            prospect_entity_id: "target-1",
            monitor_status: "active",
            next_refresh_at: "2026-09-27T00:00:00.000Z",
            last_dispatched_at: "2026-09-26T00:00:00.000Z",
          },
          {
            prospect_entity_id: "target-2",
            monitor_status: "paused",
            next_refresh_at: null,
            last_dispatched_at: null,
          },
          { prospect_entity_id: "target-3", monitor_status: "unknown" },
          { prospect_entity_id: null, monitor_status: "active" },
        ],
        error: null,
      };
    },
  };

  const statuses = await fetchProspectTargetMonitoringStatuses(
    client as never,
    "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4",
  );

  assert.ok(statuses);
  assert.deepEqual(calls, [{
    name: "list_prospect_target_monitor_status_for_profile",
    args: { target_profile_id: "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4" },
  }]);
  assert.deepEqual([...statuses.entries()], [
    ["target-1", {
      status: "active",
      nextRefreshAt: "2026-09-27T00:00:00.000Z",
      lastDispatchedAt: "2026-09-26T00:00:00.000Z",
    }],
    ["target-2", {
      status: "paused",
      nextRefreshAt: null,
      lastDispatchedAt: null,
    }],
  ]);
});

test("monitor controls stay unavailable when the additive projection is absent", async () => {
  const client = {
    rpc: async () => ({
      data: null,
      error: { code: "PGRST202" },
    }),
  };

  const statuses = await fetchProspectTargetMonitoringStatuses(
    client as never,
    "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4",
  );

  assert.equal(statuses, null);
});
