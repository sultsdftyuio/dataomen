import assert from "node:assert/strict";
import test from "node:test";

import { describeEmptyDiscovery } from "../lib/discovery-outcome";
import type { DiscoveryRunSummaryView } from "../lib/buyer-demand-report";

function scan(overrides: Partial<DiscoveryRunSummaryView> = {}, status = "completed") {
  return {
    status,
    isTerminal: true,
    summary: {
      sources: [],
      totalHits: 0,
      plausibleHits: 0,
      sourceFailures: 0,
      verifierPending: false,
      stopReason: null,
      caveat: null,
      xFallback: null,
      ...overrides,
    },
  };
}

test("an absent report cannot be presented as no market demand", () => {
  assert.match(describeEmptyDiscovery(null).detail, /cannot tell/i);
});

test("pending verification takes precedence over an empty source count", () => {
  assert.match(
    describeEmptyDiscovery(scan({ verifierPending: true })).title,
    /still being checked/i,
  );
});

test("source failures and partial coverage remain visible", () => {
  assert.match(describeEmptyDiscovery(scan({}, "failed")).title, /failed/i);
  assert.match(describeEmptyDiscovery(scan({ verifierPending: true }, "failed")).title, /failed/i);
  assert.match(describeEmptyDiscovery(scan({}, "skipped")).title, /did not run/i);
  assert.match(describeEmptyDiscovery(scan({}, "degraded")).title, /incomplete coverage/i);
  assert.match(
    describeEmptyDiscovery(scan({ verifierPending: true }, "degraded")).detail,
    /checks may still be pending/i,
  );
  assert.match(
    describeEmptyDiscovery(scan({ sourceFailures: 1, totalHits: 4 })).title,
    /incomplete coverage/i,
  );
});

test("zero posts differs from posts rejected by candidate checks", () => {
  assert.match(describeEmptyDiscovery(scan()).title, /returned no posts/i);
  assert.match(
    describeEmptyDiscovery(scan({ totalHits: 6, plausibleHits: 0 })).title,
    /none became candidates/i,
  );
  assert.match(
    describeEmptyDiscovery(scan({ totalHits: 6, plausibleHits: 2 })).title,
    /none are review-ready/i,
  );
});
