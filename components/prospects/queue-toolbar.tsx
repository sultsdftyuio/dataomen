"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import type {
  LeadQueueConfidence,
  LeadQueueFilter,
  LeadQueueSort,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { sourceDisplayName, metricValue } from "@/components/prospects/lead-desk-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type QueueCounts = Record<LeadQueueFilter, number>;

const VIEW_SEGMENTS: Array<{ value: LeadQueueFilter; label: string }> = [
  { value: "all", label: "Inbox" },
  { value: "leads", label: "Signals" },
  { value: "potential", label: "Maybes" },
  { value: "done", label: "Done" },
];

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:h-9 md:text-sm";

type QueueToolbarProps = {
  view: LeadQueueFilter;
  counts: QueueCounts;
  query: string;
  confidence: LeadQueueConfidence;
  source: string;
  sources: string[];
  /** Search, strength, source or the screened view; sort is not a filter. */
  activeFilterCount: number;
  onViewChange: (view: LeadQueueFilter) => void;
  onQueryChange: (value: string) => void;
  onConfidenceChange: (value: LeadQueueConfidence) => void;
  onSourceChange: (value: string) => void;
  onClearFilters: () => void;
};

/**
 * The desk's control row: a segmented view switch with counts (replacing the
 * old four-card stat strip, which pushed the inbox below the fold on phones),
 * search, and the less-used filters behind one toggle.
 */
export function QueueToolbar({
  view,
  counts,
  query,
  confidence,
  source,
  sources,
  activeFilterCount,
  onViewChange,
  onQueryChange,
  onConfidenceChange,
  onSourceChange,
  onClearFilters,
}: QueueToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelFilterCount = Number(confidence !== "all") + Number(source !== "all") + Number(view === "screened");

  return (
    <div className="border-b border-border">
      <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between md:px-4">
        <div role="group" aria-label="Show prospects" className="flex rounded-md bg-off-white p-0.5 ring-1 ring-inset ring-border md:w-auto">
          {VIEW_SEGMENTS.map((segment) => {
            const active = view === segment.value;
            return (
              <button
                key={segment.value}
                type="button"
                aria-pressed={active}
                onClick={() => onViewChange(segment.value)}
                className={cn(
                  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:flex-none md:px-3",
                  active
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {segment.label}
                <span className={cn("text-xs tabular-nums", active ? "text-navy-soft" : "text-subtle")}>
                  {metricValue(counts[segment.value])}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 items-center gap-2 md:w-[min(28rem,55%)]">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search prospects</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search prospects"
              className="h-10 bg-card pl-9 md:h-9"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-10 md:h-9"
            aria-expanded={filtersOpen}
            aria-controls="prospect-advanced-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters{panelFilterCount > 0 ? ` (${panelFilterCount})` : ""}
          </Button>
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="hidden text-primary sm:inline-flex" onClick={onClearFilters}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {filtersOpen ? (
        <div id="prospect-advanced-filters" className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 md:px-4 lg:grid-cols-[repeat(3,minmax(0,14rem))] lg:items-end">
          <FilterField label="Match strength">
            <select
              value={confidence}
              onChange={(event) => onConfidenceChange(event.target.value as LeadQueueConfidence)}
              className={SELECT_CLASS}
            >
              <option value="all">Any strength</option>
              <option value="high">80% and above</option>
              <option value="sixty_plus">60% and above</option>
            </select>
          </FilterField>
          <FilterField label="Source">
            <select value={source} onChange={(event) => onSourceChange(event.target.value)} className={SELECT_CLASS}>
              <option value="all">All sources</option>
              {sources.map((item) => (
                <option key={item} value={item}>{sourceDisplayName(item)}</option>
              ))}
            </select>
          </FilterField>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 md:h-9"
              aria-pressed={view === "screened"}
              onClick={() => onViewChange(view === "screened" ? "all" : "screened")}
            >
              {view === "screened" ? "Back to inbox" : `Show screened out (${metricValue(counts.screened)})`}
            </Button>
            {activeFilterCount > 0 ? (
              <Button type="button" variant="ghost" className="h-10 text-primary sm:hidden" onClick={onClearFilters}>
                Clear all
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

/** Visible sort, so the order of the list is never a hidden setting. */
export function QueueSortSelect({
  value,
  onChange,
}: {
  value: LeadQueueSort;
  onChange: (value: LeadQueueSort) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-subtle">
      Sort
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LeadQueueSort)}
        className="h-8 rounded-md border border-input bg-card px-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:h-7 md:text-xs"
      >
        <option value="priority">Most relevant</option>
        <option value="newest">Newest first</option>
        <option value="confidence">Match strength</option>
      </select>
    </label>
  );
}
