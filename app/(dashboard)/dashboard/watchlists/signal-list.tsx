"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { LoadError } from "@/components/dashboard/LoadError";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WatchlistResultsView } from "../prospect-types";
import { sourceLabel } from "./group-fields";
import { formatAge, type ScanState } from "./scan-status";

const VISIBLE_SIGNALS = 5;

function emptyCopy(scan: ScanState, isActive: boolean, lastScan: string | null) {
  if (scan.isScanning) {
    return {
      title: "Scanning sources",
      description: "New conversations appear here as sources respond. This page checks every 30 seconds.",
    };
  }
  if (scan.tone === "danger") {
    return { title: "No conversations yet", description: "Matches appear here once a scan finishes." };
  }
  if (!isActive) {
    return { title: "No conversations yet", description: "This buyer group is paused. Resume it to look for new conversations." };
  }
  if (!lastScan) {
    return { title: "No conversations yet", description: "Start a scan to look for this audience describing the problem." };
  }
  return {
    title: "No matching conversations yet",
    description: `The scan on ${lastScan} found nothing that fits well enough. New posts are checked each time you scan.`,
  };
}

/**
 * The selected group's best conversations, shown inline. Data arrives ranked
 * by match strength with verified matches first, so the caption says that
 * rather than claiming they are the latest.
 */
export function SignalList({
  result,
  unavailable,
  scan,
  isActive,
  lastScan,
  now,
}: {
  result: WatchlistResultsView | undefined;
  unavailable: boolean;
  scan: ScanState;
  isActive: boolean;
  lastScan: string | null;
  now: number;
}) {
  const router = useRouter();

  if (unavailable) {
    return (
      <LoadError
        thing="Matches"
        description="The group itself is fine. Try again, and if it keeps happening, reload the page."
        onRetry={() => router.refresh()}
        headingLevel={3}
      />
    );
  }

  const signals = [...(result?.readyToAct ?? []), ...(result?.discoveryCandidates ?? [])];
  if (signals.length === 0) {
    const copy = emptyCopy(scan, isActive, lastScan);
    return <EmptyState title={copy.title} description={copy.description} headingLevel={3} className="px-0 py-2" />;
  }

  const visible = signals.slice(0, VISIBLE_SIGNALS);

  return (
    <div>
      <p className="text-xs leading-5 text-subtle">
        Best matches first.
        {signals.length > visible.length ? ` Showing ${visible.length} of ${signals.length}.` : null}
      </p>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {visible.map((lead) => {
          const isReady = lead.matchStatus === "ready_for_review";
          const age = formatAge(lead.sourcePost.publishedAt, now);
          const summary = lead.painDetected || lead.matchReason;
          return (
            <li key={lead.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-subtle">
                <StatusBadge tone={isReady ? "success" : "neutral"} size="compact">
                  {isReady ? "Ready to review" : "Review only"}
                </StatusBadge>
                <span>{sourceLabel(lead.sourcePost.source)}</span>
                {age ? (
                  <time dateTime={lead.sourcePost.publishedAt ?? undefined} title={lead.sourcePost.publishedAt ?? undefined}>
                    {age}
                  </time>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm leading-6 font-medium text-foreground">
                {lead.sourcePost.url ? (
                  <a
                    href={lead.sourcePost.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {lead.sourcePost.title || "Untitled conversation"}
                    <ExternalLink className="ml-1 inline size-3.5 align-[-2px] text-subtle" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  lead.sourcePost.title || "Untitled conversation"
                )}
              </p>
              {summary ? <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{summary}</p> : null}
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard"
        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
      >
        Review all matches in Signals
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
