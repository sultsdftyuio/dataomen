import assert from "node:assert/strict";
import test from "node:test";

import { summarizeSourceYield } from "../scripts/assisted_sources/source_yield";

test("source yield exposes overlap and counts only distinct candidate outcomes", () => {
  const report = summarizeSourceYield(
    [
      { id: "a", domain: "a.example", status: "delivered" },
      { id: "b", domain: "b.example", status: "rejected" },
      { id: "c", domain: "c.example", status: "unreviewed" },
    ],
    [
      { candidate_id: "a", source_key: "directory", source_kind: "approved_directory" },
      { candidate_id: "a", source_key: "directory", source_kind: "approved_directory" },
      { candidate_id: "a", source_key: "licensed", source_kind: "licensed_provider" },
      { candidate_id: "b", source_key: "directory", source_kind: "approved_directory" },
    ],
    [{ id: "delivery-a", candidate_id: "a" }],
    [
      { id: "1", delivery_id: "delivery-a", user_id: "u", verdict: "contacted",
        created_at: "2026-10-01T10:00:00Z" },
      { id: "2", delivery_id: "delivery-a", user_id: "u", verdict: "not_now",
        created_at: "2026-10-01T11:00:00Z" },
    ],
  );
  assert.equal(report.newCandidateDomains, 3);
  assert.equal(report.overlapCandidates, 1);
  assert.equal(report.unattributedCandidates, 1);
  assert.deepEqual(report.sources.map((source) => ({
    key: source.sourceKey, candidates: source.candidates,
    exclusive: source.exclusiveCandidates, accepted: source.customerAccepted,
    contacted: source.contacted,
  })), [
    { key: "directory", candidates: 2, exclusive: 1, accepted: 1, contacted: 1 },
    { key: "licensed", candidates: 1, exclusive: 0, accepted: 1, contacted: 1 },
  ]);
});

test("source yield rejects inconsistent source kind for the same registered key", () => {
  assert.throws(() => summarizeSourceYield([], [
    { candidate_id: "a", source_key: "source", source_kind: "approved_directory" },
    { candidate_id: "a", source_key: "source", source_kind: "licensed_provider" },
  ], [], []), /changed kind/);
});
