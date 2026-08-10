"use client";

import { CheckCircle2, LockKeyhole, Radar, Sparkles } from "lucide-react";

import { PlanPreviewSwitcher } from "@/components/dashboard/PlanPreviewSwitcher";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { C } from "@/lib/tokens";
import type { LeadQueueCounts } from "./data";

type FreeProspectPreviewProps = {
  websiteUrl: string;
  counts: LeadQueueCounts;
  showPlanPreview: boolean;
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
  showPlanPreview,
}: FreeProspectPreviewProps) {
  const total = counts.readyToReview + counts.discoveryCandidates;

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto pr-1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pfd text-3xl leading-none" style={{ color: C.navy }}>
            Your prospect desk is ready
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            We are scanning conversations for {domainForDisplay(websiteUrl)}.
          </p>
        </div>
        {showPlanPreview ? <PlanPreviewSwitcher activePlan="free" /> : null}
      </header>

      <section
        className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-3"
        style={{ borderColor: C.rule }}
      >
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <Radar className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            <p className="text-sm font-semibold" style={{ color: C.navy }}>
              {total > 0
                ? `${total} matched ${total === 1 ? "conversation is" : "conversations are"} waiting`
                : "Your scan is looking for matched conversations"}
            </p>
          </div>
          <p className="mt-2 text-xs leading-5" style={{ color: C.navySoft }}>
            Free shows your real discovery progress. Upgrade to reveal the people,
            source posts, evidence, and reply drafts behind these matches.
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

      <section
        className="relative overflow-hidden rounded-xl border px-5 py-5"
        style={{ borderColor: C.blueLight, background: "linear-gradient(135deg, #F7FBFF 0%, #FFFFFF 72%)" }}
      >
        <div className="absolute -right-12 -top-16 size-48 rounded-full" style={{ backgroundColor: "rgba(59,154,232,0.13)" }} aria-hidden="true" />
        <div className="absolute -bottom-20 right-20 size-40 rounded-full border" style={{ borderColor: "rgba(27,110,191,0.13)" }} aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue, backgroundColor: C.bluePale }}>
              <Sparkles className="size-3" aria-hidden="true" /> Pro prospect desk
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
              $35/month · cancel any time
            </p>
            <UpgradeButton />
          </div>
        </div>
      </section>

      <section className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <div>
            <h2 className="pfd text-xl leading-none" style={{ color: C.navy }}>Matched conversations</h2>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>Lead details unlock with Pro.</p>
          </div>
          <LockKeyhole className="size-4" style={{ color: C.blue }} aria-hidden="true" />
        </div>
        <div className="pointer-events-none space-y-3 p-4 select-none" aria-hidden="true">
          {["Buyer need detected", "High-fit conversation", "Suggested reply ready"].map((label) => (
            <div key={label} className="rounded-lg border p-4 blur-[5px]" style={{ borderColor: C.rule }}>
              <p className="text-sm font-semibold" style={{ color: C.navy }}>{label}</p>
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
            <h3 className="pfd mt-3 text-2xl leading-none" style={{ color: C.navy }}>Unlock your leads</h3>
            <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
              Pro reveals every matched conversation and gives you the evidence and reply draft to act on it.
            </p>
            <p className="mt-4 text-xs font-semibold" style={{ color: C.blue }}>
              Unlock with Pro above to review the full conversation.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
