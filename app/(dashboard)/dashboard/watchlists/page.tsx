import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import { deriveBuyerGroupSuggestions } from "@/lib/buyer-group-suggestions";
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
import WatchlistsPanel from "../watchlists-panel";

export const metadata: Metadata = {
  title: "Buyer Groups | Arcli",
  description: "Focus prospect discovery on the buyer groups that matter most.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const threshold = verifierScoreThreshold();
  const [watchlists, websiteUrl] = await Promise.all([
    fetchWatchlists(supabase, tenantId),
    fetchTenantWebsiteUrl(supabase, tenantId),
  ]);
  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const buyerGroupSuggestions = deriveBuyerGroupSuggestions({
    targetAudience: serviceProfile.fields.target_audience,
    coreProblem: serviceProfile.fields.core_problem,
    uniqueValueProp: serviceProfile.fields.unique_value_prop,
    useCases: serviceProfile.fields.use_cases,
    painPoints: serviceProfile.fields.pain_points,
    buyingTriggers: serviceProfile.fields.buying_triggers,
    discoveryQueries: serviceProfile.fields.discovery_queries,
    searchTerms: serviceProfile.fields.search_terms,
    negativeKeywords: serviceProfile.fields.negative_keywords,
    excludedAudiences: serviceProfile.fields.excluded_audiences,
  });
  const results = await fetchWatchlistResults(
    supabase,
    tenantId,
    watchlists,
    threshold,
  );
  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Focused search"
        title="Buyer groups"
        description="Keep a small number of audience-and-problem hypotheses, then review the public conversations they surface."
        icon={UsersRound}
      />

      <WebsiteDemandMap
        suggestions={buyerGroupSuggestions}
        activateBuyerGroup={activateSuggestedBuyerGroup}
        collapsible
      />

      <WatchlistsPanel
        watchlists={watchlists}
        results={results}
        createWatchlist={createWatchlist}
        runWatchlistDiscovery={runWatchlistDiscovery}
        setWatchlistActive={setWatchlistActive}
        hasSuggestedBuyerGroups={buyerGroupSuggestions.length > 0}
      />
    </div>
  );
}
