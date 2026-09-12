import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesLeadQueueFilter,
  type LeadQueueFilter,
} from "../app/(dashboard)/dashboard/lead-queue-filter";
import type {
  LeadMatchStatus,
  QualifiedLeadView,
} from "../app/(dashboard)/dashboard/prospect-types";

function lead(matchStatus: LeadMatchStatus): QualifiedLeadView {
  return {
    id: matchStatus,
    matchStatus,
    verifierScore: 0.8,
    similarityScore: 0.8,
    painDetected: "Manual workflow is slowing the team down.",
    painTheme: null,
    signalType: null,
    urgencyLevel: null,
    urgencyReason: null,
    evidenceExcerpt: null,
    purchaseStage: null,
    competitorMention: null,
    matchReason: "Relevant buyer problem.",
    suggestedReply: "",
    matchedAt: null,
    sourcePost: {
      title: "Example post",
      text: "Example post text",
      source: "github",
      author: null,
      community: null,
      url: null,
      publishedAt: null,
    },
  };
}

test("the default lead inbox excludes screened-out records", () => {
  const all: LeadMatchStatus[] = [
    "ready_for_review",
    "qualified",
    "discovery_candidate",
    "rejected",
  ];

  assert.deepEqual(
    all.filter((status) => matchesLeadQueueFilter(lead(status), "all")),
    ["ready_for_review", "qualified", "discovery_candidate"],
  );
});

test("the screened filter is an explicit audit-only route", () => {
  const filters: LeadQueueFilter[] = ["all", "leads", "potential", "screened"];

  for (const filter of filters) {
    assert.equal(
      matchesLeadQueueFilter(lead("rejected"), filter),
      filter === "screened",
    );
  }
});
