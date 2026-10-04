"use client";

import {
  AlertCircle,
  Loader2,
  Send,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CrawlPageSummary } from "@/lib/onboarding/crawl-pages";
import type {
  CrawlJobView,
  ProspectActionResult,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ResultText } from "./workspace-provisioning-states";
import { CrawlReadingScreen } from "./crawl-reading-screen";

export const LOCAL_CRAWL_TRIGGER_GRACE_MS = 25 * 1000;
const STALE_CRAWL_HEARTBEAT_MS = 4 * 60 * 1000;

export function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function timestampAgeMs(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;

  return now - parsed;
}

export function crawlJobNeedsAttention(
  crawlJob: CrawlJobView | null | undefined,
  now = Date.now(),
) {
  const status = normalizedStatus(crawlJob?.status);
  if (status === "failed" || status === "dead_lettered") return true;

  if (status === "pending" || status === "processing") {
    const heartbeatAge = timestampAgeMs(
      crawlJob?.lastHeartbeatAt ?? crawlJob?.updatedAt,
      now,
    );
    return heartbeatAge === null || heartbeatAge > STALE_CRAWL_HEARTBEAT_MS;
  }

  return !crawlJob;
}

export function crawlStatusMessage(crawlJob: CrawlJobView | null | undefined) {
  const status = normalizedStatus(crawlJob?.status);
  const phase = crawlJob?.phase?.replace(/_/g, " ") ?? null;

  if (status === "failed") {
    return crawlJob?.failureReason
      ? `The crawl failed during ${phase ?? "processing"}: ${crawlJob.failureReason}.`
      : "The crawl failed before a service profile was created.";
  }

  if (status === "dead_lettered") {
    return "The crawl retried too many times and was paused for review.";
  }

  if (status === "pending" || status === "processing") {
    return phase
      ? `The last crawl stopped reporting progress during ${phase}.`
      : "The last crawl stopped reporting progress.";
  }

  return "The website worker has not started a tracked crawl job for this request.";
}

function activeCrawlPhase(crawlJob: CrawlJobView | null | undefined) {
  const phase = normalizedStatus(crawlJob?.phase);
  if (!phase) return "queued";
  return phase;
}

function activeCrawlTitle(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const phaseLabels: Record<string, string> = {
    queued: "Queued for crawl",
    starting: "Starting crawler",
    crawling: "Crawling your website",
    crawl_persisted: "Website pages captured",
    extracting_profile: "Extracting service profile",
    persisting_profile: "Saving service profile",
  };

  return phaseLabels[phase] ?? "Crawling your website";
}

function activeCrawlDetail(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const phaseDetails: Record<string, string> = {
    queued: "Waiting for the worker to claim the job.",
    starting: "The worker has picked up the website.",
    crawling: "Collecting the homepage and high-signal product pages.",
    crawl_persisted: "Raw page content was saved. Profile extraction is next.",
    extracting_profile: "Extracting audience, pain, value proposition, and bad-fit signals.",
    persisting_profile: "Writing the extracted profile to your workspace.",
  };

  return phaseDetails[phase] ?? "Working on your service profile.";
}

export function formatStatusAge(crawlJob: CrawlJobView | null | undefined, now = Date.now()) {
  const ageMs = timestampAgeMs(
    crawlJob?.lastHeartbeatAt ?? crawlJob?.updatedAt,
    now,
  );
  if (ageMs === null || ageMs < 0) return "just now";

  const totalSeconds = Math.floor(ageMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s ago`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  return `${totalMinutes}m ago`;
}

type CrawlAttentionStateProps = {
  crawlJob: CrawlJobView | null | undefined;
  crawledPages: CrawlPageSummary[];
  serviceProfile: Pick<ServiceProfileView, "hasProfile" | "fields">;
  effectiveWebsiteUrl: string;
  isManualPending: boolean;
  isWebsitePending: boolean;
  statusNow: number;
  websiteResult: ProspectActionResult | null;
  retryCrawl: () => void;
  startManualProfile: () => void;
};

export function CrawlAttentionState({
  crawlJob,
  crawledPages,
  serviceProfile,
  effectiveWebsiteUrl,
  isManualPending,
  isWebsitePending,
  statusNow,
  websiteResult,
  retryCrawl,
  startManualProfile,
}: CrawlAttentionStateProps) {
  return (
    <CrawlReadingScreen
      websiteUrl={effectiveWebsiteUrl}
      crawlJob={crawlJob ?? null}
      serviceProfile={serviceProfile}
      pages={crawledPages}
      title="Your website read needs attention."
      detail={crawlStatusMessage(crawlJob)}
      hasError
    >
      <div className="arc-crawl-attention">
        <p><AlertCircle size={15} aria-hidden="true" />{crawlJob?.errorMessage ?? "The website read stopped before a brief was created."}</p>
        <div className="arc-crawl-attention__status"><span>Last update: {formatStatusAge(crawlJob, statusNow)}</span><span>Status: {crawlJob?.status ?? "not tracked"}</span><span>Phase: {crawlJob?.phase?.replace(/_/g, " ") ?? "missing"}</span></div>
        <div className="arc-crawl-attention__buttons">
          <Button type="button" disabled={isWebsitePending || isManualPending} onClick={retryCrawl}>
            {isWebsitePending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {isWebsitePending ? "Restarting..." : "Retry crawl"}
          </Button>
          <Button type="button" variant="outline" disabled={isWebsitePending || isManualPending} onClick={startManualProfile}>
            {isManualPending ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
            {isManualPending ? "Opening..." : "Enter manually"}
          </Button>
        </div>
        <ResultText result={websiteResult} />
      </div>
    </CrawlReadingScreen>
  );
}

type ActiveCrawlStateProps = {
  crawlJob: CrawlJobView | null | undefined;
  crawledPages: CrawlPageSummary[];
  serviceProfile: Pick<ServiceProfileView, "hasProfile" | "fields">;
  effectiveWebsiteUrl: string;
  isManualPending: boolean;
  statusNow: number;
  websiteResult: ProspectActionResult | null;
  startManualProfile: () => void;
  onRefreshStatus: () => void;
};

export function ActiveCrawlState({
  crawlJob,
  crawledPages,
  serviceProfile,
  effectiveWebsiteUrl,
  isManualPending,
  statusNow,
  websiteResult,
  startManualProfile,
  onRefreshStatus,
}: ActiveCrawlStateProps) {
  return (
    <CrawlReadingScreen
      websiteUrl={effectiveWebsiteUrl}
      crawlJob={crawlJob ?? null}
      serviceProfile={serviceProfile}
      pages={crawledPages}
      title={activeCrawlTitle(crawlJob)}
      detail={activeCrawlDetail(crawlJob)}
    >
      <span>{crawlJob ? `Last update ${formatStatusAge(crawlJob, statusNow)}.` : "Sending request."}</span>
      <Button type="button" variant="outline" disabled={isManualPending} onClick={startManualProfile}>
        {isManualPending ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
        Enter manually
      </Button>
      <Button type="button" variant="outline" onClick={onRefreshStatus}>Refresh status</Button>
      <ResultText result={websiteResult} />
    </CrawlReadingScreen>
  );
}
