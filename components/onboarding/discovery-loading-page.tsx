"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LiveDiscoveryFunnel } from "@/components/discovery/live-discovery-funnel";
import { C } from "@/lib/tokens";
import type {
  BuyerDemandReportView,
  CrawlJobView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

type DiscoveryLoadingPageProps = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  buyerDemandReport: BuyerDemandReportView | null;
  isWarmingUp: boolean;
  mode?: "onboarding" | "scan";
};

type DiscoveryStage = {
  label: string;
  detail: string;
};

const STAGES: DiscoveryStage[] = [
  {
    label: "Understand your website",
    detail: "Learning what you offer and who it is for.",
  },
  {
    label: "Learn what to look for",
    detail: "Using your website to understand the problems you solve.",
  },
  {
    label: "Look for new customers",
    detail: "Finding people online who may need what you offer.",
  },
  {
    label: "Check the best matches",
    detail: "Making sure the results are worth your time.",
  },
];

const STALLED_CRAWL_MS = 10 * 60 * 1000;

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function websiteDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

function relativeTime(value: string | null | undefined) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "Waiting for the first update";

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 15) return "Updated just now";
  if (seconds < 60) return "Updated less than a minute ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

function activeStageIndex({
  crawlJob,
  serviceProfile,
  isWarmingUp,
  buyerDemandReport,
}: Omit<DiscoveryLoadingPageProps, "websiteUrl">) {
  if (buyerDemandReport?.isTerminal) return STAGES.length;

  const crawlPhase = normalizedStatus(crawlJob?.phase);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);

  if (!serviceProfile.hasProfile) {
    return ["crawl_persisted", "extracting_profile", "persisting_profile"].includes(
      crawlPhase ?? "",
    )
      ? 1
      : 0;
  }

  if (embeddingStatus && embeddingStatus !== "completed") return 1;
  return isWarmingUp ? 2 : 3;
}

function isActiveCrawlStalled(crawlJob: CrawlJobView | null) {
  const status = normalizedStatus(crawlJob?.status);
  if (!crawlJob || !["queued", "pending", "processing"].includes(status ?? "")) {
    return false;
  }

  const timestamp = Date.parse(
    crawlJob.lastHeartbeatAt ?? crawlJob.updatedAt ?? "",
  );
  return Number.isFinite(timestamp) && Date.now() - timestamp > STALLED_CRAWL_MS;
}

function statusMessage({
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
  mode = "onboarding",
}: Omit<DiscoveryLoadingPageProps, "websiteUrl">) {
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const crawlPhase = normalizedStatus(crawlJob?.phase);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);

  if (!crawlJob && !serviceProfile.hasProfile) {
    return {
      kind: "error" as const,
      title: mode === "scan" ? "Your scan did not start." : "Your first scan did not start.",
      detail:
        "We could not confirm that your website was added to the scan queue. Open the dashboard to retry or check your website settings.",
    };
  }

  if (["failed", "dead_lettered"].includes(crawlStatus ?? "")) {
    return {
      kind: "error" as const,
      title: "We couldn't finish reading this website.",
      detail:
        crawlJob?.errorMessage ??
        crawlJob?.failureReason ??
        "Check the website address and try the crawl again.",
    };
  }

  if (!serviceProfile.hasProfile && isActiveCrawlStalled(crawlJob)) {
    return {
      kind: "error" as const,
      title: "Your website scan has stopped updating.",
      detail:
        "It has not reported progress for more than 10 minutes. Open the dashboard to retry after checking the website address.",
    };
  }

  if (!serviceProfile.hasProfile && crawlStatus === "completed") {
    return {
      kind: "error" as const,
      title: "We could not build your website profile.",
      detail:
        "The website scan finished without creating a profile. Open the dashboard to check the website address and try again.",
    };
  }

  if (["failed", "error", "dead_lettered"].includes(embeddingStatus ?? "")) {
    return {
      kind: "error" as const,
      title: "Your matching brief needs attention.",
      detail:
        serviceProfile.embeddingFailureReason ??
        "The website was read, but we could not prepare the matching brief.",
    };
  }

  if (buyerDemandReport?.isTerminal) {
    return {
      kind: "ready" as const,
      title: mode === "scan" ? "Your fresh results are ready." : "Your first results are ready.",
      detail: "Taking you to your dashboard now.",
    };
  }

  if (!serviceProfile.hasProfile && crawlPhase === "queued") {
    return {
      kind: "working" as const,
      queued: true,
      title: "Your website scan is queued.",
      detail:
        "Arcli is processing one website at a time on the current plan. Your scan will start automatically, and you can safely leave this page.",
    };
  }

  if (!serviceProfile.hasProfile) {
    return {
      kind: "working" as const,
      title: "Reading your website.",
      detail: "We are finding the key pages behind your product and positioning.",
    };
  }

  if (embeddingStatus && embeddingStatus !== "completed") {
    return {
      kind: "working" as const,
      title: "Learning what to look for.",
      detail: "We are using your website to understand the people you want to reach.",
    };
  }

  if (isWarmingUp) {
    return {
      kind: "working" as const,
      title: "Looking for people who need this.",
      detail: "We are checking public conversations and filtering out poor matches.",
    };
  }

  if (crawlStatus === "completed") {
    return {
      kind: "ready" as const,
      title: mode === "scan" ? "Your latest scan is ready." : "Your website is ready.",
      detail: "Opening your dashboard while we finish checking new conversations.",
    };
  }

  return {
    kind: "working" as const,
    title: mode === "scan" ? "Finishing your latest scan." : "Finishing up your first scan.",
    detail: "We are doing a final check before showing your results.",
  };
}

export function DiscoveryLoadingPage({
  websiteUrl,
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
  mode = "onboarding",
}: DiscoveryLoadingPageProps) {
  const router = useRouter();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const context = { crawlJob, serviceProfile, buyerDemandReport, isWarmingUp, mode };
  const activeIndex = activeStageIndex(context);
  const status = statusMessage(context);
  const domain = useMemo(() => websiteDomain(websiteUrl), [websiteUrl]);
  const hasError = status.kind === "error";
  const isReady = status.kind === "ready";
  const isQueued = status.kind === "working" && status.queued === true;
  const lastUpdate = relativeTime(
    crawlJob?.lastHeartbeatAt ??
      crawlJob?.updatedAt ??
      serviceProfile.updatedAt ??
      buyerDemandReport?.updatedAt,
  );
  const isTakingLongerThanUsual =
    !hasError && !isReady && !isQueued && elapsedSeconds >= 90;
  const isWorkspaceScan = mode === "scan";
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);
  const canShowLiveFunnel =
    Boolean(buyerDemandReport) ||
    (serviceProfile.hasProfile &&
      (!embeddingStatus || embeddingStatus === "completed"));

  useEffect(() => {
    if (hasError || isReady) return;

    const refreshId = window.setInterval(() => router.refresh(), 3500);
    const timerId = window.setInterval(
      () => setElapsedSeconds((seconds) => seconds + 1),
      1000,
    );

    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(timerId);
    };
  }, [hasError, isReady, router]);

  useEffect(() => {
    if (!isReady) return;

    const redirectId = window.setTimeout(() => router.replace("/dashboard"), 900);
    return () => window.clearTimeout(redirectId);
  }, [isReady, router]);

  return (
    <main
      className={`relative isolate flex ${isWorkspaceScan ? "min-h-full py-10" : "min-h-screen py-12"} items-center justify-center overflow-hidden px-5 sm:px-8`}
      style={{
        backgroundColor: C.offWhite,
        backgroundImage:
          "radial-gradient(circle at 50% 18%, rgba(27, 110, 191, 0.10), transparent 28rem)",
        color: C.text,
      }}
    >
      <div className="relative w-full max-w-3xl text-center">
        <div
          className="mx-auto flex size-10 items-center justify-center rounded-full border"
          style={{
            borderColor: hasError ? "rgba(220, 38, 38, 0.22)" : isReady ? "rgba(16, 185, 129, 0.22)" : C.blueLight,
            backgroundColor: hasError ? "#FEF2F2" : isReady ? C.greenPale : C.bluePale,
            color: hasError ? C.red : isReady ? C.green : C.blue,
          }}
        >
          {hasError ? (
            <AlertCircle className="size-[18px]" aria-hidden="true" />
          ) : isReady ? (
            <Check className="size-[18px]" aria-hidden="true" />
          ) : (
            <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
          )}
        </div>

        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blue }}>
          {isWorkspaceScan ? "Updating your discovery" : "Setting up your discovery"}
        </p>
        <h1 className="mx-auto mt-2 max-w-xl text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]" style={{ color: C.navy }}>
          {status.title}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 sm:text-[15px]" style={{ color: C.muted }}>
          {status.detail}
        </p>

        <div
          className="mt-5 inline-flex max-w-full items-center rounded-full border px-3 py-1.5"
          style={{ borderColor: C.rule, backgroundColor: "rgba(255, 255, 255, 0.62)" }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.navySoft }}>
            Website
          </span>
          <span className="mx-2 h-3 w-px" style={{ backgroundColor: C.ruleDark }} />
          <span className="truncate text-xs font-semibold" style={{ color: C.navy }}>
            {domain}
          </span>
        </div>

        <section className="mt-9" aria-label="Discovery progress">
          <div className="flex items-center justify-between border-b pb-3 text-left" style={{ borderColor: C.rule }}>
            <p className="text-xs font-semibold" style={{ color: C.navy }}>
              Discovery progress
            </p>
            {!hasError && !isReady ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.muted }}>
                <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: C.blue }} />
                Live updates
              </span>
            ) : null}
          </div>

          <ol className="grid border-b text-left sm:grid-cols-4" style={{ borderColor: C.rule }}>
            {STAGES.map((stage, index) => {
              const isComplete = isReady || index < activeIndex;
              const isActive = !hasError && !isReady && index === activeIndex;
              const stageNumber = String(index + 1).padStart(2, "0");

              return (
                <li
                  key={stage.label}
                  className="min-h-32 border-b px-0 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
                  style={{ borderColor: C.rule }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: isComplete ? C.blue : isActive ? C.bluePale : "transparent",
                        border: isComplete || isActive ? "none" : `1px solid ${C.ruleDark}`,
                        color: isComplete ? C.white : isActive ? C.blue : C.muted,
                      }}
                    >
                      {isComplete ? <Check className="size-3.5" aria-hidden="true" /> : stageNumber}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: C.blue }}>
                        {isQueued && index === 0 ? "Queued" : "Active"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5" style={{ color: isComplete || isActive ? C.navy : C.navySoft }}>
                    {stage.label}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-[1.45]" style={{ color: C.muted }}>
                    {stage.detail}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {canShowLiveFunnel ? (
          <LiveDiscoveryFunnel
            report={buyerDemandReport}
            isWarmingUp={isWarmingUp}
            elapsedSeconds={elapsedSeconds}
          />
        ) : null}

        {!hasError && !isReady ? (
          <p className="mt-5 text-xs leading-5" style={{ color: C.muted }}>
            <span className="font-semibold" style={{ color: C.navy }}>{lastUpdate}.</span>{" "}
            {isQueued
              ? "Your place is saved and the scan starts automatically."
              : "You can leave this page — we will keep checking in the background."}
          </p>
        ) : null}

        {isTakingLongerThanUsual && !canShowLiveFunnel ? (
          <div className="mx-auto mt-6 max-w-lg border-t pt-4" style={{ borderColor: C.amber }}>
            <p className="text-xs font-semibold" style={{ color: C.navy }}>
              Still reading your website?
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
              Some sites take longer when key product pages are hard to reach. You can leave this page while the scan continues.
            </p>
            <Link href="/settings" className="mt-2 inline-flex text-xs font-semibold underline underline-offset-2" style={{ color: C.blue }}>
              Check website settings
            </Link>
          </div>
        ) : null}

        {hasError ? (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild className="h-10" style={{ backgroundColor: C.navy, color: C.white }}>
              <Link href="/settings">Check website settings</Link>
            </Button>
            <Button asChild variant="outline" className="h-10" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
