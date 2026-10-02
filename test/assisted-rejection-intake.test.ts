import assert from "node:assert/strict";
import test from "node:test";

import { assistedRejectionInputSchema } from "../scripts/record_assisted_rejection";

const rejection = {
  tenantId: "tenant-test",
  targetingProfileId: "00000000-0000-4000-8000-000000000001",
  targetingProfileVersion: 2,
  entityUrl: "https://example.com/",
  sourceUrl: "https://example.com/product",
  sourceChannel: "official_site",
  reasonCode: "missing_route",
  researchMinutes: 5,
  reviewMinutes: 2,
  sourceCostUsd: 0,
  aiCostUsd: 0,
  reviewedBy: "reviewer-01",
};

test("a rejected candidate keeps a reason and cost without copied source text", () => {
  assert.equal(assistedRejectionInputSchema.safeParse(rejection).success, true);
  assert.equal(assistedRejectionInputSchema.safeParse({
    ...rejection, sourceText: "Copied personal details",
  }).success, false);
  assert.equal(assistedRejectionInputSchema.safeParse({
    ...rejection, reasonCode: "interesting_but_no_reason",
  }).success, false);
});
