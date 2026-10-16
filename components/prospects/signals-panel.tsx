import { ContextButton, ContextCard, ContextStat } from "@/components/dashboard/ContextLayout";
import { metricValue, sourceDisplayName } from "@/components/prospects/lead-desk-presentation";
import type { QueueCounts } from "@/components/prospects/queue-toolbar";
import type { LeadQueueFilter } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";

type SourceProgress = BuyerDemandReportView["sourceProgress"][number];

const QUEUE_VIEWS: Array<{ value: LeadQueueFilter; label: string }> = [
  { value: "all", label: "Inbox" },
  { value: "leads", label: "Signals" },
  { value: "potential", label: "Maybes" },
  { value: "done", label: "Done" },
];

/** Short per-source outcome for the panel; the scan activity dialog has the full report. */
function sourceOutcome(source: SourceProgress): { text: string; attention: boolean } {
  switch (source.state) {
    case "found":
      return { text: source.plausibleCount ? `${metricValue(source.plausibleCount)} found` : "Found", attention: false };
    case "partial":
      return { text: "Partly checked", attention: true };
    case "unavailable":
      return { text: "Didn't finish", attention: true };
    case "no_results":
      return { text: "Nothing found", attention: false };
    case "checking":
      return { text: "Checking", attention: false };
  }
}

type SignalsPanelProps = {
  view: LeadQueueFilter;
  counts: QueueCounts;
  report: BuyerDemandReportView | null;
  onShowView: (view: LeadQueueFilter) => void;
};

/**
 * The Signals context panel: how the latest scan went, source by source, and
 * the queue's views with their counts. On desktop it replaces the toolbar's
 * view tabs; phones keep the tabs and leave this panel out.
 */
export function SignalsPanel({ view, counts, report, onShowView }: SignalsPanelProps) {
  const sources = report?.sourceProgress ?? [];
  const finished = sources.filter((source) => source.state === "found" || source.state === "no_results").length;

  return (
    <>
      <ContextCard>
        <span className="text-[15px] font-semibold text-[var(--rail-foreground)]">Latest scan</span>
        {sources.length > 0 ? (
          <>
            <dl className="arc-context-stats -mx-3">
              {sources.map((source) => {
                const outcome = sourceOutcome(source);
                return (
                  <ContextStat
                    key={source.source}
                    label={sourceDisplayName(source.source)}
                    value={outcome.text}
                    attention={outcome.attention}
                  />
                );
              })}
            </dl>
            <p className="arc-context-note text-xs leading-5">
              {finished} of {sources.length} {sources.length === 1 ? "source" : "sources"} finished.
            </p>
          </>
        ) : (
          <p className="text-xs leading-5">No scan recorded for this brief yet.</p>
        )}
      </ContextCard>

      <h2 className="arc-context-heading">Queue</h2>
      <div role="group" aria-label="Show signals" className="arc-context-list">
        {QUEUE_VIEWS.map((item) => (
          <ContextButton
            key={item.value}
            title={item.label}
            trailing={metricValue(counts[item.value])}
            pressed={view === item.value}
            onClick={() => onShowView(item.value)}
          />
        ))}
      </div>

      {counts.screened > 0 ? (
        <div className="arc-context-list">
          <ContextButton
            title="Screened out"
            detail="Check Arcli's calls"
            trailing={metricValue(counts.screened)}
            pressed={view === "screened"}
            onClick={() => onShowView("screened")}
          />
        </div>
      ) : null}
    </>
  );
}
