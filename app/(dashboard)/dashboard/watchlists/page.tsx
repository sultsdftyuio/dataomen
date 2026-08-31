import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import { deriveBuyerGroupSuggestions } from "@/lib/buyer-group-suggestions";
import { C } from "@/lib/tokens";
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
    useCases: serviceProfile.fields.use_cases,
    painPoints: serviceProfile.fields.pain_points,
    buyingTriggers: serviceProfile.fields.buying_triggers,
    negativeKeywords: serviceProfile.fields.negative_keywords,
    excludedAudiences: serviceProfile.fields.excluded_audiences,
  });
  const results = await fetchWatchlistResults(
    supabase,
    tenantId,
    watchlists,
    threshold,
  );
  const activeWatchlistCount = watchlists.filter((watchlist) => watchlist.isActive).length;
  const sourceCount = new Set(
    watchlists.flatMap((watchlist) =>
      watchlist.sourcePreferences.filter((source) => source.trim().toLowerCase() !== "x"),
    ),
  ).size;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-3 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Focused search"
        title="Buyer groups"
        description={
          watchlists.length === 0
            ? "Start with a website-derived direction on Prospects, then use Buyer Groups to manage and refine the focused scans you keep."
            : "Watch the audiences that matter most, one real problem at a time."
        }
        icon={UsersRound}
        visual={
          watchlists.length === 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.blue }}>
                First step
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
                Start from the website demand map.
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                Choose a suggested direction to start a focused scan, or add a custom market here.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
                Your coverage
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2.5" style={{ borderColor: C.rule }}>
                  <p className="text-lg font-bold tracking-tight" style={{ color: C.navy }}>{activeWatchlistCount}</p>
                  <p className="mt-1 text-[10px] font-medium" style={{ color: C.muted }}>Active groups</p>
                </div>
                <div className="rounded-md border p-2.5" style={{ borderColor: C.rule }}>
                  <p className="text-lg font-bold tracking-tight" style={{ color: C.navy }}>{sourceCount}</p>
                  <p className="mt-1 text-[10px] font-medium" style={{ color: C.muted }}>Sources picked</p>
                </div>
              </div>
            </div>
          )
        }
      />

      <WebsiteDemandMap
        suggestions={buyerGroupSuggestions}
        activateBuyerGroup={activateSuggestedBuyerGroup}
      />

      <WatchlistsPanel
        watchlists={watchlists}
        results={results}
        createWatchlist={createWatchlist}
        runWatchlistDiscovery={runWatchlistDiscovery}
        setWatchlistActive={setWatchlistActive}
      />
    </div>
  );
}
