import assert from "node:assert/strict";
import test from "node:test";

import type {
  CrawlJobView,
  ServiceProfileView,
} from "../app/(dashboard)/dashboard/prospect-types";
import { deriveDiscoveryStatus } from "../components/discovery/discovery-status";

const MINUTE = 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function crawl(overrides: Partial<CrawlJobView> = {}): CrawlJobView {
  return {
    id: "crawl-1",
    status: "processing",
    phase: "crawling",
    failureReason: null,
    errorType: null,
    errorMessage: null,
    lastHeartbeatAt: ago(30 * 1000),
    createdAt: ago(48 * 60 * MINUTE),
    updatedAt: ago(30 * 1000),
    ...overrides,
  };
}

function profile(overrides: Partial<ServiceProfileView> = {}): ServiceProfileView {
  return {
    id: "profile-1",
    hasProfile: true,
    status: "approved",
    extractionStatus: "completed",
    embeddingStatus: "completed",
    embeddingFailureReason: null,
    embeddingGeneratedAt: ago(48 * 60 * MINUTE),
    websiteUrl: "https://northwind.io",
    updatedAt: ago(48 * 60 * MINUTE),
    fields: {} as ServiceProfileView["fields"],
    rawProfile: null,
    ...overrides,
  };
}

const base = {
  websiteUrl: "https://northwind.io",
  buyerDemandReport: null,
  isWarmingUp: false,
  mode: "scan" as const,
};

test("a rescan of a website with a brief shows the reading step, not the last step", () => {
  const status = deriveDiscoveryStatus({ ...base, crawlJob: crawl(), serviceProfile: profile() });
  assert.equal(status.kind, "working");
  assert.equal(status.stepIndex, 0);
  assert.equal(status.title, "Re-reading your website");
});

test("a stalled rescan is reported even when a brief already exists", () => {
  const status = deriveDiscoveryStatus({
    ...base,
    crawlJob: crawl({ lastHeartbeatAt: ago(14 * MINUTE), updatedAt: ago(14 * MINUTE) }),
    serviceProfile: profile(),
  });
  assert.equal(status.kind, "error");
  assert.equal(status.failedStep, 0);
  assert.equal(status.recovery, "check-again");
  assert.equal(status.recoverable, true);
});

test("crawl failures never show the worker's raw message", () => {
  const status = deriveDiscoveryStatus({
    ...base,
    crawlJob: crawl({
      status: "failed",
      phase: "admission_rejected",
      failureReason: "admission_rejected",
      errorMessage: "The shared website-crawl queue reached its bounded admission capacity.",
    }),
    serviceProfile: profile({ hasProfile: false, id: null }),
  });
  assert.equal(status.kind, "error");
  assert.ok(!status.detail.includes("admission"));
  assert.equal(status.recovery, "open-prospects");
});

test("a failed brief stops at step 2 even when a search was just requested", () => {
  const status = deriveDiscoveryStatus({
    ...base,
    crawlJob: crawl({ status: "completed", phase: "completed" }),
    serviceProfile: profile({ embeddingStatus: "failed", embeddingFailureReason: "time_limit_exceeded" }),
    awaitingDiscoveryStart: true,
  });
  assert.equal(status.failedStep, 1);
  assert.equal(status.recovery, "retry-brief");
  assert.ok(!status.detail.includes("time_limit_exceeded"));
});
