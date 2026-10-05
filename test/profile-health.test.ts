import assert from "node:assert/strict";
import test from "node:test";

import {
  STALLED_EMBEDDING_MS,
  profileHealthIssue,
} from "../app/(dashboard)/dashboard/profile-health";
import type {
  CrawlJobView,
  ServiceProfileView,
} from "../app/(dashboard)/dashboard/prospect-types";

const NOW = Date.parse("2026-10-05T12:00:00Z");

function profile(overrides: Partial<ServiceProfileView> = {}): ServiceProfileView {
  return {
    id: "profile-1",
    hasProfile: true,
    status: "ready",
    extractionStatus: "completed",
    embeddingStatus: "completed",
    embeddingFailureReason: null,
    embeddingGeneratedAt: null,
    websiteUrl: "https://example.com",
    updatedAt: new Date(NOW - 60_000).toISOString(),
    fields: {} as ServiceProfileView["fields"],
    rawProfile: null,
    ...overrides,
  };
}

function crawl(status: string): CrawlJobView {
  return {
    id: "crawl-1",
    status,
    phase: null,
    failureReason: null,
    errorType: null,
    errorMessage: "timeout fetching homepage",
    lastHeartbeatAt: null,
    updatedAt: null,
  };
}

test("a healthy profile shows no banner", () => {
  assert.equal(profileHealthIssue(crawl("completed"), profile(), NOW), null);
});

test("a failed crawl offers a re-crawl and keeps the raw error for support", () => {
  const issue = profileHealthIssue(crawl("dead_lettered"), profile(), NOW);
  assert.equal(issue?.action, "rebuild_profile");
  assert.equal(issue?.technicalDetail, "timeout fetching homepage");
});

test("a failed embedding offers a retry", () => {
  const issue = profileHealthIssue(null, profile({ embeddingStatus: "failed" }), NOW);
  assert.equal(issue?.kind, "embedding_failed");
  assert.equal(issue?.action, "retry_embedding");
});

test("missing profile content sends people to the brief instead of retrying", () => {
  const issue = profileHealthIssue(
    null,
    profile({ embeddingStatus: "failed", embeddingFailureReason: "profile_content_missing" }),
    NOW,
  );
  assert.equal(issue?.action, "edit_brief");
});

test("an in-progress embedding is only flagged once it has stalled", () => {
  const fresh = profile({ embeddingStatus: "processing" });
  assert.equal(profileHealthIssue(null, fresh, NOW), null);

  const stalled = profile({
    embeddingStatus: "processing",
    updatedAt: new Date(NOW - STALLED_EMBEDDING_MS - 1).toISOString(),
  });
  assert.equal(profileHealthIssue(null, stalled, NOW)?.kind, "embedding_stalled");
});
