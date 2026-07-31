import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  fetchBuyerDemandReport,
  fetchBuyerLanguageResearch,
  fetchDiscoveryCandidates,
  fetchLatestCrawlJob,
  fetchQualifiedLeads,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  fetchWatchlistResults,
  fetchWatchlists,
  isServiceProfileWarmingUp,
  verifierScoreThreshold,
} from "./data";
import { createWatchlist, requestBuyerLanguageResearch, runWatchlistDiscovery, setWatchlistActive } from "./actions";
import ProspectDashboardClient from "./prospect-dashboard-client";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const metadata: Metadata = {
  title: "Prospect Intelligence | Arcli",
  description: "Review qualified prospect matches.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    switch (status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const threshold = verifierScoreThreshold();

  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);

  if (!websiteUrl) {
    redirect("/onboarding/workspace");
  }

  const [leads, discoveryCandidates, serviceProfile, crawlJob, watchlists] = await Promise.all([
    fetchQualifiedLeads(supabase, tenantId, threshold),
    fetchDiscoveryCandidates(supabase, tenantId),
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
    fetchWatchlists(supabase, tenantId),
  ]);
  const [buyerDemandReport, buyerLanguageResearch, watchlistResults] = await Promise.all([
    fetchBuyerDemandReport(supabase, tenantId, serviceProfile.id, threshold),
    fetchBuyerLanguageResearch(supabase, tenantId, serviceProfile.id),
    fetchWatchlistResults(supabase, tenantId, watchlists, threshold),
  ]);

  return (
    <ProspectDashboardClient
      serviceProfile={serviceProfile}
      crawlJob={crawlJob}
      leads={leads}
      discoveryCandidates={discoveryCandidates}
      buyerDemandReport={buyerDemandReport}
      buyerLanguageResearch={buyerLanguageResearch}
      requestBuyerLanguageResearch={requestBuyerLanguageResearch}
      watchlists={watchlists}
      watchlistResults={watchlistResults}
      createWatchlist={createWatchlist}
      runWatchlistDiscovery={runWatchlistDiscovery}
      setWatchlistActive={setWatchlistActive}
      verifierThreshold={threshold}
      isWarmingUp={isServiceProfileWarmingUp(serviceProfile)}
    />
  );
}
