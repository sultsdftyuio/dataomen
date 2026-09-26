import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("target opportunities remain separate from verifier-owned lead matches", () => {
  const contract = source("scripts/prospect_target_opportunity_contract.sql");

  assert.match(contract, /CREATE TABLE IF NOT EXISTS public\.prospect_opportunities/);
  assert.match(contract, /Human-created entity-first opportunity/);
  assert.match(contract, /create_prospect_opportunity/);
  assert.match(contract, /qualify_prospect_opportunity/);
  assert.match(contract, /accepted cited trigger, problem, or evaluation evidence/i);
  assert.doesNotMatch(contract, /INSERT INTO public\.lead_matches/);
});

test("opportunity creation and qualification are separate explicit user actions", () => {
  const action = source("app/actions/prospect-opportunities.ts");

  assert.match(action, /export async function createProspectOpportunity/);
  assert.match(action, /rpc\("create_prospect_opportunity"/);
  assert.match(action, /export async function qualifyProspectOpportunity/);
  assert.match(action, /rpc\("qualify_prospect_opportunity"/);
  assert.match(action, /requireProEntitlement/);
  assert.match(action, /validateWebhookDestination/);
  assert.match(action, /arcli-prospect-opportunity-/);
  assert.match(action, /never\s+sends outreach/i);
});

test("target desk exposes opportunity actions only after the optional projection is available", () => {
  const page = source("app/(dashboard)/dashboard/targets/page.tsx");
  const desk = source("components/prospects/target-desk.tsx");
  const controls = source("components/prospects/target-opportunity-controls.tsx");

  assert.match(page, /fetchProspectTargetOpportunityStatuses/);
  assert.match(page, /targetOpportunitiesAvailable/);
  assert.match(page, /onCreateOpportunity/);
  assert.match(page, /onQualifyOpportunity/);
  assert.match(desk, /TargetOpportunityControls/);
  assert.match(controls, /Accept a cited trigger, problem, or evaluation observation/);
  assert.match(controls, /never sends outreach/);
});
