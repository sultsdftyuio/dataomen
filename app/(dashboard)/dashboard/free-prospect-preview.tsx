"use client";

import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
  Radar,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import UpgradeButton from "@/components/ui/UpgradeButton";
import { C } from "@/lib/tokens";
import type { LeadQueueCounts } from "./data";

type FreeProspectPreviewProps = {
  websiteUrl: string;
  counts: LeadQueueCounts;
  scanStatus: string | null;
  discoveryStatus: string | null;
  verificationPending: boolean;
};

function domainForDisplay(websiteUrl: string) {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "");
  } catch {
    return websiteUrl;
  }
}

export default function FreeProspectPreview({
  websiteUrl,
  counts,
  scanStatus,
  discoveryStatus,
  verificationPending,
}: FreeProspectPreviewProps) {
  const total = counts.readyToReview + counts.discoveryCandidates;
  const hasMatches = total > 0;
  const normalizedDiscoveryStatus = discoveryStatus?.trim().toLowerCase() ?? null;
  const normalizedCrawlStatus = scanStatus?.trim().toLowerCase() ?? null;
  const effectiveStatus = normalizedDiscoveryStatus ?? normalizedCrawlStatus;
  const scanCompleted = effectiveStatus === "completed" && !verificationPending;
  const scanPartial = effectiveStatus === "partial" && !verificationPending;
  const scanFailed = effectiveStatus === "failed" || effectiveStatus === "dead_lettered";
  const isVerifying = verificationPending || effectiveStatus === "running";
  const scanLabel = isVerifying
    ? "Checking potential matches"
    : scanPartial
      ? "Latest scan partially complete"
      : scanCompleted
        ? "Latest scan complete"
        : scanFailed
          ? "Latest scan needs attention"
          : "Scanning conversations";
  const lockedCardCount = Math.min(Math.max(total, 1), 3);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto pr-1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pfd text-3xl leading-none" style={{ color: C.navy }}>
            Your prospect desk is ready
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            {isVerifying
              ? `Sources are collected for ${domainForDisplay(websiteUrl)}. Checking buyer fit now.`
              : scanPartial
                ? `Latest scan had partial source coverage for ${domainForDisplay(websiteUrl)}.`
                : scanCompleted
              ? `Latest scan complete for ${domainForDisplay(websiteUrl)}.`
              : `We are scanning conversations for ${domainForDisplay(websiteUrl)}.`}
          </p>
        </div>
      </header>

      <section
        className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-3"
        style={{ borderColor: C.rule }}
      >
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <Radar className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            <p className="text-sm font-semibold" style={{ color: C.navy }}>
              {hasMatches
                ? `${total} matched ${total === 1 ? "conversation is" : "conversations are"} waiting`
                : isVerifying
                  ? "Checking the strongest conversations"
                  : scanCompleted || scanPartial
                  ? "No conversations matched this time"
                  : scanFailed
                    ? "Your last scan needs attention"
                    : "Your scan is looking for matched conversations"}
            </p>
          </div>
          <p className="mt-2 text-xs leading-5" style={{ color: C.navySoft }}>
            {hasMatches
              ? "Free shows the real count. Pro reveals the people, source posts, evidence, and reply drafts behind these matches."
              : isVerifying
                ? "Source collection is complete. Arcli is still checking the strongest conversations against your buyer and problem criteria."
              : scanCompleted || scanPartial
                ? "Nothing was strong enough for your current buyer and problem criteria. You can refine the brief before the next check."
                : scanFailed
                  ? "Check your website setup, then try again when the next scan is available."
                  : "Free shows the real discovery progress while Arcli looks for strong matches."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:block sm:border-l sm:pl-4" style={{ borderColor: C.rule }}>
          <div>
            <p className="text-2xl font-semibold" style={{ color: C.navy }}>{counts.readyToReview}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Ready</p>
          </div>
          <div className="sm:mt-3">
            <p className="text-2xl font-semibold" style={{ color: C.navy }}>{counts.discoveryCandidates}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>In review</p>
          </div>
        </div>
      </section>

      {scanFailed ? (
        <p className="text-xs leading-5" style={{ color: C.navySoft }}>
          Need to fix the scan?{" "}
          <Link href="/settings" className="font-semibold underline underline-offset-2" style={{ color: C.blue }}>
            Check your website settings
          </Link>
          .
        </p>
      ) : null}

      {hasMatches ? (
        <>
          <section
            className="relative shrink-0 overflow-hidden rounded-xl border px-5 py-5"
            style={{ borderColor: C.blueLight, background: "linear-gradient(135deg, #F7FBFF 0%, #FFFFFF 72%)" }}
          >
            <div className="absolute -right-12 -top-16 size-48 rounded-full" style={{ backgroundColor: "rgba(59,154,232,0.13)" }} aria-hidden="true" />
            <div className="absolute -bottom-20 right-20 size-40 rounded-full border" style={{ borderColor: "rgba(27,110,191,0.13)" }} aria-hidden="true" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue, backgroundColor: C.bluePale }}>
                  <Sparkles className="size-3" aria-hidden="true" /> {total} locked {total === 1 ? "match" : "matches"}
                </div>
                <h2 className="pfd mt-3 text-2xl leading-none sm:text-3xl" style={{ color: C.navy }}>
                  See the people behind the signal.
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Open every matched conversation with its fit evidence, qualification signal, and a reply draft ready to refine.
                </p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold" style={{ color: C.navy }}>
                  {["Verified matches", "Why they fit", "Reply drafts"].map((feature) => (
                    <span key={feature} className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5" style={{ color: C.green }} aria-hidden="true" />
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <p className="text-xs font-semibold" style={{ color: C.navySoft }}>
                  $35/month &middot; cancel any time
                </p>
                <UpgradeButton />
              </div>
            </div>
          </section>

          <section className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <div>
                <h2 className="pfd text-xl leading-none" style={{ color: C.navy }}>Matched conversations</h2>
                <p className="mt-1 text-xs" style={{ color: C.muted }}>{total} {total === 1 ? "match is" : "matches are"} ready to unlock with Pro.</p>
              </div>
              <LockKeyhole className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            </div>
            <div className="pointer-events-none space-y-3 p-4 select-none" aria-hidden="true">
              {Array.from({ length: lockedCardCount }, (_, index) => (
                <div key={index} className="rounded-lg border p-4 blur-[5px]" style={{ borderColor: C.rule }}>
                  <p className="text-sm font-semibold" style={{ color: C.navy }}>Matched conversation</p>
                  <div className="mt-3 h-3 w-4/5 rounded" style={{ backgroundColor: C.rule }} />
                  <div className="mt-2 h-3 w-3/5 rounded" style={{ backgroundColor: C.rule }} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/65 px-5 text-center backdrop-blur-[1px]">
              <div className="max-w-sm">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                  <LockKeyhole className="size-4" />
                </div>
                <h3 className="pfd mt-3 text-2xl leading-none" style={{ color: C.navy }}>Your matches are ready</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Pro reveals every matched conversation and gives you the evidence and reply draft to act on it.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border bg-white p-5" style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10,22,40,0.04)" }}>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.bluePale, color: C.blue }}>
              <FileSearch className="size-5" aria-hidden="true" />
            </div>
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                {isVerifying ? "Verification in progress" : scanLabel}
              </p>
              <h2 className="pfd mt-1 text-2xl leading-none" style={{ color: C.navy }}>
                {isVerifying
                  ? "We’re checking the strongest conversations now."
                  : scanCompleted || scanPartial
                    ? "No matches cleared your brief this time."
                    : "Set your next scan up for better matches."}
              </h2>
              <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
                {isVerifying
                  ? "This can take a few more minutes after sources finish. The desk will update automatically if a conversation clears your matching brief."
                  : scanCompleted || scanPartial
                  ? "That does not mean the problem is not being discussed. It means no conversation was strong enough for the buyer and problem criteria you chose. Refine the brief with the words your buyers actually use, then let the next check look again."
                  : "Make sure your matching brief names the buyer, the problem, and the phrases they use when looking for help. That gives the next scan a clearer signal to work with."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/brief"
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: C.blue, textDecoration: "none" }}
                >
                  Improve matching brief <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold"
                  style={{ borderColor: C.ruleDark, color: C.navy, textDecoration: "none" }}
                >
                  Review website
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
