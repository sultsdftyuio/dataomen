import { Button } from "@/components/ui/button";

import {
  statusFilters,
  statusLabels,
  tierFilters,
  tierLabels,
  type StatusFilter,
  type TierFilter,
} from "./labels";

type QueueFiltersProps = {
  status: StatusFilter;
  tier: TierFilter;
  statusCounts: Record<StatusFilter, number>;
  /** Counts within the current status, so a chip never promises rows the list won't show. */
  tierCounts: Record<TierFilter, number>;
  onStatusChange: (status: StatusFilter) => void;
  onTierChange: (tier: TierFilter) => void;
};

export function QueueFilters({ status, tier, statusCounts, tierCounts, onStatusChange, onTierChange }: QueueFiltersProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      {/* Selection is shown by the raised tile and colour; weight stays fixed so labels don't shift. */}
      <div role="group" aria-label="Review status" className="flex max-w-md flex-wrap gap-1 rounded-md bg-off-white p-1">
        {statusFilters.map((filter) => (
          <Button
            key={filter}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={status === filter}
            onClick={() => onStatusChange(filter)}
            className="min-w-fit flex-1 gap-1.5 px-2.5 text-[13px] text-muted-foreground hover:bg-card hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-xs aria-pressed:ring-1 aria-pressed:ring-rule-dark"
          >
            {statusLabels[filter]}
            <span className="text-xs tabular-nums text-subtle">{statusCounts[filter]}</span>
          </Button>
        ))}
      </div>
      <div role="group" aria-label="Signal" className="flex flex-wrap gap-x-1.5 gap-y-2">
        {tierFilters.map((filter) => (
          <Button
            key={filter}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={tier === filter}
            onClick={() => onTierChange(filter)}
            className="h-7 gap-1.5 rounded-full border-input px-2 text-xs text-navy-soft shadow-none aria-pressed:border-primary aria-pressed:bg-blue-pale aria-pressed:text-primary"
          >
            {filter === "all" ? "All signals" : tierLabels[filter]}
            {filter === "all" ? null : <span className="tabular-nums text-subtle">{tierCounts[filter]}</span>}
          </Button>
        ))}
      </div>
    </div>
  );
}
