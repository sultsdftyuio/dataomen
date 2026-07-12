"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { C } from "@/lib/tokens";
import type {
  CrawlJobView,
  ProspectActionResult,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ResultText } from "./workspace-provisioning-states";

export const LOCAL_CRAWL_TRIGGER_GRACE_MS = 25 * 1000;
const STALE_CRAWL_HEARTBEAT_MS = 4 * 60 * 1000;

export const CRAWL_PHASES = [
  { key: "queued", label: "Queued" },
  { key: "crawling", label: "Crawling pages" },
  { key: "crawl_persisted", label: "Pages captured" },
  { key: "extracting_profile", label: "Extracting profile" },
  { key: "persisting_profile", label: "Saving brief" },
] as const;

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

  return "This website was submitted before crawl tracking was available.";
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

function crawlProgressValue(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const progress: Record<string, number> = {
    queued: 12,
    starting: 20,
    crawling: 42,
    crawl_persisted: 62,
    extracting_profile: 78,
    persisting_profile: 90,
  };

  return progress[phase] ?? 28;
}

function crawlStepState(
  stepKey: string,
  crawlJob: CrawlJobView | null | undefined,
) {
  const activeIndex = CRAWL_PHASES.findIndex(
    (phase) => phase.key === activeCrawlPhase(crawlJob),
  );
  const stepIndex = CRAWL_PHASES.findIndex((phase) => phase.key === stepKey);

  if (activeIndex < 0) return "pending";
  if (stepIndex < activeIndex) return "complete";
  if (stepIndex === activeIndex) return "active";
  return "pending";
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
  effectiveWebsiteUrl,
  isManualPending,
  isWebsitePending,
  statusNow,
  websiteResult,
  retryCrawl,
  startManualProfile,
}: CrawlAttentionStateProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="space-y-3 text-center">
          <div
            className="mx-auto flex size-11 items-center justify-center rounded-md"
            style={{ backgroundColor: C.redPale, color: C.red }}
          >
            <AlertCircle className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl" style={{ color: C.navy }}>
              Crawl needs attention
            </CardTitle>
            <CardDescription className="mt-2" style={{ color: C.muted }}>
              {effectiveWebsiteUrl}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="rounded-md border px-3 py-3 text-sm leading-6"
            style={{
              borderColor: C.red,
              backgroundColor: C.redPale,
              color: C.red,
            }}
          >
            {crawlStatusMessage(crawlJob)}
          </div>
          {crawlJob?.errorMessage ? (
            <p className="text-xs leading-5" style={{ color: C.muted }}>
              {crawlJob.errorMessage}
            </p>
          ) : null}
          <div
            className="grid gap-2 rounded-md border p-3 text-left text-xs"
            style={{ borderColor: C.rule, backgroundColor: C.white }}
          >
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: C.muted }}>Last backend signal</span>
              <span className="font-semibold" style={{ color: C.navy }}>
                {formatStatusAge(crawlJob, statusNow)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: C.muted }}>Status</span>
              <span className="font-semibold" style={{ color: C.navy }}>
                {crawlJob?.status ?? "not tracked"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: C.muted }}>Phase</span>
              <span className="font-semibold" style={{ color: C.navy }}>
                {crawlJob?.phase?.replace(/_/g, " ") ?? "missing"}
              </span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={isWebsitePending || isManualPending}
              className="w-full"
              onClick={retryCrawl}
              style={{ backgroundColor: C.navy, color: C.white }}
            >
              {isWebsitePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {isWebsitePending ? "Restarting..." : "Retry crawl"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isWebsitePending || isManualPending}
              className="w-full"
              onClick={startManualProfile}
              style={{
                borderColor: C.ruleDark,
                backgroundColor: C.white,
                color: C.navy,
              }}
            >
              {isManualPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Target className="size-4" />
              )}
              {isManualPending ? "Opening..." : "Enter manually"}
            </Button>
          </div>
          <ResultText result={websiteResult} />
        </CardContent>
      </Card>
    </main>
  );
}

type ActiveCrawlStateProps = {
  crawlJob: CrawlJobView | null | undefined;
  effectiveWebsiteUrl: string;
  isManualPending: boolean;
  statusNow: number;
  websiteResult: ProspectActionResult | null;
  startManualProfile: () => void;
  onRefreshStatus: () => void;
};

export function ActiveCrawlState({
  crawlJob,
  effectiveWebsiteUrl,
  isManualPending,
  statusNow,
  websiteResult,
  startManualProfile,
  onRefreshStatus,
}: ActiveCrawlStateProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="space-y-3 text-center">
          <div
            className="mx-auto flex size-11 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Sparkles className="size-5 animate-pulse" />
          </div>
          <div>
            <CardTitle className="text-xl" style={{ color: C.navy }}>
              {activeCrawlTitle(crawlJob)}
            </CardTitle>
            <CardDescription className="mt-2" style={{ color: C.muted }}>
              {effectiveWebsiteUrl}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span style={{ color: C.muted }}>
                {activeCrawlDetail(crawlJob)}
              </span>
              <span style={{ color: C.blue }}>
                {crawlJob
                  ? `Signal ${formatStatusAge(crawlJob, statusNow)}`
                  : "Sending trigger"}
              </span>
            </div>
            <Progress value={crawlProgressValue(crawlJob)} />
          </div>
          <div
            className="grid gap-2 rounded-md border p-3"
            style={{ borderColor: C.rule, backgroundColor: C.white }}
          >
            {CRAWL_PHASES.map((phase) => {
              const state = crawlStepState(phase.key, crawlJob);
              return (
                <div
                  key={phase.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                      style={{
                        borderColor:
                          state === "complete" || state === "active"
                            ? C.blue
                            : C.ruleDark,
                        backgroundColor:
                          state === "complete"
                            ? C.blue
                            : state === "active"
                              ? C.bluePale
                              : C.white,
                        color:
                          state === "complete"
                            ? C.white
                            : state === "active"
                              ? C.blue
                              : C.muted,
                      }}
                    >
                      {state === "complete" ? <CheckCircle2 className="size-3" /> : null}
                    </span>
                    <span
                      className="truncate"
                      style={{ color: state === "pending" ? C.muted : C.navy }}
                    >
                      {phase.label}
                    </span>
                  </div>
                  {state === "active" ? (
                    <Loader2 className="size-3.5 animate-spin" style={{ color: C.blue }} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isManualPending}
              onClick={startManualProfile}
              style={{
                borderColor: C.ruleDark,
                backgroundColor: C.white,
                color: C.navy,
              }}
            >
              {isManualPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Target className="size-4" />
              )}
              Enter manually
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRefreshStatus}
              style={{
                borderColor: C.ruleDark,
                backgroundColor: C.white,
                color: C.navy,
              }}
            >
              Refresh status
            </Button>
          </div>
          <ResultText result={websiteResult} />
        </CardContent>
      </Card>
    </main>
  );
}
