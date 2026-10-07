"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LockKeyhole, Radar } from "lucide-react";

import type { FreeScanPreview } from "@/app/(dashboard)/dashboard/free-scan-preview";
import { leadCategoryLabel } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { SourcePlatformBadge, relativeTime } from "@/components/prospects/lead-desk-presentation";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";
import { C } from "@/lib/tokens";

const PRICE_NOTE = PRO_PRICE_NOTE;

/**
 * The Free user's first real result: one lead shown in full, everything else
 * counted and locked. Showing actual evidence before asking for payment is
 * the point; the reply draft stays Pro.
 */
export function FreeScanResult({ preview }: { preview: FreeScanPreview }) {
  const router = useRouter();
  const isScanning = preview.runStatus === "running";
  const lead = preview.topLead;
  const totalFound = preview.leadCount + preview.maybeCount;
  const lockedCount = Math.max(0, totalFound - (lead ? 1 : 0));

  // Results stream in while the run is active; poll gently until it ends.
  useEffect(() => {
    if (!isScanning) return;
    const id = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [isScanning, router]);

  useEffect(() => {
    if (!lead || isScanning) return;
    trackProductEvent("free_scan_viewed", {
      bucket: leadCategoryLabel(lead),
      source: lead.sourcePost.source,
      total_found: totalFound,
    });
  }, [isScanning, lead, totalFound]);

  if (isScanning && !lead) {
    return (
      <section className="rounded-xl border bg-white p-5 text-center shadow-sm" style={{ borderColor: C.rule }}>
        <Radar className="mx-auto size-6 animate-pulse" style={{ color: C.blue }} aria-hidden="true" />
        <h2 className="pfd mt-3 text-xl" style={{ color: C.navy }}>Running your free first scan</h2>
        <p className="mt-1 text-sm" style={{ color: C.navySoft }}>
          Checking public conversations for people with this problem. Results appear here.
        </p>
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: C.rule }}>
        <h2 className="pfd text-xl" style={{ color: C.navy }}>No clear match in your first scan</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
          That isn&apos;t a verdict on demand: one scan covers a small window. A sharper brief helps, and
          Pro keeps scanning every day.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <UpgradeButton />
          <span className="text-xs font-semibold" style={{ color: C.muted }}>{PRICE_NOTE}</span>
        </div>
      </section>
    );
  }

  const quote = lead.evidenceExcerpt ?? lead.sourcePost.text;

  return (
    <section aria-labelledby="free-scan-heading" className="rounded-xl border bg-white shadow-sm" style={{ borderColor: C.rule }}>
      <div className="border-b px-5 py-4" style={{ borderColor: C.rule }}>
        <h2 id="free-scan-heading" className="pfd text-xl" style={{ color: C.navy }}>
          Your first scan found {totalFound} {totalFound === 1 ? "conversation" : "conversations"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.navySoft }}>Here&apos;s the strongest one.</p>
      </div>

      <article className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
          <SourcePlatformBadge source={lead.sourcePost.source} />
          {lead.sourcePost.community ? <span>{lead.sourcePost.community}</span> : null}
          <span>· {relativeTime(lead.sourcePost.publishedAt ?? lead.matchedAt)}</span>
          <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: C.greenPale, color: C.green }}>
            {leadCategoryLabel(lead)}
          </span>
        </div>
        <h3 className="text-base font-semibold leading-6" style={{ color: C.navy }}>{lead.sourcePost.title}</h3>
        {quote ? (
          <blockquote className="line-clamp-4 rounded-lg border-l-[3px] px-3 py-2.5 text-sm leading-6" style={{ borderColor: C.blue, backgroundColor: C.offWhite, color: C.navySoft }}>
            “{quote}”
          </blockquote>
        ) : null}
        <p className="text-sm leading-6" style={{ color: C.navySoft }}>
          <span className="font-semibold" style={{ color: C.navy }}>Why it matched: </span>
          {lead.matchReason}
        </p>
        {lead.sourcePost.url ? (
          <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.blue }}>
            <ExternalLink className="size-4" aria-hidden="true" /> Open the conversation
          </a>
        ) : null}
      </article>

      <div className="flex flex-wrap items-center gap-3 border-t px-5 py-4" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
        <LockKeyhole className="size-5 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: C.navy }}>
            {lockedCount > 0
              ? `Unlock ${lockedCount} more, plus reply drafts and daily scans`
              : "Get reply drafts and new leads every day"}
          </p>
          <p className="text-xs" style={{ color: C.muted }}>{PRICE_NOTE}</p>
        </div>
        <UpgradeButton />
      </div>
    </section>
  );
}
