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
    label: "Read your website",
    detail: "Finding the pages that explain your product and buyers.",
    icon: Globe2,
  },
  {
    label: "Build your matching brief",
    detail: "Turning your offer, audience, and pains into a discovery profile.",
    icon: FileSearch,
  },
  {
    label: "Find buyer conversations",
    detail: "Searching public conversations for relevant buying signals.",
    icon: Radar,
  },
  {
    label: "Review the results",
    detail: "Verifying evidence before it reaches your dashboard.",
    icon: Target,
  },
];

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

function statusMessage({
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
}: Omit<DiscoveryLoadingPageProps, "websiteUrl">) {
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);

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
      title: "Your first discovery is ready.",
      detail: "Taking you to the dashboard now.",
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
      title: "Building your matching brief.",
      detail: "We are preparing the buyer signals that guide every search.",
    };
  }

  if (isWarmingUp) {
    return {
      kind: "working" as const,
      title: "Finding relevant buyer conversations.",
      detail: "We are searching sources and checking each potential match against your brief.",
    };
  }

  return {
    kind: "working" as const,
    title: "Reviewing your first scan.",
    detail: "We are finishing the evidence checks before showing your results.",
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

        <div className="grid flex-1 gap-8 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:py-20">
          <section className="max-w-lg">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
              style={{ borderColor: C.blueLight, backgroundColor: C.bluePale, color: C.blue }}
            >
              {hasError ? <AlertCircle className="size-4" aria-hidden="true" /> : <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {hasError ? "Action needed" : isReady ? "Ready" : "First discovery in progress"}
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
              <p className="mt-4 text-xs leading-5" style={{ color: C.faint }}>
                This page updates automatically. Usually this takes a few minutes.
                {elapsedSeconds >= 60 ? " Your scan is still running normally." : ""}
              </p>
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
                    Your discovery flow
                  </p>
                  <p className="mt-1 text-sm" style={{ color: C.muted }}>
                    We only show the dashboard once this first scan has results to review.
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
                          {isActive ? <span className="text-[11px] font-semibold" style={{ color: C.blue }}>In progress</span> : null}
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
