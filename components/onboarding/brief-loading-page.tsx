"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  CrawlJobView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import type { CrawlPageSummary } from "@/lib/onboarding/crawl-pages";
import { CrawlReadingScreen } from "./crawl-reading-screen";

type BriefLoadingPageProps = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  crawledPages: CrawlPageSummary[];
  scanWasJustRequested?: boolean;
};

const WORKER_START_TIMEOUT_SECONDS = 10 * 60;

export function BriefLoadingPage({
  websiteUrl,
  crawlJob,
  serviceProfile,
  crawledPages,
  scanWasJustRequested = false,
}: BriefLoadingPageProps) {
  const router = useRouter();
  const [waitedSeconds, setWaitedSeconds] = useState(0);
  const crawlStatus = crawlJob?.status?.trim().toLowerCase() ?? null;
  const crawlActive = ["queued", "pending", "processing"].includes(crawlStatus ?? "");
  const crawlFailed = crawlStatus === "failed" || crawlStatus === "dead_lettered";
  const lastProgressAt = Date.parse(crawlJob?.lastHeartbeatAt ?? crawlJob?.updatedAt ?? "");
  const crawlStalled =
    crawlActive && Number.isFinite(lastProgressAt) && Date.now() - lastProgressAt > 10 * 60 * 1000;
  const briefReady = serviceProfile.hasProfile && !crawlActive && !crawlFailed;
  const waitingForWorker = scanWasJustRequested && !crawlJob && !serviceProfile.hasProfile;
  const workerStartTimedOut = waitingForWorker && waitedSeconds >= WORKER_START_TIMEOUT_SECONDS;
  const awaitingJob = waitingForWorker && waitedSeconds < 25;
  const hasError = crawlFailed || crawlStalled || workerStartTimedOut ||
    (!crawlJob && !serviceProfile.hasProfile && !waitingForWorker) ||
    (crawlStatus === "completed" && !serviceProfile.hasProfile);

  useEffect(() => {
    if (!waitingForWorker || workerStartTimedOut) return;
    const intervalId = window.setInterval(() => setWaitedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [waitingForWorker, workerStartTimedOut]);

  useEffect(() => {
    if (briefReady || hasError) return;
    const intervalId = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(intervalId);
  }, [briefReady, hasError, router]);

  useEffect(() => {
    if (!briefReady) return;
    const timeoutId = window.setTimeout(() => router.replace("/dashboard"), 900);
    return () => window.clearTimeout(timeoutId);
  }, [briefReady, router]);

  const title = hasError
    ? "Your website brief needs attention"
    : briefReady
      ? "Your website brief is ready"
        : awaitingJob
          ? "Starting your website read"
        : waitingForWorker
          ? "Waiting for the website worker"
          : crawlStatus === "queued" || crawlStatus === "pending"
            ? "Your website is queued"
            : "Reading your website";
  const detail = hasError
    ? crawlJob?.errorMessage ?? crawlJob?.failureReason ??
      (workerStartTimedOut
        ? "Your request was accepted, but the website worker has not started it. Please try again later or contact support."
        : "The website read stopped before a brief was created. View the crawl status and retry.")
    : briefReady
      ? "Opening your brief now. Public-conversation discovery starts on Pro."
      : waitingForWorker && !awaitingJob
        ? "Your request is saved. The website worker has not started yet; this page will keep checking."
        : "We are preparing the audience and problem criteria for your free brief. Public conversations are not being searched on Free.";

  return (
    <CrawlReadingScreen
      websiteUrl={websiteUrl}
      crawlJob={crawlJob}
      serviceProfile={serviceProfile}
      pages={crawledPages}
      eyebrow="FREE WEBSITE BRIEF"
      title={title}
      detail={detail}
      hasError={hasError}
    >
      {hasError ? (
        <>
          <Link href="/onboarding/workspace?edit=1">View crawl status and retry</Link>
          {serviceProfile.hasProfile ? <Link href="/dashboard">Open existing brief</Link> : null}
        </>
      ) : briefReady ? (
        <Link href="/dashboard">Open website brief</Link>
      ) : (
        <span>We'll keep checking for updates while this page is open.</span>
      )}
    </CrawlReadingScreen>
  );
}
