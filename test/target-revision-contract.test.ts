import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("the bounded target desk selects only the expected active brief revision", () => {
  const contract = source("scripts/entity_first_prospecting_contract.sql");
  const data = source("app/(dashboard)/dashboard/targets/data.ts");

  assert.match(
    contract,
    /CREATE OR REPLACE FUNCTION public\.list_current_prospect_assessments_for_profile/,
  );
  assert.match(contract, /expected_profile_version INTEGER/);
  assert.match(contract, /profile\.profile_version = expected_profile_version/);
  assert.match(contract, /assessment\.targeting_profile_version = resolved_profile_version/);
  assert.match(contract, /WHEN 'strong_buyer_signal' THEN 0/);
  assert.match(contract, /LIMIT 100/);
  assert.match(data, /rpc\(\s*"list_current_prospect_assessments_for_profile"/);
  assert.match(data, /expected_profile_version: targetingProfileVersion/);
});

test("brief revisions pause watches and keep feedback tied to the active policy", () => {
  const contract = source("scripts/entity_first_prospecting_contract.sql");
  const monitoring = source("scripts/prospect_target_monitoring_contract.sql");

  assert.match(contract, /prospect_target_monitors[\s\S]*status = ''paused''/);
  assert.match(
    contract,
    /profile\.profile_version = assessment\.targeting_profile_version/,
  );
  assert.match(
    monitoring,
    /profile\.profile_version = assessment\.targeting_profile_version/,
  );
});

test("the evidence projection reserves a bounded citation window for every visible target", () => {
  const contract = source("scripts/entity_first_prospecting_contract.sql");

  assert.match(contract, /WITH desk_targets AS/);
  assert.match(contract, /ROW_NUMBER\(\) OVER \(\s*PARTITION BY evidence\.prospect_entity_id/);
  assert.match(contract, /WHERE evidence\.evidence_rank <= 8/);
  assert.match(contract, /A single recently researched target[\s\S]*global recency limit/);
});
