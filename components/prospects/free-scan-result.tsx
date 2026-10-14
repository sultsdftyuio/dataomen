"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LockKeyhole, Radar } from "lucide-react";

import type { FreeScanPreview } from "@/app/(dashboard)/dashboard/free-scan-preview";
import { leadCategoryLabel } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { SourcePlatformBadge, relativeTime } from "@/components/prospects/lead-desk-presentation";
import { LeadStatusBadge } from "@/components/prospects/lead-status";
import { Button } from "@/components/ui/button";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";

/**
 * The Free user's first real result: one prospect shown in full, everything
 * else counted and locked. Showing actual evidence before asking for payment
 * is the point; the reply draft stays Pro.
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
      <section role="status" className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 md:p-5">
        <Radar className="mt-1 size-5 shrink-0 text-primary motion-safe:animate-pulse" aria-hidden="true" />
        <div>
          <h2 className="text-lg leading-7 font-semibold text-foreground">Running your free first scan</h2>
          <p className="mt-1 text-sm leading-6 text-navy-soft">
            Checking public conversations for people with this problem. Results appear here as they come in.
          </p>
        </div>
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 md:p-5">
        <h2 className="text-lg leading-7 font-semibold text-foreground">No clear match in your first scan</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-navy-soft">
          That isn&apos;t a verdict on demand: one scan covers a small window. A sharper brief helps, and
          Pro keeps scanning every day.
        </p>
        <div className="mt-4 flex flex-col items-start gap-2">
          <UpgradeButton />
          <p className="text-xs text-subtle">{PRO_PRICE_NOTE}</p>
        </div>
      </section>
    );
  }

  const quote = lead.evidenceExcerpt ?? lead.sourcePost.text;

  return (
    <section aria-labelledby="free-scan-heading" className="rounded-lg border border-border bg-card">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <h2 id="free-scan-heading" className="text-lg leading-7 font-semibold text-foreground">
          Your first scan found {totalFound} {totalFound === 1 ? "conversation" : "conversations"}
        </h2>
        <p className="mt-1 text-sm text-navy-soft">Here&apos;s the strongest one.</p>
      </div>

      <article className="space-y-3 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
          <SourcePlatformBadge source={lead.sourcePost.source} />
          {lead.sourcePost.community ? <span>{lead.sourcePost.community}</span> : null}
          <span className="tabular-nums">{relativeTime(lead.sourcePost.publishedAt ?? lead.matchedAt)}</span>
          <LeadStatusBadge lead={lead} size="compact" />
        </div>
        <h3 className="text-base leading-6 font-semibold text-foreground">{lead.sourcePost.title}</h3>
        {quote ? (
          <blockquote className="line-clamp-4 border-l-2 border-primary pl-3 text-sm leading-6 text-navy-soft">
            “{quote}”
          </blockquote>
        ) : null}
        <p className="text-sm leading-6 text-navy-soft">
          <span className="font-semibold text-foreground">Why it matched: </span>
          {lead.matchReason}
        </p>
        {lead.sourcePost.url ? (
          <Button asChild variant="outline" size="sm">
            <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" /> Open the conversation
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        ) : null}
      </article>

      {/* Stacks below sm so the copy keeps a real width instead of one word per line. */}
      <div className="flex flex-col items-start gap-3 rounded-b-lg border-t border-border bg-blue-tint px-4 py-4 sm:flex-row sm:items-center md:px-5">
        <LockKeyhole className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true" />
        <div className="min-w-0 sm:flex-1">
          <p className="text-sm font-semibold text-foreground">
            {lockedCount > 0
              ? `Unlock ${lockedCount} more, plus reply drafts and daily scans`
              : "Get reply drafts and new prospects every day"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-subtle">{PRO_PRICE_NOTE}</p>
        </div>
        <UpgradeButton />
      </div>
    </section>
  );
}
