import assert from "node:assert/strict";
import test from "node:test";

import { leadVisibilitySince } from "../app/(dashboard)/dashboard/lead-visibility";

const FIRST_CRAWL = "2026-09-01T08:00:00.000Z";
const LATEST_RECRAWL = "2026-10-05T08:00:00.000Z";

test("a scheduled recrawl does not move the lead visibility boundary", () => {
  // The profile timestamp advances on every recrawl and brief save. Leads
  // verified between the first crawl and that update must stay visible.
  assert.equal(
    leadVisibilitySince({
      websiteFirstCrawledAt: FIRST_CRAWL,
      profileUpdatedAt: LATEST_RECRAWL,
    }),
    FIRST_CRAWL,
  );
});

test("a replaced website still hides the previous site's matches", () => {
  // The new website gets its own ledger row, created at the replacement.
  const replacedAt = "2026-10-04T12:00:00.000Z";
  const boundary = leadVisibilitySince({
    websiteFirstCrawledAt: replacedAt,
    profileUpdatedAt: LATEST_RECRAWL,
  });
  assert.equal(boundary, replacedAt);
  assert.ok(Date.parse("2026-09-20T00:00:00.000Z") < Date.parse(boundary ?? ""));
});

test("without a crawl ledger row the stricter legacy guard is kept", () => {
  for (const missing of [null, undefined, "", "not-a-date"]) {
    assert.equal(
      leadVisibilitySince({
        websiteFirstCrawledAt: missing,
        profileUpdatedAt: LATEST_RECRAWL,
      }),
      LATEST_RECRAWL,
    );
  }
});

test("a recreated ledger row cannot hide leads the profile already had", () => {
  assert.equal(
    leadVisibilitySince({
      websiteFirstCrawledAt: LATEST_RECRAWL,
      profileUpdatedAt: FIRST_CRAWL,
    }),
    FIRST_CRAWL,
  );
});

test("no usable timestamp means no boundary", () => {
  assert.equal(
    leadVisibilitySince({ websiteFirstCrawledAt: null, profileUpdatedAt: null }),
    null,
  );
});
