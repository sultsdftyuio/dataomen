"use client";

import {
  ArrowRight,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  UsersRound,
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
            className="relative isolate overflow-hidden rounded-2xl border px-5 py-6 shadow-[0_18px_45px_rgba(10,22,40,0.12)] sm:px-7 sm:py-7"
            style={{ borderColor: "#102C4D", background: "linear-gradient(135deg, #09192E 0%, #0C3158 55%, #155B94 130%)" }}
          >
            <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.24) 1px, transparent 1px)", backgroundSize: "18px 18px", maskImage: "linear-gradient(to right, black, transparent 72%)" }} aria-hidden="true" />
            <div className="absolute -right-20 -top-24 size-72 rounded-full border" style={{ borderColor: "rgba(139,209,255,0.27)", boxShadow: "0 0 0 28px rgba(92,182,245,0.08), 0 0 0 60px rgba(92,182,245,0.05)" }} aria-hidden="true" />
            <div className="absolute -bottom-32 right-[22%] size-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(61,174,255,0.22), transparent 68%)" }} aria-hidden="true" />
            <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-end">
              <div className="min-w-0 max-w-2xl">
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-200/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100">
                  <Sparkles className="size-3 shrink-0 text-amber-300" aria-hidden="true" />
                  <span className="truncate">Pro prospect desk</span>
                  <span className="h-3 w-px shrink-0 bg-sky-100/30" aria-hidden="true" />
                  <span className="shrink-0 text-sky-200">{total} locked {total === 1 ? "match" : "matches"}</span>
                </div>
                <h2 className="pfd mt-3 text-3xl leading-[0.94] text-white sm:text-4xl">
                  See the people behind the signal.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100/85">
                  Buyer groups are available on Pro, alongside full match evidence and reply drafts that turn a conversation into a clear next step.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Verified matches", detail: "real people, ready to review", icon: ShieldCheck },
                    { label: "Why they fit", detail: "evidence behind every signal", icon: UsersRound },
                    { label: "Reply drafts", detail: "a confident first response", icon: MessageSquareText },
                  ].map(({ label, detail, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-slate-950/20 px-3 py-2.5 backdrop-blur-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <Icon className="size-3.5 text-sky-300" aria-hidden="true" />
                        {label}
                      </div>
                      <p className="mt-1 pl-5.5 text-[10px] leading-4 text-sky-100/65">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative w-full overflow-hidden rounded-xl border border-white/15 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.2)] xl:w-[260px]">
                <div className="absolute right-0 top-0 h-16 w-20 bg-gradient-to-bl from-sky-100 to-transparent opacity-80" aria-hidden="true" />
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                    Unlock your desk
                  </p>
                  <div className="mt-1 flex items-end gap-1" style={{ color: C.navy }}>
                    <span className="pfd text-3xl leading-none">$35</span>
                    <span className="mb-0.5 text-xs font-semibold" style={{ color: C.muted }}>/ month</span>
                  </div>
                  <p className="mt-1.5 text-[11px]" style={{ color: C.muted }}>Cancel any time. No annual commitment.</p>
                  <div className="mt-4">
                    <UpgradeButton className="w-full justify-center px-3" showPrice={false} />
                  </div>
                </div>
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
