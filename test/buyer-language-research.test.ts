import assert from "node:assert/strict";
import test from "node:test";

import { fetchBuyerLanguageResearch } from "../app/(dashboard)/dashboard/data";
import {
  buildBuyerLanguageResearchEvidence,
} from "../lib/buyer-language-research";

const TENANT_ID = "tenant-a";
const PROFILE_ID = "profile-a";

test("shows only accepted, tenant-owned evidence with a literal source excerpt", () => {
  const evidence = buildBuyerLanguageResearchEvidence(
    [
      {
        id: "accepted",
        tenant_id: TENANT_ID,
        service_profile_id: PROFILE_ID,
        evidence_status: "accepted",
        source: "Hacker News",
        source_url: "https://news.ycombinator.com/item?id=1",
        source_text:
          "We are spending every Friday manually reconciling customer requests.",
        evidence_excerpt: "spending every Friday manually reconciling customer requests",
        created_at: "2026-07-29T12:00:00.000Z",
      },
      {
        id: "not-accepted",
        tenant_id: TENANT_ID,
        service_profile_id: PROFILE_ID,
        evidence_status: "pending",
        source: "Hacker News",
        source_text: "We need to reduce manual work.",
        evidence_excerpt: "reduce manual work",
      },
      {
        id: "wrong-tenant",
        tenant_id: "tenant-b",
        service_profile_id: PROFILE_ID,
        evidence_status: "accepted",
        source: "X",
        source_text: "Our team needs better reporting.",
        evidence_excerpt: "needs better reporting",
      },
      {
        id: "ungrounded",
        tenant_id: TENANT_ID,
        service_profile_id: PROFILE_ID,
        evidence_status: "accepted",
        source: "X",
        source_text: "We need a simpler reporting process.",
        evidence_excerpt: "They urgently need analytics software",
      },
      {
        id: "unsafe-url",
        tenant_id: TENANT_ID,
        service_profile_id: PROFILE_ID,
        evidence_status: "accepted",
        source: "Forum",
        source_url: "javascript:alert(1)",
        source_text: "I keep rebuilding the same report by hand.",
        evidence_excerpt: "rebuilding the same report by hand",
      },
    ],
    TENANT_ID,
    PROFILE_ID,
  );

  assert.deepEqual(evidence, [
    {
      id: "accepted",
      source: "Hacker News",
      sourceUrl: "https://news.ycombinator.com/item?id=1",
      excerpt: "spending every Friday manually reconciling customer requests",
      capturedAt: "2026-07-29T12:00:00.000Z",
    },
    {
      id: "unsafe-url",
      source: "Forum",
      sourceUrl: null,
      excerpt: "rebuilding the same report by hand",
      capturedAt: null,
    },
  ]);
});

test("reads canonical accepted evidence with tenant and profile predicates", async () => {
  const calls: Array<[string, string, string | number | boolean]> = [];
  const query = {
    eq(column: string, value: string) {
      calls.push(["eq", column, value]);
      return query;
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push(["order", column, options.ascending]);
      return query;
    },
    async limit(count: number) {
      calls.push(["limit", "count", count]);
      return {
        data: [
          {
            id: "accepted",
            tenant_id: TENANT_ID,
            service_profile_id: PROFILE_ID,
            evidence_status: "accepted",
            source: "Hacker News",
            source_url: "https://news.ycombinator.com/item?id=1",
            source_text: "I am losing hours to manual handoffs.",
            evidence_excerpt: "losing hours to manual handoffs",
            created_at: "2026-07-29T12:00:00.000Z",
          },
        ],
        error: null,
      };
    },
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "discovery_evidence");
      return { select: () => query };
    },
  };

  const research = await fetchBuyerLanguageResearch(
    supabase as never,
    TENANT_ID,
    PROFILE_ID,
  );

  assert.equal(research.availability, "available");
  assert.equal(research.evidence.length, 1);
  assert.equal(research.evidence[0]?.excerpt, "losing hours to manual handoffs");
  assert.deepEqual(calls, [
    ["eq", "tenant_id", TENANT_ID],
    ["eq", "service_profile_id", PROFILE_ID],
    ["eq", "evidence_status", "accepted"],
    ["order", "created_at", false],
    ["limit", "count", 12],
  ]);
});

test("fails closed while the optional discovery evidence schema is unavailable", async () => {
  const query = {
    eq() {
      return query;
    },
    order() {
      return query;
    },
    async limit() {
      return { data: null, error: { code: "42P01" } };
    },
  };
  const supabase = {
    from() {
      return { select: () => query };
    },
  };

  const research = await fetchBuyerLanguageResearch(
    supabase as never,
    TENANT_ID,
    PROFILE_ID,
  );

  assert.deepEqual(research, {
    availability: "unavailable",
    evidence: [],
  });
});
