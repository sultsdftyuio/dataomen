"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Globe2, Loader2 } from "lucide-react";

import type {
  CrawlJobView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

type BriefLoadingPageProps = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  scanWasJustRequested?: boolean;
};

function websiteDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value;
  }
}

export function BriefLoadingPage({
  websiteUrl,
  crawlJob,
  serviceProfile,
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
  const awaitingJob = scanWasJustRequested && !crawlJob && !serviceProfile.hasProfile && waitedSeconds < 25;
  const hasError = crawlFailed || crawlStalled || (!crawlJob && !serviceProfile.hasProfile && !awaitingJob) ||
    (crawlStatus === "completed" && !serviceProfile.hasProfile);

  useEffect(() => {
    if (!awaitingJob) return;
    const intervalId = window.setInterval(() => setWaitedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [awaitingJob]);

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
        : crawlStatus === "queued" || crawlStatus === "pending"
        ? "Your website is queued"
        : "Reading your website";
  const detail = hasError
    ? crawlJob?.errorMessage ?? crawlJob?.failureReason ??
      "The website read did not finish. Check the address and try again."
    : briefReady
      ? "Opening your brief now. Public-conversation discovery starts on Pro."
      : "We are preparing the audience and problem criteria you can review in your free workspace. Public conversations are not being searched on Free.";

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12" style={{ backgroundColor: C.offWhite, color: C.text }}>
      <div className="w-full max-w-xl rounded-xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: C.rule }}>
        <span className="flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: hasError ? C.redPale : briefReady ? C.greenPale : C.bluePale, color: hasError ? C.red : briefReady ? C.green : C.blue }}>
          {hasError ? <AlertCircle className="size-5" aria-hidden="true" /> : briefReady ? <Check className="size-5" aria-hidden="true" /> : <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>Free website brief</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: C.navy }}>{title}</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>{detail}</p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.rule, color: C.navy }}>
          <Globe2 className="size-4" aria-hidden="true" /> {websiteDomain(websiteUrl)}
        </div>

        <ol className="mt-7 grid gap-3 sm:grid-cols-2" aria-label="Website brief progress">
          <li className="rounded-lg border p-4" style={{ borderColor: C.rule }}>
            <p className="text-xs font-semibold" style={{ color: C.navy }}>1. Read your public website</p>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Identify the offer, audience, and problems.</p>
          </li>
          <li className="rounded-lg border p-4" style={{ borderColor: C.rule }}>
            <p className="text-xs font-semibold" style={{ color: C.navy }}>2. Review your matching brief</p>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Correct the criteria before deciding to search.</p>
          </li>
        </ol>

        {hasError ? (
          <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/onboarding/workspace" style={{ color: C.blue }}>Check website setup</Link>
            {serviceProfile.hasProfile ? <Link href="/dashboard" style={{ color: C.blue }}>Open existing brief</Link> : null}
          </div>
        ) : briefReady ? (
          <Link href="/dashboard" className="mt-6 inline-flex text-sm font-semibold" style={{ color: C.blue }}>
            Open website brief
          </Link>
        ) : (
          <p className="mt-6 text-xs" style={{ color: C.muted }}>You can leave this page while the website read runs.</p>
        )}
      </div>
    </main>
  );
}
