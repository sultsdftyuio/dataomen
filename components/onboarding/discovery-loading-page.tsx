"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  FileSearch,
  Globe2,
  Loader2,
  Radar,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
  icon: typeof Globe2;
};

const STAGES: DiscoveryStage[] = [
  {
    label: "Understand your website",
    detail: "Learning what you offer and who it is for.",
    icon: Globe2,
  },
  {
    label: "Learn what to look for",
    detail: "Using your website to understand the problems you solve.",
    icon: FileSearch,
  },
  {
    label: "Look for new customers",
    detail: "Finding people online who may need what you offer.",
    icon: Radar,
  },
  {
    label: "Check the best matches",
    detail: "Making sure the results are worth your time.",
    icon: Target,
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
      className={`flex ${isWorkspaceScan ? "min-h-full py-3" : "min-h-screen py-8"} items-center overflow-hidden px-4 sm:px-6`}
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <div className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <section className="max-w-xl">
          <div
            className="mb-6 inline-flex size-12 items-center justify-center rounded-xl border shadow-sm"
            style={{ borderColor: C.blueLight, backgroundColor: C.bluePale, color: C.blue }}
          >
            {hasError ? (
              <AlertCircle className="size-6" aria-hidden="true" />
            ) : isReady ? (
              <Check className="size-6" aria-hidden="true" />
            ) : (
              <Radar className="size-6" aria-hidden="true" />
            )}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blue }}>
            {isWorkspaceScan ? "Refresh your discovery" : "Build your discovery source"}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.02] tracking-tight sm:text-5xl" style={{ color: C.navy }}>
            {status.title}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7" style={{ color: C.muted }}>
            {status.detail}
          </p>
          <div
            className="mt-7 flex max-w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
            style={{ borderColor: C.rule }}
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <Globe2 className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>
                Website source
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: C.navy }}>
                {domain}
              </p>
            </div>
          </div>
          {!hasError && !isReady ? (
            <div className="mt-5 rounded-xl border bg-white px-4 py-3 shadow-sm" style={{ borderColor: C.rule }}>
              <p className="text-xs font-semibold" style={{ color: C.navy }}>
                {lastUpdate}
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                {isQueued
                  ? "Your place is saved. The scan begins automatically when the current website finishes."
                  : "You can leave this page open. It refreshes automatically while we prepare your results."}
              </p>
            </div>
          ) : null}
          {isTakingLongerThanUsual ? (
            <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: C.amber, backgroundColor: C.amberPale }}>
              <p className="text-xs font-semibold" style={{ color: C.navy }}>
                Taking longer than usual?
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                Keep this page open while we continue. If the website address needs changing, you can update it in settings.
              </p>
              <Link href="/settings" className="mt-2 inline-flex text-xs font-semibold underline underline-offset-2" style={{ color: C.blue }}>
                Check website settings
              </Link>
            </div>
          ) : null}
          {hasError ? (
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-10" style={{ backgroundColor: C.navy, color: C.white }}>
                <Link href="/settings">Check website settings</Link>
              </Button>
              <Button asChild variant="outline" className="h-10" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          ) : null}
        </section>

        <section
          className="relative overflow-hidden rounded-2xl border bg-white shadow-lg"
          style={{ borderColor: C.rule }}
          aria-label="Discovery progress"
        >
          <div className="h-1.5" style={{ backgroundColor: hasError ? C.red : isReady ? C.green : C.blue }} />
          <div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full" style={{ backgroundColor: C.blueTint }} />
          <div className="relative p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ backgroundColor: C.bluePale, color: C.blue }}
              >
                {isWorkspaceScan ? "Fresh scan" : "Step 2 of 3"}
              </span>
              {!hasError && !isReady ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: C.muted }}>
                  <Loader2 className="size-3.5 animate-spin" style={{ color: C.blue }} aria-hidden="true" />
                  Live updates
                </span>
              ) : null}
            </div>
            <div className="mt-5">
              <p className="text-2xl font-semibold tracking-tight" style={{ color: C.navy }}>
                {hasError ? "Your scan needs attention" : isReady ? "Your discovery is ready" : "Preparing your discovery"}
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
                {hasError
                  ? "We saved your workspace details, but this run could not complete."
                  : isReady
                    ? "We are opening your refreshed prospect desk now."
                    : "We work through these steps in order so each search is grounded in your business."}
              </p>
            </div>

            <ol className="mt-7 divide-y" style={{ borderColor: C.rule }}>
              {STAGES.map((stage, index) => {
                const Icon = stage.icon;
                const isComplete = isReady || index < activeIndex;
                const isActive = !hasError && !isReady && index === activeIndex;
                return (
                  <li key={stage.label} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: isComplete ? C.blue : isActive ? C.bluePale : C.offWhite,
                        color: isComplete ? C.white : isActive ? C.blue : C.muted,
                      }}
                    >
                      {isComplete ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Icon className={isActive ? "size-4 animate-pulse" : "size-4"} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold" style={{ color: isComplete || isActive ? C.navy : C.navySoft }}>
                          {stage.label}
                        </span>
                        {isActive ? (
                          <span className="shrink-0 text-[11px] font-semibold" style={{ color: C.blue }}>
                            {isQueued && index === 0 ? "Queued" : "In progress"}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5" style={{ color: C.muted }}>
                        {stage.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}
