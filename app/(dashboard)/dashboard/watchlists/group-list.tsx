import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { WatchlistResultsView, WatchlistView } from "../prospect-types";
import { scanState } from "./scan-status";

export const groupRowId = (watchlistId: string) => `buyer-group-row-${watchlistId}`;

/**
 * The workspace's buyer groups. Each row is a real button inside a list item,
 * and the selected one carries aria-current so screen readers hear which
 * group the detail panel shows.
 */
export function GroupList({
  watchlists,
  resultByWatchlist,
  resultsUnavailable,
  selectedId,
  now,
  onSelect,
}: {
  watchlists: WatchlistView[];
  resultByWatchlist: Map<string, WatchlistResultsView>;
  resultsUnavailable: boolean;
  selectedId: string | null;
  now: number;
  onSelect: (watchlistId: string) => void;
}) {
  return (
    <section aria-labelledby="buyer-group-list-heading" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="buyer-group-list-heading" className="text-base leading-6 font-semibold text-foreground">
          Your buyer groups
        </h2>
        <span className="text-sm text-subtle tabular-nums">
          {watchlists.length} {watchlists.length === 1 ? "group" : "groups"}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {watchlists.map((watchlist) => {
          const result = resultByWatchlist.get(watchlist.id);
          const readyCount = result?.readyToAct.length ?? 0;
          const reviewCount = result?.discoveryCandidates.length ?? 0;
          const selected = watchlist.id === selectedId;
          const scan = scanState(watchlist, now);

          return (
            <li key={watchlist.id}>
              <button
                id={groupRowId(watchlist.id)}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(watchlist.id)}
                className={cn(
                  "block w-full border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selected ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-off-white",
                )}
              >
                <span className="block truncate text-sm leading-6 font-semibold text-foreground">{watchlist.name}</span>
                <span className="block truncate text-sm leading-5 text-muted-foreground">{watchlist.targetBuyer}</span>
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge tone={scan.tone} icon={scan.icon} size="compact">
                    {scan.label}
                  </StatusBadge>
                  {resultsUnavailable ? null : (
                    <span className="text-xs leading-5 text-subtle tabular-nums">
                      {readyCount} ready, {reviewCount} review only
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
