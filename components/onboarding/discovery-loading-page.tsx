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
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
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
  if (!crawlJob || !["pending", "processing"].includes(status ?? "")) {
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
}: Omit<DiscoveryLoadingPageProps, "websiteUrl">) {
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);

  if (!crawlJob && !serviceProfile.hasProfile) {
    return {
      kind: "error" as const,
      title: "Your first scan did not start.",
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
      title: "Your first results are ready.",
      detail: "Taking you to your dashboard now.",
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
      title: "Your website is ready.",
      detail: "Opening your dashboard while we finish checking new conversations.",
    };
  }

  return {
    kind: "working" as const,
    title: "Finishing up your first scan.",
    detail: "We are doing a final check before showing your results.",
  };
}

export function DiscoveryLoadingPage({
  websiteUrl,
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
}: DiscoveryLoadingPageProps) {
  const router = useRouter();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const context = { crawlJob, serviceProfile, buyerDemandReport, isWarmingUp };
  const activeIndex = activeStageIndex(context);
  const status = statusMessage(context);
  const domain = useMemo(() => websiteDomain(websiteUrl), [websiteUrl]);
  const hasError = status.kind === "error";
  const isReady = status.kind === "ready";
  const lastUpdate = relativeTime(
    crawlJob?.lastHeartbeatAt ??
      crawlJob?.updatedAt ??
      serviceProfile.updatedAt ??
      buyerDemandReport?.updatedAt,
  );
  const isTakingLongerThanUsual = !hasError && !isReady && elapsedSeconds >= 90;

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
      className="min-h-screen overflow-hidden px-5 py-6 sm:px-8 sm:py-8"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <Logo className="h-8" />

        <div className="grid flex-1 gap-7 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-16">
          <section className="max-w-lg">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
              style={{ borderColor: C.blueLight, backgroundColor: C.bluePale, color: C.blue }}
            >
              {hasError ? (
                <AlertCircle className="size-4" aria-hidden="true" />
              ) : isReady ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {hasError ? "Action needed" : isReady ? "Ready" : "Finding potential customers"}
            </div>
            <h1 className="mt-5 font-serif text-4xl leading-[1.04] tracking-tight sm:text-5xl" style={{ color: C.navy }}>
              {status.title}
            </h1>
            <p className="mt-4 max-w-md text-base leading-7" style={{ color: C.muted }}>
              {status.detail}
            </p>
            <div
              className="mt-7 inline-flex max-w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium shadow-sm"
              style={{ borderColor: C.rule, color: C.navySoft }}
            >
              <Globe2 className="size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
              <span className="truncate">{domain}</span>
            </div>
            {!hasError && !isReady ? (
              <div className="mt-5 rounded-xl border bg-white px-4 py-3 shadow-sm" style={{ borderColor: C.rule }}>
                <p className="text-xs font-semibold" style={{ color: C.navy }}>
                  {lastUpdate}
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                  This page updates on its own. Most first scans take a few minutes.
                </p>
              </div>
            ) : null}
            {isTakingLongerThanUsual ? (
              <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: C.amber, backgroundColor: C.amberPale }}>
                <p className="text-xs font-semibold" style={{ color: C.navy }}>
                  Taking longer than usual?
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                  You can keep this page open. If the website address needs changing, update it in settings.
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
            className="relative overflow-hidden rounded-2xl border bg-white p-5 shadow-lg sm:p-7"
            style={{ borderColor: C.rule }}
            aria-label="Discovery progress"
          >
            <div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full" style={{ backgroundColor: C.blueTint }} />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
                    What we are doing
                  </p>
                  <p className="mt-1 text-sm" style={{ color: C.muted }}>
                    We will take you to your results as soon as they are ready.
                  </p>
                </div>
                <Sparkles className="size-5 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
              </div>

              <ol className="mt-7 space-y-3">
                {STAGES.map((stage, index) => {
                  const Icon = stage.icon;
                  const isComplete = isReady || index < activeIndex;
                  const isActive = !hasError && !isReady && index === activeIndex;
                  return (
                    <li
                      key={stage.label}
                      className="flex gap-3 rounded-xl border p-3.5"
                      style={{
                        borderColor: isActive ? C.blueLight : C.rule,
                        backgroundColor: isActive ? C.blueTint : C.white,
                      }}
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: isComplete ? C.blue : isActive ? C.bluePale : C.offWhite,
                          color: isComplete ? C.white : isActive ? C.blue : C.muted,
                        }}
                      >
                        {isComplete ? <Check className="size-4" aria-hidden="true" /> : <Icon className={isActive ? "size-4 animate-pulse" : "size-4"} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold" style={{ color: isComplete || isActive ? C.navy : C.navySoft }}>
                            {stage.label}
                          </span>
                          {isActive ? <span className="text-[11px] font-semibold" style={{ color: C.blue }}>Working on it</span> : null}
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
      </div>
    </main>
  );
}
