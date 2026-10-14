import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import {
  deriveBuyerGroupSuggestions,
  type BuyerGroupSuggestion,
} from "@/lib/buyer-group-suggestions";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import {
  createWatchlist,
  activateSuggestedBuyerGroup,
  runWatchlistDiscovery,
  setWatchlistActive,
} from "../actions";
import {
  fetchWatchlistResults,
  fetchWatchlists,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  verifierScoreThreshold,
} from "../data";
import type { WatchlistView } from "../prospect-types";
import WatchlistsPanel from "../watchlists-panel";
import { BuyerGroupsHeaderActions } from "./header-actions";
import { RefreshLoadError } from "./refresh-error";

export const metadata: Metadata = {
  title: "Buyer groups | Arcli",
  description: "Focus prospect discovery on the buyer groups that matter most.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Hides suggestions the workspace already has as a group. The activation
 * action matches existing groups on the same audience and problem pair.
 */
function unwatchedSuggestions(suggestions: BuyerGroupSuggestion[], watchlists: WatchlistView[]) {
  const key = (targetBuyer: string, problem: string) =>
    `${targetBuyer.trim().toLocaleLowerCase()}\u0000${problem.trim().toLocaleLowerCase()}`;
  const watched = new Set(watchlists.map((watchlist) => key(watchlist.targetBuyer, watchlist.problemToSolve)));
  return suggestions.filter((suggestion) => !watched.has(key(suggestion.targetBuyer, suggestion.problemToSolve)));
}

export default async function WatchlistsPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard/watchlists");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);
  if (!entitlements.isPro) {
    redirect("/dashboard");
  }

  // A failed group load throws to the dashboard error boundary: showing the
  // first-group setup instead would invite duplicate groups.
  const threshold = verifierScoreThreshold();
  const [watchlists, websiteUrl] = await Promise.all([
    fetchWatchlists(supabase, tenantId),
    fetchTenantWebsiteUrl(supabase, tenantId),
  ]);
  // Matches and suggestions are secondary panels, so each fails on its own
  // with a retry while the groups stay usable. The loaders log the cause.
  const [profileResult, resultsResult] = await Promise.allSettled([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchWatchlistResults(supabase, tenantId, watchlists, threshold),
  ]);
  // A server component renders once per request, so reading the clock here is
  // deterministic for that render; client components receive it as a prop.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  const buyerGroupSuggestions =
    profileResult.status === "fulfilled"
      ? unwatchedSuggestions(
          deriveBuyerGroupSuggestions({
            targetAudience: profileResult.value.fields.target_audience,
            coreProblem: profileResult.value.fields.core_problem,
            uniqueValueProp: profileResult.value.fields.unique_value_prop,
            useCases: profileResult.value.fields.use_cases,
            painPoints: profileResult.value.fields.pain_points,
            buyingTriggers: profileResult.value.fields.buying_triggers,
            discoveryQueries: profileResult.value.fields.discovery_queries,
            searchTerms: profileResult.value.fields.search_terms,
            negativeKeywords: profileResult.value.fields.negative_keywords,
            excludedAudiences: profileResult.value.fields.excluded_audiences,
          }),
          watchlists,
        )
      : [];

  return (
    <div className="arc-workspace-page arc-workspace-page--buyers">
      <PageHeader
        title="Buyer groups"
        description="Pair an audience with a problem, and Arcli finds people describing it."
        actions={
          <BuyerGroupsHeaderActions
            createWatchlist={createWatchlist}
            canCreate={watchlists.length > 0}
          />
        }
      />

      <WatchlistsPanel
        watchlists={watchlists}
        results={resultsResult.status === "fulfilled" ? resultsResult.value : []}
        resultsUnavailable={resultsResult.status === "rejected"}
        now={renderedAt}
        createWatchlist={createWatchlist}
        runWatchlistDiscovery={runWatchlistDiscovery}
        setWatchlistActive={setWatchlistActive}
        hasSuggestedBuyerGroups={buyerGroupSuggestions.length > 0}
        suggestions={
          profileResult.status === "rejected" ? (
            <RefreshLoadError thing="Suggested buyer groups" />
          ) : (
            <WebsiteDemandMap
              suggestions={buyerGroupSuggestions}
              activateBuyerGroup={activateSuggestedBuyerGroup}
              collapsible
              defaultExpanded={watchlists.length === 0}
            />
          )
        }
      />
    </div>
  );
}
