import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAssistedPilot } from "../scripts/report_assisted_pilot";

test("report counts current judgments, durable actions, and all fulfillment cost", () => {
  const report = summarizeAssistedPilot([
    {
      id: "first", prospect_entity_id: "account-1", tier: "high_fit",
      source_channel: "official_site", withdrawn_at: null,
      research_minutes: 20, review_minutes: 10, source_cost_usd: 2, ai_cost_usd: 1,
    },
    {
      id: "second", prospect_entity_id: "account-2", tier: "timely",
      source_channel: "public_discussion", withdrawn_at: null,
      research_minutes: 10, review_minutes: 5, source_cost_usd: 0, ai_cost_usd: 0,
    },
    {
      id: "withdrawn", prospect_entity_id: "account-3", tier: "direct_intent",
      source_channel: "public_discussion", withdrawn_at: "2025-10-02T00:00:00Z",
      research_minutes: 5, review_minutes: 5, source_cost_usd: 0, ai_cost_usd: 0,
    },
  ], [
    { id: "1", delivery_id: "first", user_id: "user", verdict: "contacted", created_at: "2025-10-01T00:00:00Z" },
    { id: "2", delivery_id: "first", user_id: "user", verdict: "not_now", created_at: "2025-10-02T00:00:00Z" },
    { id: "3", delivery_id: "second", user_id: "user", verdict: "wrong_fit", created_at: "2025-10-02T00:00:00Z" },
  ], 60, [{
    reason_code: "missing_route", source_channel: "official_site",
    research_minutes: 5, review_minutes: 2, source_cost_usd: 1, ai_cost_usd: 0,
  }], [
    { domain: "account-1.example", status: "delivered" },
    { domain: "account-2.example", status: "rejected" },
  ], [
    { source_kind: "approved_directory" },
    { source_kind: "licensed_provider" },
  ]);

  assert.equal(report.delivered, 2);
  assert.equal(report.withdrawn, 1);
  assert.equal(report.accepted, 1);
  assert.equal(report.contacted, 1);
  assert.equal(report.rejected.wrong_fit, 1);
  assert.equal(report.rejected.not_now, 1);
  assert.equal(report.rejectedBeforeDelivery, 1);
  assert.equal(report.rejectionReasons.missing_route, 1);
  assert.equal(report.newCandidateDomains, 2);
  assert.equal(report.sourceObservationsImported, 2);
  assert.equal(report.estimatedTotalCostUsd, 66);
  assert.equal(report.estimatedCostPerAcceptedUsd, 66);
});
