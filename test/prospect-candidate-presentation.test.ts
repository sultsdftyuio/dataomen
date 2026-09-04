import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CandidatePool } from "../components/prospects/candidate-pool";
import type { DiscoveryPoolCandidateView } from "../app/(dashboard)/dashboard/prospect-types";

const dashboardDataSource = readFileSync(
  fileURLToPath(new URL("../app/(dashboard)/dashboard/data.ts", import.meta.url)),
  "utf8",
);
const deskSource = readFileSync(
  fileURLToPath(
    new URL("../components/prospects/prospect-lead-desk.tsx", import.meta.url),
  ),
  "utf8",
);
const dashboardClientSource = readFileSync(
  fileURLToPath(
    new URL("../app/(dashboard)/dashboard/prospect-dashboard-client.tsx", import.meta.url),
  ),
  "utf8",
);

function candidate(
  status: DiscoveryPoolCandidateView["status"] = "raw",
): DiscoveryPoolCandidateView {
  return {
    id: `candidate-${status}`,
    candidateKind: "public_post",
    status,
    source: "hackernews",
    sourceUrl: "https://news.ycombinator.com/item?id=1",
    title: "Need a design QA workflow",
    text: "I am looking for a better way to run design QA.",
    matchedPhrase: "how to get paying customers",
    reason: null,
    rawScore: 1,
    plausibilityScore: null,
    similarityScore: null,
    verifierScore: null,
    priorityScore: 0,
    firstSeenAt: "2026-08-30T00:00:00.000Z",
    lastSeenAt: "2026-08-30T00:00:00.000Z",
  };
}

test("candidate cards label search provenance without implying buyer intent", () => {
  const markup = renderToStaticMarkup(
    createElement(CandidatePool, { candidates: [candidate()] }),
  );

  assert.match(markup, /Unverified discovery/);
  assert.match(markup, /<details class="group">/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen/);
  assert.match(markup, /Collected, not reviewed/);
  assert.match(markup, /Found via search query:/);
  assert.doesNotMatch(markup, /Plausible signal/);
  assert.doesNotMatch(markup, /Matched phrase/);
});

test("non-raw candidates cannot render in the unverified collection queue", () => {
  const markup = renderToStaticMarkup(
    createElement(CandidatePool, { candidates: [candidate("plausible")] }),
  );

  assert.equal(markup, "");
});

test("dashboard data reconciles raw candidates against verifier-owned lead matches", () => {
  assert.match(
    dashboardDataSource,
    /\.in\(\s*"candidate_status",\s*\["raw"\]\s*\)/,
  );
  assert.match(
    dashboardDataSource,
    /query = query\.eq\("last_discovery_run_id", discoveryRunId\)/,
  );
  assert.match(dashboardDataSource, /\.from\("lead_matches"\)/);
  assert.match(dashboardDataSource, /resolvedSourcePostIds/);
});

test("dashboard summary uses lifecycle counts and flags incomplete coverage", () => {
  assert.match(deskSource, /Reviewed conversations/);
  assert.match(deskSource, /Screened out/);
  assert.match(deskSource, /Partial coverage/);
  assert.match(deskSource, /results may be incomplete/);
  assert.match(
    dashboardClientSource,
    /potentialBuyers=\{discoveryCandidates\}/,
  );
  assert.match(
    dashboardClientSource,
    /reviewedConversationCount=\{queueItems\.length\}/,
  );
});
