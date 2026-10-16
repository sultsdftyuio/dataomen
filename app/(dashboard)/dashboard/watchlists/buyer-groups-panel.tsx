import { ContextCard, ContextLink } from "@/components/dashboard/ContextLayout";
import { suggestionAnchorId } from "@/components/prospects/suggestion-anchor";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import type { WatchlistView } from "../prospect-types";

type BuyerGroupsPanelProps = {
  watchlists: WatchlistView[];
  suggestions: BuyerGroupSuggestion[];
  /**
   * Whether the suggestions open expanded. When they start collapsed (the
   * workspace already has groups) the links go to the section heading,
   * because the individual suggestions aren't on the page yet.
   */
  suggestionsExpanded: boolean;
};

/**
 * The Buyer groups context panel: how many groups exist and are running, and
 * an index of the suggested groups. Selecting a group stays in the work
 * area, where its detail and actions live.
 */
export function BuyerGroupsPanel({ watchlists, suggestions, suggestionsExpanded }: BuyerGroupsPanelProps) {
  const activeCount = watchlists.filter((watchlist) => watchlist.isActive).length;

  return (
    <>
      <ContextCard>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold text-[var(--rail-foreground)]">Your groups</span>
          <span className="text-sm tabular-nums text-[var(--rail-foreground)]">{watchlists.length}</span>
        </div>
        <p className="arc-context-note text-xs leading-5">
          {watchlists.length === 0
            ? "None yet. A group focuses scans on one audience and the problem they share."
            : `${activeCount} running, ${watchlists.length - activeCount} paused.`}
        </p>
      </ContextCard>

      {suggestions.length > 0 ? (
        <>
          <h2 className="arc-context-heading">Suggested from your website</h2>
          <nav aria-label="Suggested buyer groups" className="arc-context-list">
            {suggestions.map((suggestion) => (
              <ContextLink
                key={suggestion.id}
                href={suggestionsExpanded ? `#${suggestionAnchorId(suggestion.id)}` : "#website-demand-map-heading"}
                title={suggestion.name}
                detail={`${suggestion.communityPlan.sources.length} ${suggestion.communityPlan.sources.length === 1 ? "source" : "sources"}`}
              />
            ))}
          </nav>
        </>
      ) : null}
    </>
  );
}
