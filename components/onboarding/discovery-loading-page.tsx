"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DiscoveryRecoveryActions } from "@/components/discovery/discovery-recovery-actions";
import {
  DISCOVERY_STEPS,
  deriveDiscoveryStatus,
  isCrawlActive,
  isEmbeddingPending,
  latestUpdate,
  relativeUpdateLabel,
  websiteDomain,
  type DiscoveryStatus,
} from "@/components/discovery/discovery-status";
import { DiscoverySteps } from "@/components/discovery/discovery-steps";
import { LiveDiscoveryFunnel } from "@/components/discovery/live-discovery-funnel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrawlPageSummary } from "@/lib/onboarding/crawl-pages";
import { cn } from "@/lib/utils";
import type {
  BuyerDemandReportView,
  CrawlJobView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { CrawlReadingScreen } from "./crawl-reading-screen";

type DiscoveryLoadingPageProps = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  buyerDemandReport: BuyerDemandReportView | null;
  isWarmingUp: boolean;
  crawledPages?: CrawlPageSummary[];
  scanWasJustRequested?: boolean;
  awaitingDiscoveryStart?: boolean;
  mode?: "onboarding" | "scan";
};

const LIVE_REFRESH_MS = 3500;
// A heuristic failure (stalled, not confirmed) may still recover, so keep
// checking, just less often than a live scan.
const RECOVERABLE_REFRESH_MS = 15000;
const READY_REDIRECT_MS = 2500;
const SLOW_AFTER_SECONDS = 90;
// After this long, a just-requested scan with no job is treated as not started.
const START_GRACE_SECONDS = 600;

function StatusLabel({ status }: { status: DiscoveryStatus }) {
  if (status.kind === "error") return <StatusBadge tone="danger">Stopped</StatusBadge>;
  if (status.kind === "queued") return <StatusBadge tone="info" icon={Clock}>Queued</StatusBadge>;
  if (status.kind === "ready") {
    return status.partialCoverage ? (
      <StatusBadge tone="warning">Partial coverage</StatusBadge>
    ) : (
      <StatusBadge tone="success">Finished</StatusBadge>
    );
  }
  return <StatusBadge tone="progress">In progress</StatusBadge>;
}

function stepSummary(status: DiscoveryStatus) {
  const total = DISCOVERY_STEPS.length;
  if (status.failedStep !== undefined) return `Stopped at step ${status.failedStep + 1} of ${total}`;
  if (status.kind === "ready") return null;
  return `Step ${Math.min(status.stepIndex + 1, total)} of ${total}`;
}

export function DiscoveryLoadingPage({
  websiteUrl,
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
  crawledPages = [],
  scanWasJustRequested = false,
  awaitingDiscoveryStart = false,
  mode = "onboarding",
}: DiscoveryLoadingPageProps) {
  const router = useRouter();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const status = deriveDiscoveryStatus({
    websiteUrl,
    crawlJob,
    serviceProfile,
    buyerDemandReport,
    isWarmingUp,
    awaitingDiscoveryStart,
    scanWasJustRequested: scanWasJustRequested && elapsedSeconds < START_GRACE_SECONDS,
    mode,
  });
  const domain = websiteDomain(websiteUrl);
  const isWorking = status.kind === "working" || status.kind === "queued";
  const hasError = status.kind === "error";
  const isReady = status.kind === "ready";
  const refreshMs = isWorking
    ? LIVE_REFRESH_MS
    : hasError && status.recoverable
      ? RECOVERABLE_REFRESH_MS
      : null;
  const updateLabel = relativeUpdateLabel(
    latestUpdate({ crawlJob, serviceProfile, buyerDemandReport, awaitingDiscoveryStart }),
  );
  const isSlow = status.kind === "working" && elapsedSeconds >= SLOW_AFTER_SECONDS;
  // During a re-read the previous run's counts would describe old work, so the
  // findings panel waits until the brief is ready and no crawl is running.
  const canShowFindings =
    Boolean(buyerDemandReport) ||
    (serviceProfile.hasProfile && !isEmbeddingPending(serviceProfile) && !isCrawlActive(crawlJob));

  useEffect(() => {
    if (refreshMs === null) return;
    const refreshId = window.setInterval(() => router.refresh(), refreshMs);
    return () => window.clearInterval(refreshId);
  }, [refreshMs, router]);

  useEffect(() => {
    if (!isWorking) return;
    const timerId = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timerId);
  }, [isWorking]);

  useEffect(() => {
    if (!isReady) return;
    const redirectId = window.setTimeout(() => router.replace("/dashboard"), READY_REDIRECT_MS);
    return () => window.clearTimeout(redirectId);
  }, [isReady, router]);

  if (mode === "onboarding" && (!serviceProfile.hasProfile || isEmbeddingPending(serviceProfile))) {
    return (
      <CrawlReadingScreen
        websiteUrl={websiteUrl}
        crawlJob={crawlJob}
        serviceProfile={serviceProfile}
        pages={crawledPages}
        title={status.title}
        detail={status.detail}
        hasError={hasError}
      >
        {hasError ? (
          <>
            <Link href="/onboarding/workspace?edit=1">Check website and retry</Link>
            <Link href="/dashboard">Open Prospects</Link>
          </>
        ) : (
          <span>{updateLabel}. You can leave and come back while Arcli prepares your brief.</span>
        )}
      </CrawlReadingScreen>
    );
  }

  const summary = stepSummary(status);
  const content = (
    <>
      <PageHeader
        title="Live discovery"
        description={
          mode === "scan"
            ? `Progress of the latest scan for ${domain}.`
            : `Progress of your first scan for ${domain}.`
        }
        showDescription={mode !== "scan"}
        meta={isWorking || status.recoverable ? updateLabel : undefined}
        actions={
          isWorking ? (
            <Button asChild variant="outline" size="sm">
              {serviceProfile.hasProfile ? (
                <Link href="/dashboard/brief">Review targeting brief</Link>
              ) : (
                <Link href="/settings">Check website address</Link>
              )}
            </Button>
          ) : undefined
        }
      />

      <section
        aria-labelledby="discovery-status-title"
        className={cn(
          "rounded-lg border bg-card",
          hasError ? "border-danger/25" : "border-border",
        )}
      >
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusLabel status={status} />
            {summary ? <span className="text-xs leading-5 text-subtle">{summary}</span> : null}
          </div>
          {/* Announces working -> stopped/finished changes without moving focus. */}
          <div role="status" aria-live="polite" aria-atomic="true">
            <h2 id="discovery-status-title" className="mt-3 text-lg leading-7 font-semibold text-foreground">
              {status.title}
            </h2>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">{status.detail}</p>
          </div>

          {hasError && status.recovery ? (
            <DiscoveryRecoveryActions
              recovery={status.recovery}
              serviceProfileId={serviceProfile.id}
              failedStep={status.failedStep}
            />
          ) : null}
          {isReady ? (
            <div className="mt-4">
              <Button asChild>
                <Link href="/dashboard">Open Prospects</Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <DiscoverySteps status={status} />
        </div>
      </section>

      {canShowFindings ? <LiveDiscoveryFunnel report={buyerDemandReport} /> : null}

      {isWorking ? (
        <WorkingNote>
          {isSlow
            ? "This is taking longer than usual. Some websites and sources respond slowly. You can leave this page; the scan keeps running."
            : status.kind === "queued"
              ? "You can leave this page. The scan starts automatically."
              : "You can leave this page. The scan keeps running in the background."}
        </WorkingNote>
      ) : null}
    </>
  );

  // In the dashboard the shell already owns <main>; onboarding has no shell.
  if (mode === "scan") {
    return (
      <div className="arc-workspace-page">
        <div className="flex w-full max-w-4xl min-w-0 flex-col gap-5">{content}</div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-off-white px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">{content}</div>
    </main>
  );
}

function WorkingNote({ children }: { children: ReactNode }) {
  return <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{children}</p>;
}
