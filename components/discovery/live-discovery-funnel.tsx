import { Search } from "lucide-react";

import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type SourceProgress = BuyerDemandReportView["sourceProgress"][number];
type SourceProgressState = SourceProgress["state"];

export type LiveDiscoveryFunnelProps = {
  /**
   * Aggregate, tenant-scoped discovery telemetry. It may not exist while the
   * website profile is still being prepared, so the component treats it as
   * optional rather than assuming a scan has already started.
   */
  report: BuyerDemandReportView | null;
  className?: string;
};

type FunnelMetrics = {
  sourceCount: number;
  /** Sources that answered: found, partial or no results. */
  finishedSourceCount: number;
  unavailableSourceCount: number;
  postCount: number | null;
  candidateCount: number | null;
};

const KNOWN_SOURCE_STATES = new Set<SourceProgressState>([
  "checking",
  "found",
  "partial",
  "no_results",
  "unavailable",
]);

const SOURCE_NAMES: Record<string, string> = {
  hn: "Hacker News",
  hackernews: "Hacker News",
  hacker_news: "Hacker News",
  github: "GitHub",
  stackexchange: "Stack Exchange",
  stack_exchange: "Stack Exchange",
  stackoverflow: "Stack Overflow",
  stack_overflow: "Stack Overflow",
  bluesky: "Bluesky",
  lemmy: "Lemmy",
  reddit: "Reddit",
  x: "X (Twitter)",
};

const SOURCE_STATUS: Record<SourceProgressState, { tone: StatusTone; label: string }> = {
  checking: { tone: "info", label: "Searching" },
  found: { tone: "success", label: "Finished" },
  partial: { tone: "warning", label: "Partly searched" },
  no_results: { tone: "neutral", label: "No matches" },
  unavailable: { tone: "danger", label: "Didn't respond" },
};

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function sourceKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_")
    : "";
}

function sourceName(value: unknown) {
  const key = sourceKey(value);
  if (!key) return "Public source";
  if (SOURCE_NAMES[key]) return SOURCE_NAMES[key];

  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceState(value: unknown): SourceProgressState {
  return typeof value === "string" && KNOWN_SOURCE_STATES.has(value as SourceProgressState)
    ? (value as SourceProgressState)
    : "checking";
}

function usableSourceProgress(report: BuyerDemandReportView | null) {
  const sourceProgress = Array.isArray(report?.sourceProgress)
    ? report.sourceProgress
    : [];
  const seen = new Set<string>();

  return sourceProgress.filter((source) => {
    const key = sourceKey(source?.source);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sumKnownCounts(values: unknown[]) {
  const counts = values
    .map(safeCount)
    .filter((value): value is number => value !== null);

  return counts.length > 0
    ? counts.reduce((total, value) => total + value, 0)
    : null;
}

function highestKnownCount(...values: Array<number | null>) {
  const counts = values.filter((value): value is number => value !== null);
  return counts.length > 0 ? Math.max(...counts) : null;
}

function summarySourceCount(report: BuyerDemandReportView | null) {
  const sources = Array.isArray(report?.summary?.sources) ? report.summary.sources : [];
  const seen = new Set<string>();

  for (const source of sources) {
    const key = sourceKey(source?.source);
    if (key) seen.add(key);
  }

  return seen.size;
}

function metricsFor(
  report: BuyerDemandReportView | null,
  sourceProgress: SourceProgress[],
): FunnelMetrics {
  const states = sourceProgress.map((source) => sourceState(source?.state));

  return {
    sourceCount: sourceProgress.length || summarySourceCount(report),
    // Unavailable sources are not coverage, so they are counted separately.
    finishedSourceCount: states.filter((state) => state !== "checking" && state !== "unavailable").length,
    unavailableSourceCount: states.filter((state) => state === "unavailable").length,
    // The persisted summary is a run-wide total. Source rows can arrive more
    // recently, so retain the greater safe value during the live handoff.
    postCount: highestKnownCount(
      safeCount(report?.summary?.totalHits),
      sumKnownCounts(sourceProgress.map((source) => source?.itemCount)),
    ),
    candidateCount: highestKnownCount(
      safeCount(report?.summary?.plausibleHits),
      sumKnownCounts(sourceProgress.map((source) => source?.plausibleCount)),
    ),
  };
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** Terminal outcomes come first so a finished scan never says "so far". */
function funnelDescription(report: BuyerDemandReportView | null, metrics: FunnelMetrics) {
  const posts = metrics.postCount ?? 0;
  const candidates = metrics.candidateCount ?? 0;

  if (!report) {
    return "Counts appear here as soon as the first source reports.";
  }

  if (report.isTerminal) {
    if (metrics.sourceCount > 0 && metrics.unavailableSourceCount === metrics.sourceCount) {
      return "None of the sources responded during this scan.";
    }
    if (candidates > 0) {
      return `Found ${countLabel(candidates, "candidate conversation")} in ${countLabel(posts, "public post")}.`;
    }
    if (posts > 0) {
      return `None of the ${countLabel(posts, "public post")} looked like a buyer describing your problem. Refining your targeting brief can change what the next scan finds.`;
    }
    return "This scan didn't collect any public posts.";
  }

  if (candidates > 0) {
    return `${countLabel(candidates, "candidate conversation")} so far. Each one is checked before it reaches Prospects.`;
  }
  if (posts > 0) {
    return `${countLabel(posts, "public post")} collected so far. Arcli is narrowing them to people describing the problem you solve.`;
  }
  return "Each source appears here as it starts reporting.";
}

/**
 * What a discovery run has found. Counts describe collected posts and
 * candidate conversations, never verified prospects.
 */
export function LiveDiscoveryFunnel({ report, className }: LiveDiscoveryFunnelProps) {
  const sourceProgress = usableSourceProgress(report);
  const metrics = metricsFor(report, sourceProgress);
  const isFinished = Boolean(report?.isTerminal);
  // While a run is live, a missing count means "not reported yet" (null);
  // once it has finished, it means nothing was counted.
  const emptyValue = isFinished ? "0" : null;

  return (
    <section
      aria-labelledby="discovery-findings-title"
      className={cn("rounded-lg border border-border bg-card", className)}
    >
      <div className="px-4 pt-4 pb-3 sm:px-5">
        <h2 id="discovery-findings-title" className="text-base leading-6 font-semibold text-foreground">
          {isFinished ? "What the scan found" : "What the scan has found so far"}
        </h2>
        <p className="mt-0.5 max-w-[65ch] text-sm leading-6 text-muted-foreground">
          {funnelDescription(report, metrics)}
        </p>
      </div>

      <dl className="grid border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
        <FunnelMetric
          label="Sources searched"
          value={metrics.sourceCount > 0 ? `${metrics.finishedSourceCount} of ${metrics.sourceCount}` : emptyValue}
          note={
            metrics.unavailableSourceCount > 0
              ? `${metrics.unavailableSourceCount} didn't respond`
              : undefined
          }
        />
        <FunnelMetric
          label="Public posts collected"
          value={metrics.postCount === null ? emptyValue : metrics.postCount.toLocaleString("en-US")}
        />
        <FunnelMetric
          label="Candidate conversations"
          value={metrics.candidateCount === null ? emptyValue : metrics.candidateCount.toLocaleString("en-US")}
          note="Checked before they become prospects"
        />
      </dl>

      {sourceProgress.length > 0 ? (
        <SourceTable sources={sourceProgress} />
      ) : (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-5">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          No source has reported yet.
        </p>
      )}
    </section>
  );
}

function FunnelMetric({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border px-4 py-2.5 last:border-b-0 sm:block sm:border-b-0 sm:px-5 sm:py-3">
      <dt className="text-sm leading-5 text-muted-foreground">{label}</dt>
      <dd className="col-start-2 row-start-1 text-right sm:mt-0.5 sm:text-left">
        {value === null ? (
          <span className="text-sm leading-7 text-subtle">Not reported yet</span>
        ) : (
          <span className="text-lg leading-7 font-semibold text-foreground tabular-nums">{value}</span>
        )}
      </dd>
      {note ? <dd className="text-xs leading-5 text-subtle">{note}</dd> : null}
    </div>
  );
}

function EmptyCount() {
  return (
    <>
      <span className="text-subtle" aria-hidden="true">–</span>
      <span className="sr-only">None</span>
    </>
  );
}

function SourceTable({ sources }: { sources: SourceProgress[] }) {
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">Progress by source</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-subtle">
          <th scope="col" className="px-4 py-2 font-medium sm:px-5">Source</th>
          <th scope="col" className="hidden w-40 py-2 pr-3 font-medium sm:table-cell">Status</th>
          <th scope="col" className="w-16 py-2 pr-3 text-right font-medium">Posts</th>
          <th scope="col" className="w-24 py-2 pr-4 text-right font-medium sm:pr-5">Candidates</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {sources.map((source) => {
          const state = sourceState(source?.state);
          const status = SOURCE_STATUS[state];
          const posts = safeCount(source?.itemCount);
          const candidates = safeCount(source?.plausibleCount);
          const badge = (
            <StatusBadge
              tone={status.tone}
              size="compact"
              icon={state === "checking" ? Search : undefined}
            >
              {status.label}
            </StatusBadge>
          );

          return (
            <tr key={sourceKey(source?.source)}>
              <th scope="row" className="px-4 py-2.5 text-left align-top font-medium text-foreground sm:px-5">
                <span className="block truncate">{sourceName(source?.source)}</span>
                {/* Below sm the status sits under the name to keep the numbers readable. */}
                <span className="mt-1 block sm:hidden">{badge}</span>
              </th>
              <td className="hidden py-2.5 pr-3 align-top sm:table-cell">{badge}</td>
              <td className="py-2.5 pr-3 text-right align-top text-foreground tabular-nums">
                {posts === null || (state === "unavailable" && posts === 0) ? (
                  <EmptyCount />
                ) : (
                  posts.toLocaleString("en-US")
                )}
              </td>
              <td className="py-2.5 pr-4 text-right align-top text-foreground tabular-nums sm:pr-5">
                {candidates === null ? (
                  <EmptyCount />
                ) : (
                  candidates.toLocaleString("en-US")
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
