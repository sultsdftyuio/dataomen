import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchDiscoveryCandidates,
  fetchQualifiedLeads,
  fetchWatchlistResults,
} from "../app/(dashboard)/dashboard/data";
import {
  LEAD_MATCH_VIEW_SELECT,
  MATCH_FALLBACK_SELECT,
  WATCHLIST_MATCH_VIEW_SELECT,
} from "../app/(dashboard)/dashboard/lead-match-select";

type QueryResult = { data: unknown[] | null; error: unknown };

const MISSING_COLUMN = { code: "42703", message: "column does not exist" };

/**
 * A chainable stand-in for the Supabase query builder. Every filter returns
 * the same thenable, which resolves to the scripted result for its select.
 */
function fakeSupabase(respond: (table: string, select: string) => QueryResult) {
  const reads: Array<{ table: string; select: string }> = [];
  const supabase = {
    from(table: string) {
      return {
        select(select: string) {
          reads.push({ table, select });
          const query = {
            eq: () => query,
            in: () => query,
            gte: () => query,
            order: () => query,
            limit: () => query,
            then: (resolve: (value: QueryResult) => unknown) =>
              Promise.resolve(respond(table, select)).then(resolve),
          };
          return query;
        },
      };
    },
  };
  return { supabase: supabase as never, reads };
}

/** A row shaped like the narrow read: one snapshot, one verdict. */
const NARROW_LEAD_ROW = {
  id: "match-1",
  match_status: "ready_for_review",
  verifier_score: 0.82,
  similarity_score: 0.41,
  pain_detected: "Invoices are reconciled by hand.",
  match_reason: "The author asks for a billing tool.",
  suggested_reply: "A short, useful reply.",
  verification: {
    intent_tier: "high",
    evidence_excerpt: "reconcile invoices by hand",
    signal_type: "manual_workflow_frustration",
  },
  source_post: {
    source: "lemmy",
    external_id: "post-1",
    title: "Looking for a self-hosted billing tool",
    text: "We reconcile invoices by hand every month.",
    author: "alice",
    url: "https://lemmy.example/post/1",
    published_at: "2026-09-30T08:15:00+00:00",
    metadata: { community: "selfhosted" },
  },
  metadata: { community: "selfhosted", external_key: "lemmy:post-1" },
  matched_at: "2026-10-01T10:00:00+00:00",
  verified_at: "2026-10-01T10:00:00+00:00",
  created_at: "2026-10-01T10:00:00+00:00",
  // Row-level security hides a global post from the joined read.
  source_posts: null,
};

test("the lead read names its columns and never asks for stored vectors", () => {
  const columns = LEAD_MATCH_VIEW_SELECT.replace(/source_posts\([^)]*\)/, "").split(",");
  const embed = /source_posts\(([^)]*)\)/.exec(LEAD_MATCH_VIEW_SELECT)?.[1].split(",") ?? [];

  assert.ok(!LEAD_MATCH_VIEW_SELECT.includes("*"));
  // `source_posts.metadata` is where each post's cached embedding lives.
  assert.ok(!embed.includes("metadata"));
  assert.ok(embed.includes("posted_at") && embed.includes("body"));
  for (const alias of ["source_post_data", "source_post_json", "post", "verifier_result"]) {
    assert.ok(!columns.includes(alias), `${alias} duplicates a selected column`);
  }
  // Ordering columns must be readable for the ranked window to be stable.
  for (const required of ["id", "verifier_score", "created_at", "source_post", "verification"]) {
    assert.ok(columns.includes(required), `${required} is rendered or sorted on`);
  }
  assert.ok(WATCHLIST_MATCH_VIEW_SELECT.split(",").includes("watchlist_id"));
});

test("a lead renders fully from the narrow read", async () => {
  const { supabase, reads } = fakeSupabase(() => ({ data: [NARROW_LEAD_ROW], error: null }));

  const [lead] = await fetchQualifiedLeads(supabase, "tenant-a", "profile-a");

  assert.deepEqual(reads, [{ table: "lead_matches", select: LEAD_MATCH_VIEW_SELECT }]);
  assert.equal(lead.id, "match-1");
  assert.equal(lead.verifierScore, 0.82);
  assert.equal(lead.similarityScore, 0.41);
  assert.equal(lead.intentTier, "high");
  assert.equal(lead.evidenceExcerpt, "reconcile invoices by hand");
  assert.equal(lead.matchReason, "The author asks for a billing tool.");
  assert.deepEqual(lead.sourcePost, {
    title: "Looking for a self-hosted billing tool",
    text: "We reconcile invoices by hand every month.",
    source: "lemmy",
    author: "alice",
    community: "selfhosted",
    url: "https://lemmy.example/post/1",
    publishedAt: "2026-09-30T08:15:00+00:00",
  });
});

test("review-only queues use the same narrow read", async () => {
  const { supabase, reads } = fakeSupabase(() => ({
    data: [{ ...NARROW_LEAD_ROW, match_status: "discovery_candidate" }],
    error: null,
  }));

  const candidates = await fetchDiscoveryCandidates(supabase, "tenant-a", "profile-a");

  assert.deepEqual(reads, [{ table: "lead_matches", select: LEAD_MATCH_VIEW_SELECT }]);
  assert.equal(candidates[0].matchStatus, "discovery_candidate");
});

test("a deployment missing a named column falls back to the previous reads", async () => {
  const { supabase, reads } = fakeSupabase((_table, select) =>
    select === "*"
      ? { data: [NARROW_LEAD_ROW], error: null }
      : { data: null, error: MISSING_COLUMN },
  );

  const leads = await fetchQualifiedLeads(supabase, "tenant-a", "profile-a");

  assert.deepEqual(
    reads.map((read) => read.select),
    [LEAD_MATCH_VIEW_SELECT, MATCH_FALLBACK_SELECT, "*"],
  );
  assert.equal(leads.length, 1);
  assert.equal(leads[0].sourcePost.community, "selfhosted");
});

test("watchlist results group by their Watchlist from the narrow read", async () => {
  const { supabase, reads } = fakeSupabase(() => ({
    data: [{ ...NARROW_LEAD_ROW, watchlist_id: "watchlist-1" }],
    error: null,
  }));

  const [group] = await fetchWatchlistResults(
    supabase,
    "tenant-a",
    [{ id: "watchlist-1" } as never],
    0.55,
  );

  assert.deepEqual(reads, [
    { table: "watchlist_matches", select: WATCHLIST_MATCH_VIEW_SELECT },
  ]);
  assert.equal(group.watchlistId, "watchlist-1");
  assert.equal(group.readyToAct.length, 1);
  assert.equal(group.readyToAct[0].sourcePost.title, "Looking for a self-hosted billing tool");
});

test("watchlist results keep their schema-tolerant fallbacks", async () => {
  const { supabase, reads } = fakeSupabase((_table, select) =>
    select === "*"
      ? { data: [{ ...NARROW_LEAD_ROW, watchlist_id: "watchlist-1" }], error: null }
      : { data: null, error: MISSING_COLUMN },
  );

  const [group] = await fetchWatchlistResults(
    supabase,
    "tenant-a",
    [{ id: "watchlist-1" } as never],
    0.55,
  );

  assert.deepEqual(
    reads.map((read) => read.select),
    [WATCHLIST_MATCH_VIEW_SELECT, MATCH_FALLBACK_SELECT, "*"],
  );
  assert.equal(group.readyToAct.length, 1);
});
