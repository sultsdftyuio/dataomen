import assert from "node:assert/strict";
import test from "node:test";

import { fetchBuyerDemandReport } from "../app/(dashboard)/dashboard/data";
import {
  deriveBuyerDemandPatterns,
  isTerminalDiscoveryRunStatus,
  parseDiscoveryRunSummary,
  shouldContinueActionQueuePolling,
  sourceGroundedUrgencyReason,
  type VerifierConfirmedPatternMatch,
} from "../lib/buyer-demand-report";

const TENANT_ID = "tenant-a";
const THRESHOLD = 0.7;

function verifiedMatch(
  overrides: Partial<VerifierConfirmedPatternMatch> = {},
): VerifierConfirmedPatternMatch {
  return {
    id: "match-1",
    tenantId: TENANT_ID,
    matchStatus: "ready_for_review",
    verifierScore: 0.91,
    painTheme: "Customer onboarding is taking too long",
    painDetected: "People are manually chasing onboarding tasks.",
    verifierExecuted: true,
    verifierMatch: true,
    ...overrides,
  };
}

test("only exposes an urgency reason grounded in preserved source evidence", () => {
  const source = "We need to replace this process by Friday. The team is blocked.";

  assert.equal(
    sourceGroundedUrgencyReason(source, "replace this process   by friday"),
    "replace this process by friday",
  );
  assert.equal(
    sourceGroundedUrgencyReason(source, "They have an urgent deadline"),
    null,
  );
  assert.equal(sourceGroundedUrgencyReason(source, ""), null);
});

test("derives a market pattern only from two distinct ready verifier matches in one tenant", () => {
  const patterns = deriveBuyerDemandPatterns(
    [
      verifiedMatch({ id: "match-1" }),
      verifiedMatch({ id: "match-2" }),
      verifiedMatch({
        id: "rejected-match",
        matchStatus: "rejected",
      }),
      verifiedMatch({
        id: "other-tenant-match",
        tenantId: "tenant-b",
      }),
      verifiedMatch({
        id: "watch-match",
        matchStatus: "discovery_candidate",
      }),
      verifiedMatch({
        id: "unverified-match",
        verifierMatch: false,
      }),
    ],
    TENANT_ID,
    THRESHOLD,
  );

  assert.deepEqual(patterns, [
    {
      label: "Customer onboarding is taking too long",
      matchCount: 2,
    },
  ]);
});

test("does not make a market pattern from a single match or duplicate rows", () => {
  const oneMatch = verifiedMatch({ id: "same-match" });

  assert.deepEqual(
    deriveBuyerDemandPatterns([oneMatch, oneMatch], TENANT_ID, THRESHOLD),
    [],
  );
});

test("normalizes only known aggregate discovery summary fields", () => {
  const summary = parseDiscoveryRunSummary({
    source_counts: {
      hn: { hits: 12 },
      x: { status: "completed", count: 2 },
    },
    // A final X fallback can report only its own hits. The dashboard must
    // prefer the full source-count total for the completed run.
    hits_found: 2,
    plausible_hits: 4,
    source_failures: 1,
    verification_status: "pending_or_running",
    x_fallback: { outcome: "skipped", reason: "free_coverage_sufficient" },
    internal_payload: { text: "must not be rendered" },
  });

  assert.deepEqual(summary, {
    sources: [
      { source: "hn", itemCount: 12, failed: false },
      { source: "x", itemCount: 2, failed: false },
    ],
    totalHits: 14,
    plausibleHits: 4,
    sourceFailures: 1,
    verifierPending: true,
    caveat: null,
    xFallback: {
      outcome: "skipped",
      reason: "free_coverage_sufficient",
    },
  });
});

test("treats completed, degraded, skipped, and failed reports as terminal", () => {
  assert.equal(isTerminalDiscoveryRunStatus("completed"), true);
  assert.equal(isTerminalDiscoveryRunStatus("partial"), true);
  assert.equal(isTerminalDiscoveryRunStatus("skipped"), true);
  assert.equal(isTerminalDiscoveryRunStatus("failed"), true);
  assert.equal(isTerminalDiscoveryRunStatus("running"), false);
});

test("keeps refreshing briefly while terminal scan verification is pending", () => {
  assert.equal(
    shouldContinueActionQueuePolling({
      isWarmingUp: false,
      readyToActCount: 0,
      hasTerminalReport: true,
      verificationPending: true,
      terminalReportAgeMs: 30_000,
    }),
    true,
  );
  assert.equal(
    shouldContinueActionQueuePolling({
      isWarmingUp: true,
      readyToActCount: 0,
      hasTerminalReport: true,
      verificationPending: true,
      terminalReportAgeMs: 5 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    shouldContinueActionQueuePolling({
      isWarmingUp: false,
      readyToActCount: 0,
      hasTerminalReport: false,
    }),
    true,
  );
});

test("falls back safely when optional discovery telemetry is not deployed", async () => {
  const calls: Array<[string, string, string | string[]]> = [];
  const query = {
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return query;
    },
    in(column: string, values: string[]) {
      calls.push(["in", column, values]);
      return query;
    },
    gte() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      return { data: null, error: { code: "42P01" } };
    },
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "discovery_runs");
      return { select: () => query };
    },
  };

  const report = await fetchBuyerDemandReport(
    supabase as never,
    TENANT_ID,
    "profile-a",
    THRESHOLD,
  );

  assert.equal(report, null);
  assert.deepEqual(calls, [
    ["eq", "tenant_id", TENANT_ID],
    ["eq", "service_profile_id", "profile-a"],
    ["eq", "run_kind", "opportunity_leads"],
    ["in", "status", ["running", "completed", "partial", "skipped", "failed"]],
  ]);
});

test("uses the scoped legacy report only when the additive run-kind column is absent", async () => {
  const calls: Array<[string, string, string | string[]]> = [];
  let reads = 0;
  const query = {
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return query;
    },
    in(column: string, values: string[]) {
      calls.push(["in", column, values]);
      return query;
    },
    gte() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      reads += 1;
      return reads === 1
        ? { data: null, error: { code: "42703", message: "run_kind does not exist" } }
        : { data: null, error: null };
    },
  };
  const tables: string[] = [];
  const supabase = {
    from(table: string) {
      tables.push(table);
      return { select: () => query };
    },
  };

  const report = await fetchBuyerDemandReport(
    supabase as never,
    TENANT_ID,
    "profile-a",
    THRESHOLD,
  );

  assert.equal(report, null);
  assert.deepEqual(tables, ["discovery_runs", "discovery_runs"]);
  assert.deepEqual(calls, [
    ["eq", "tenant_id", TENANT_ID],
    ["eq", "service_profile_id", "profile-a"],
    ["eq", "run_kind", "opportunity_leads"],
    ["in", "status", ["running", "completed", "partial", "skipped", "failed"]],
    ["eq", "tenant_id", TENANT_ID],
    ["eq", "service_profile_id", "profile-a"],
    ["in", "status", ["running", "completed", "partial", "skipped", "failed"]],
  ]);
});
