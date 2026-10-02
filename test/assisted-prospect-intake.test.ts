import assert from "node:assert/strict";
import test from "node:test";

import { assistedDeliveryInputSchema } from "../scripts/deliver_assisted_prospect";

const card = {
  tenantId: "tenant-test",
  targetingProfileId: "00000000-0000-4000-8000-000000000001",
  targetingProfileVersion: 2,
  candidateId: "00000000-0000-4000-8000-000000000002",
  entityKind: "account",
  entityUrl: "https://example.com/",
  entityTitle: "Example Software",
  tier: "high_fit",
  fitSummary: "The product page documents a workflow in this customer's approved market.",
  fitSourceUrl: "https://example.com/product",
  buyerRole: "Head of operations",
  angle: "Ask whether that documented workflow is a priority this quarter.",
  uncertaintySummary: "Current budget and interest are unknown.",
  signalSummary: null,
  signalSourceUrl: null,
  signalSourceChannel: null,
  signalDate: null,
  contactRouteType: "business_contact",
  contactRouteUrl: "https://example.com/contact",
  sourceCheckedAt: "2025-10-01T09:00:00.000Z",
  routeCheckedAt: "2025-10-01T09:00:00.000Z",
  sourceChannel: "official_site",
  rightsBasis: "Approved manual review of public company pages.",
  researchMinutes: 12,
  reviewMinutes: 4,
  sourceCostUsd: 0,
  aiCostUsd: 0,
  reviewedBy: "reviewer-01",
  checks: {
    sourceRightsConfirmed: true,
    fitAndExclusionsChecked: true,
    identityAndDedupeChecked: true,
    buyerRoleChecked: true,
    contactRouteOpened: true,
    reviewerApproved: true,
  },
} as const;

test("high-fit prospect can be delivered without an invented recent event", () => {
  assert.equal(assistedDeliveryInputSchema.safeParse(card).success, true);
});

test("direct-intent tier requires a complete dated source", () => {
  assert.equal(assistedDeliveryInputSchema.safeParse({ ...card, tier: "direct_intent" }).success, false);
  assert.equal(assistedDeliveryInputSchema.safeParse({
    ...card,
    tier: "direct_intent",
    signalSummary: "A public request describes the current evaluation.",
    signalSourceUrl: "https://example.com/request",
    signalSourceChannel: "official_site",
    signalDate: "2025-09-30",
  }).success, true);
});

test("review and privacy checks fail closed", () => {
  assert.equal(assistedDeliveryInputSchema.safeParse({ ...card, candidateId: null }).success, false);
  assert.equal(assistedDeliveryInputSchema.safeParse({
    ...card,
    checks: { ...card.checks, sourceRightsConfirmed: false },
  }).success, false);
  assert.equal(assistedDeliveryInputSchema.safeParse({
    ...card,
    fitSummary: "Contact person@example.com for details.",
  }).success, false);
  assert.equal(assistedDeliveryInputSchema.safeParse({
    ...card,
    entityKind: "builder",
    entityTitle: "Named person",
  }).success, false);
  assert.equal(assistedDeliveryInputSchema.safeParse({
    ...card,
    contactRouteUrl: "http://127.0.0.1/contact",
  }).success, false);
});
