"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronLeft, Pause, Play, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { WatchlistResultsView, WatchlistView } from "./prospect-types";
import type { ActionOutcome } from "./watchlists/action-outcome";
import { sourceLabel, visibleSources } from "./watchlists/group-fields";
import { OutcomeNotice } from "./watchlists/outcome-notice";
import { formatShortDate, scanState } from "./watchlists/scan-status";
import { SignalList } from "./watchlists/signal-list";

type DetailSection = "terms";

export const detailHeadingId = (watchlistId: string) => `watchlist-brief-${watchlistId}`;

/** A quiet disclosure for secondary detail, separated by a rule rather than boxed. */
function DetailCard({
  id,
  title,
  summary,
  isOpen,
  onClick,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  isOpen: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;

  return (
    <section className="border-t border-border">
      <h3>
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onClick}
        >
          <span className="min-w-0">
            <span className="block text-sm leading-5 font-semibold text-foreground">{title}</span>
            <span className="block text-xs leading-5 text-subtle">{summary}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-subtle", isOpen && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>
      {isOpen ? (
        <div id={panelId} className="px-4 pb-4 md:px-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function TermList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className="text-xs leading-5 font-medium text-subtle">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="rounded-md bg-off-white px-2 py-0.5 text-sm leading-6 text-foreground ring-1 ring-inset ring-border">
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}

function ScanProblem({ tone }: { tone: "danger" | "warning" }) {
  const isFailure = tone === "danger";
  const Icon = isFailure ? AlertCircle : AlertTriangle;
  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm leading-5",
        isFailure ? "border-danger/25 bg-danger-pale" : "border-warning/30 bg-warning-pale",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", isFailure ? "text-danger" : "text-warning")} aria-hidden="true" />
      <div>
        <p className="font-medium text-foreground">
          {isFailure ? "The last scan didn't finish" : "Some sources didn't respond"}
        </p>
        <p className="text-muted-foreground">
          {isFailure
            ? "Use Scan again. If it fails again, check back in an hour."
            : "Matches from the sources that did respond are below."}
        </p>
      </div>
    </div>
  );
}

export function WatchlistDetail({
  watchlist,
  result,
  resultsUnavailable,
  now,
  busy,
  outcome,
  onRun,
  onSetActive,
  onBack,
}: {
  watchlist: WatchlistView;
  result: WatchlistResultsView | undefined;
  resultsUnavailable: boolean;
  now: number;
  busy: boolean;
  /** The result of the last scan, pause or resume on this group. */
  outcome: ActionOutcome | null;
  onRun: (watchlistId: string) => void;
  onSetActive: (watchlistId: string, isActive: boolean) => void;
  /** Returns to the list when the layout is stacked (narrow screens). */
  onBack: () => void;
}) {
  const [activeSection, setActiveSection] = useState<DetailSection | null>(null);
  const scan = scanState(watchlist, now);
  const readyCount = result?.readyToAct.length ?? 0;
  const reviewCount = result?.discoveryCandidates.length ?? 0;
  const lastScan = formatShortDate(watchlist.lastScanAt);
  const sources = visibleSources(watchlist.sourcePreferences);
  const termCount =
    watchlist.includeTerms.length + watchlist.excludeTerms.length + watchlist.suggestedPlaces.length;
  const headingId = detailHeadingId(watchlist.id);

  const scanLabel = busy
    ? "Starting…"
    : scan.isScanning
      ? "Scan in progress"
      : lastScan
        ? "Scan again"
        : "Start scan";

  return (
    <section
      id="buyer-group-detail"
      aria-labelledby={headingId}
      className="scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="px-4 py-4 md:px-5">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground min-[1051px]:hidden" onClick={onBack}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          All buyer groups
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h2 id={headingId} tabIndex={-1} className="min-w-0 text-xl leading-7 font-semibold text-foreground outline-none">
            {watchlist.name}
          </h2>
          <StatusBadge tone={scan.tone} icon={scan.icon}>
            {scan.label}
          </StatusBadge>
        </div>
        <p className="mt-1 text-sm leading-6 text-subtle">
          {lastScan ? `Last scan ${lastScan}` : "Not scanned yet"}
          {!resultsUnavailable && readyCount + reviewCount > 0
            ? `. ${readyCount} ready to review, ${reviewCount} review only.`
            : null}
        </p>

        {scan.tone === "danger" || scan.tone === "warning" ? <ScanProblem tone={scan.tone} /> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {watchlist.isActive ? (
            <>
              <Button type="button" disabled={busy || scan.isScanning} onClick={() => onRun(watchlist.id)}>
                <Search className="size-4" aria-hidden="true" />
                {scanLabel}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => onSetActive(watchlist.id, false)}>
                <Pause className="size-4" aria-hidden="true" />
                Pause group
              </Button>
            </>
          ) : (
            <Button type="button" disabled={busy} onClick={() => onSetActive(watchlist.id, true)}>
              <Play className="size-4" aria-hidden="true" />
              {busy ? "Resuming…" : "Resume group"}
            </Button>
          )}
        </div>
        {outcome ? <OutcomeNotice outcome={outcome} className="mt-3" /> : null}
      </div>

      <dl className="space-y-3 border-t border-border px-4 py-4 text-sm leading-6 md:px-5">
        {[
          { term: "Audience", value: watchlist.targetBuyer },
          { term: "Problem", value: watchlist.problemToSolve },
          { term: "Sources", value: sources.length > 0 ? sources.map(sourceLabel).join(", ") : "None selected" },
        ].map((row) => (
          <div key={row.term} className="md:grid md:grid-cols-[7rem_minmax(0,1fr)] md:gap-x-6">
            <dt className="font-medium text-subtle">{row.term}</dt>
            <dd className="text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby={`${headingId}-signals`} className="border-t border-border px-4 py-4 md:px-5">
        <h3 id={`${headingId}-signals`} className="text-base leading-6 font-semibold text-foreground">
          Latest signals
        </h3>
        <div className="mt-1">
          <SignalList
            result={result}
            unavailable={resultsUnavailable}
            scan={scan}
            isActive={watchlist.isActive}
            lastScan={lastScan}
            now={now}
          />
        </div>
      </section>

      {termCount > 0 ? (
        <DetailCard
          id={`watchlist-${watchlist.id}-terms`}
          title="Search terms"
          summary={`${termCount} ${termCount === 1 ? "term or place" : "terms and places"} shape this scan`}
          isOpen={activeSection === "terms"}
          onClick={() => setActiveSection((current) => (current === "terms" ? null : "terms"))}
        >
          <dl className="space-y-3">
            <TermList label="Words people might use" values={watchlist.includeTerms} />
            <TermList label="Left out" values={watchlist.excludeTerms} />
            <TermList label="Communities to prioritise" values={watchlist.suggestedPlaces} />
          </dl>
        </DetailCard>
      ) : null}
    </section>
  );
}
