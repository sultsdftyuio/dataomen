import { AlertCircle, Check, Loader2, Search } from "lucide-react";

import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

type SourceProgress = BuyerDemandReportView["sourceProgress"][number];
type SourceProgressState = SourceProgress["state"];

export type LiveDiscoveryFunnelProps = {
  /**
   * Aggregate, tenant-scoped discovery telemetry. It may not exist while the
   * website profile is still being prepared, so the component treats it as
   * optional rather than assuming a scan has already started.
   */
  report: BuyerDemandReportView | null;
  /** True while background work can still add source or verifier results. */
  isWarmingUp: boolean;
  /** Client-side elapsed time, used only to make a slow scan explain itself. */
  elapsedSeconds?: number;
};

type FunnelMetrics = {
  sourceCount: number;
  reportingSourceCount: number;
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
  x: "Public conversation",
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
  const sourcePostCount = sumKnownCounts(
    sourceProgress.map((source) => source?.itemCount),
  );
  const sourceCandidateCount = sumKnownCounts(
    sourceProgress.map((source) => source?.plausibleCount),
  );
  const sourceCount = sourceProgress.length || summarySourceCount(report);
  const reportingSourceCount = sourceProgress.filter((source) => {
    const state = sourceState(source?.state);
    return (
      state !== "checking" ||
      safeCount(source?.itemCount) !== null ||
      safeCount(source?.plausibleCount) !== null
    );
  }).length;

  return {
    sourceCount,
    reportingSourceCount,
    // The persisted summary is a run-wide total. Source rows can arrive more
    // recently, so retain the greater safe value during the live handoff.
    postCount: highestKnownCount(safeCount(report?.summary?.totalHits), sourcePostCount),
    candidateCount: highestKnownCount(
      safeCount(report?.summary?.plausibleHits),
      sourceCandidateCount,
    ),
  };
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sourceStatusCopy(source: SourceProgress) {
  const state = sourceState(source?.state);
  const postCount = safeCount(source?.itemCount);

  if (state === "checking") {
    return postCount && postCount > 0
      ? `${countLabel(postCount, "post")} found so far`
      : "Checking this source";
  }
  if (state === "found") return `${countLabel(postCount ?? 0, "post")} collected`;
  if (state === "partial") {
    return `${countLabel(postCount ?? 0, "post")} found with partial coverage`;
  }
  if (state === "no_results") return "No relevant posts this scan";
  return "This source is unavailable";
}

function sourceTone(state: SourceProgressState) {
  if (state === "found") {
    return { border: C.greenPale, background: C.greenPale, color: C.green };
  }
  if (state === "partial") {
    return { border: C.amberPale, background: C.amberPale, color: C.amber };
  }
  if (state === "unavailable") {
    return { border: C.redPale, background: C.redPale, color: C.red };
  }
  if (state === "checking") {
    return { border: C.blueLight, background: C.blueTint, color: C.blue };
  }
  return { border: C.rule, background: C.offWhite, color: C.muted };
}

function SourceStateIcon({ state }: { state: SourceProgressState }) {
  if (state === "checking") {
    return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
  }
  if (state === "found") {
    return <Check className="size-3.5" aria-hidden="true" />;
  }
  if (state === "partial" || state === "unavailable") {
    return <AlertCircle className="size-3.5" aria-hidden="true" />;
  }
  return <Search className="size-3.5" aria-hidden="true" />;
}

function funnelDescription({
  report,
  metrics,
  sourceProgress,
}: {
  report: BuyerDemandReportView | null;
  metrics: FunnelMetrics;
  sourceProgress: SourceProgress[];
}) {
  const allSourcesReported =
    metrics.sourceCount > 0 && metrics.reportingSourceCount >= metrics.sourceCount;
  const hasCollectedPosts = (metrics.postCount ?? 0) > 0;
  const hasCandidates = (metrics.candidateCount ?? 0) > 0;

  if (!report) {
    return "Preparing the source checks. Collected posts and candidate conversations will appear here as soon as the scan starts reporting.";
  }
  if (hasCandidates) {
    return `${countLabel(metrics.candidateCount ?? 0, "candidate conversation")} found so far. We are checking the evidence before anything is called a lead.`;
  }
  if (hasCollectedPosts) {
    return `${countLabel(metrics.postCount ?? 0, "public post")} collected so far. We are narrowing them to conversations that show a real buyer problem.`;
  }
  if (report.isTerminal && metrics.sourceCount > 0) {
    return "The available source coverage did not surface a candidate conversation for this brief. That does not mean there are no buyers; review coverage and refine the brief before the next scan.";
  }
  if (allSourcesReported) {
    const unavailableCount = sourceProgress.filter(
      (source) => sourceState(source?.state) === "unavailable",
    ).length;
    return unavailableCount > 0
      ? "The reporting sources have not surfaced a candidate yet, and some coverage was unavailable. We will keep any available evidence visible in the dashboard."
      : "The reporting sources have not surfaced a candidate conversation yet. We are finishing the remaining matching checks.";
  }
  return "We are checking public conversations against your matching brief. Each source will appear here as it starts reporting.";
}

/**
 * A compact, live view of a discovery run. Counts describe collected posts
 * and plausible candidate conversations, never verified leads.
 */
export function LiveDiscoveryFunnel({
  report,
  isWarmingUp,
  elapsedSeconds = 0,
}: LiveDiscoveryFunnelProps) {
  const sourceProgress = usableSourceProgress(report);
  const metrics = metricsFor(report, sourceProgress);
  const isRunning = isWarmingUp || Boolean(report && !report.isTerminal);
  const isSlow = isRunning && elapsedSeconds >= 90;
  const description = funnelDescription({ report, metrics, sourceProgress });
  const shownSources = sourceProgress.slice(0, 6);
  const hiddenSourceCount = Math.max(0, sourceProgress.length - shownSources.length);

  return (
    <section
      className="mt-6 rounded-xl border text-left"
      style={{ borderColor: C.blueLight, backgroundColor: "rgba(255, 255, 255, 0.72)" }}
      aria-label="Live discovery funnel"
      aria-live="polite"
    >
      <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: C.navy }}>
              What the scan is finding
            </p>
            <p className="mt-1 max-w-2xl text-[11px] leading-5" style={{ color: C.navySoft }}>
              {description}
            </p>
          </div>
          {isRunning ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold"
              style={{ borderColor: C.blueLight, backgroundColor: C.blueTint, color: C.blue }}
            >
              <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: C.blue }} />
              Live scan
            </span>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-3">
          <FunnelMetric
            label="Sources reporting"
            value={
              metrics.sourceCount > 0
                ? `${metrics.reportingSourceCount}/${metrics.sourceCount}`
                : "—"
            }
            detail={
              metrics.sourceCount > 0
                ? "Source coverage received"
                : "Preparing source checks"
            }
          />
          <FunnelMetric
            label="Public posts found"
            value={metrics.postCount === null ? "—" : String(metrics.postCount)}
            detail={
              metrics.postCount === null
                ? "Waiting for results"
                : "Collected before matching"
            }
          />
          <FunnelMetric
            label="Candidate conversations"
            value={metrics.candidateCount === null ? "—" : String(metrics.candidateCount)}
            detail={
              metrics.candidateCount === null
                ? "Checking buyer signals"
                : "Not verified leads"
            }
          />
        </dl>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {shownSources.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Source scan progress">
            {shownSources.map((source) => {
              const state = sourceState(source?.state);
              const tone = sourceTone(state);
              const candidateCount = safeCount(source?.plausibleCount);
              const newPostCount = safeCount(source?.newPostCount);

              return (
                <li
                  key={sourceKey(source?.source)}
                  className="rounded-lg border px-3 py-2.5"
                  style={{ borderColor: tone.border, backgroundColor: tone.background }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold" style={{ color: C.navy }}>
                      {sourceName(source?.source)}
                    </p>
                    <span className="shrink-0" style={{ color: tone.color }}>
                      <SourceStateIcon state={state} />
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium" style={{ color: tone.color }}>
                    {sourceStatusCopy(source)}
                  </p>
                  {candidateCount !== null ? (
                    <p className="mt-1 text-[10px] leading-4" style={{ color: C.navySoft }}>
                      {countLabel(candidateCount, "candidate conversation")}
                      {newPostCount && newPostCount > 0
                        ? ` · ${countLabel(newPostCount, "new post")}`
                        : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            className="rounded-lg border border-dashed px-3 py-3 text-xs leading-5"
            style={{ borderColor: C.ruleDark, color: C.navySoft }}
          >
            Source-by-source progress will appear here once the public scan begins.
          </div>
        )}

        {hiddenSourceCount > 0 ? (
          <p className="mt-2 text-[10px]" style={{ color: C.muted }}>
            +{hiddenSourceCount} more {hiddenSourceCount === 1 ? "source" : "sources"} reporting
          </p>
        ) : null}

        {isSlow ? (
          <div
            className="mt-4 rounded-lg border px-3 py-2.5 text-xs leading-5"
            style={{ borderColor: C.amber, backgroundColor: C.amberPale, color: C.navySoft }}
            role="status"
          >
            <p className="font-semibold" style={{ color: C.navy }}>
              Still scanning, but you do not need to wait here.
            </p>
            <p className="mt-0.5">
              Public sources respond at different speeds. We will keep collecting and checking
              evidence in the background, including when no candidate has appeared yet.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FunnelMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold leading-none" style={{ color: C.navy }}>
        {value}
      </dd>
      <p className="mt-1 text-[10px] leading-4" style={{ color: C.navySoft }}>
        {detail}
      </p>
    </div>
  );
}
