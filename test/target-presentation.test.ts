import assert from "node:assert/strict";
import test from "node:test";

import {
  displayedAssessmentReasons,
  hasVerifiedDirectBuyerEvidence,
  sortTargetEvidence,
  targetAssessmentPresentation,
  targetEvidenceReviewPresentation,
} from "../components/prospects/target-presentation";
import type {
  ProspectTargetView,
  TargetEvidenceView,
} from "../app/(dashboard)/dashboard/prospect-types";

function evidence(overrides: Partial<TargetEvidenceView> = {}): TargetEvidenceView {
  return {
    id: "evidence-1",
    kind: "fit",
    summary: "Matches the target profile.",
    excerpt: null,
    sourceLabel: "Public site",
    sourceUrl: "https://example.test/evidence",
    observedAt: "2026-09-20T10:00:00.000Z",
    entityLinkConfidence: "verified",
    reviewStatus: "accepted",
    ...overrides,
  };
}

function target(overrides: Partial<ProspectTargetView> = {}): ProspectTargetView {
  return {
    id: "target-1",
    entityKind: "builder",
    displayName: "Example Builder",
    subtitle: "Independent founder",
    canonicalUrl: "https://example.test",
    assessmentState: "high_fit",
    assessmentReasons: ["Matches the product and audience constraints."],
    assessedAt: "2026-09-20T10:00:00.000Z",
    evidence: [],
    ...overrides,
  };
}

test("high-fit targets remain explicitly distinct from buyer signals", () => {
  const presentation = targetAssessmentPresentation(target());

  assert.equal(presentation.label, "High-fit target");
  assert.match(presentation.description, /No public buyer signal has been observed/i);
  assert.equal(presentation.requiresEvidenceReview, false);
});

test("a raw strong-buyer state is withheld without cited verified direct evidence", () => {
  const presentation = targetAssessmentPresentation(
    target({
      assessmentState: "strong_buyer_signal",
      evidence: [evidence({ kind: "evaluation", sourceUrl: null })],
    }),
  );

  assert.equal(presentation.label, "Evidence review needed");
  assert.equal(presentation.requiresEvidenceReview, true);
  assert.equal(hasVerifiedDirectBuyerEvidence([evidence({ kind: "evaluation", sourceUrl: null })]), false);
});

test("a strong-buyer label needs fresh verified cited public evaluation evidence", () => {
  const directEvidence = evidence({ kind: "evaluation", id: "evaluation-1" });
  const now = new Date("2026-09-22T10:00:00.000Z");
  const presentation = targetAssessmentPresentation(
    target({
      assessmentState: "strong_buyer_signal",
      evidence: [directEvidence],
    }),
    now,
  );

  assert.equal(hasVerifiedDirectBuyerEvidence([directEvidence], now), true);
  assert.equal(presentation.label, "Strong buyer signal");
  assert.equal(presentation.requiresEvidenceReview, false);

  assert.equal(
    hasVerifiedDirectBuyerEvidence([evidence({ kind: "problem", id: "problem-1" })], now),
    false,
  );
  assert.equal(
    hasVerifiedDirectBuyerEvidence(
      [evidence({ kind: "evaluation", observedAt: "2026-03-25T10:00:00.000Z" })],
      now,
    ),
    false,
  );
  assert.equal(
    targetAssessmentPresentation(
      target({
        assessmentState: "strong_buyer_signal",
        evidence: [evidence({ kind: "evaluation", observedAt: "2026-03-25T10:00:00.000Z" })],
      }),
      now,
    ).label,
    "Evidence review needed",
  );
});

test("pending evidence remains visible for review but cannot support a strong buyer claim", () => {
  const pendingEvaluation = evidence({
    kind: "evaluation",
    reviewStatus: "pending",
  });
  const now = new Date("2026-09-22T10:00:00.000Z");

  assert.equal(
    hasVerifiedDirectBuyerEvidence([pendingEvaluation], now),
    false,
  );
  assert.equal(
    targetAssessmentPresentation(
      target({
        assessmentState: "strong_buyer_signal",
        evidence: [pendingEvaluation],
      }),
      now,
    ).label,
    "Evidence review needed",
  );
  assert.deepEqual(targetEvidenceReviewPresentation("pending"), {
    label: "Pending review",
    description:
      "This observation cannot support an assessment until a human reviewer accepts it.",
    tone: "warning",
  });
});

test("evidence prioritises direct observations and keeps deterministic ordering", () => {
  const sorted = sortTargetEvidence([
    evidence({ id: "relationship", kind: "relationship" }),
    evidence({ id: "fit", kind: "fit" }),
    evidence({ id: "problem-old", kind: "problem", observedAt: "2026-09-10T10:00:00.000Z" }),
    evidence({ id: "problem-new", kind: "problem", observedAt: "2026-09-21T10:00:00.000Z" }),
    evidence({ id: "evaluation", kind: "evaluation" }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["evaluation", "problem-new", "problem-old", "fit", "relationship"],
  );
});

test("assessment reasons are trimmed and deduplicated for a compact desk", () => {
  assert.deepEqual(
    displayedAssessmentReasons(
      ["  Relevant launch  ", "Relevant launch", "New pricing page", "Public project"],
      2,
    ),
    {
      reasons: ["Relevant launch", "New pricing page"],
      remainingCount: 1,
    },
  );
});
