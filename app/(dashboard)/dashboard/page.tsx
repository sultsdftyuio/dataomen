import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  fetchBuyerDemandReport,
  fetchDiscoveryCandidates,
  fetchLeadQueueCounts,
  fetchLatestCrawlJob,
  fetchQualifiedLeads,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  fetchWebsiteCrawlCooldown,
  isBuyerDemandReportCurrent,
  isServiceProfileWarmingUp,
  verifierScoreThreshold,
} from "./data";
import FreeProspectPreview from "./free-prospect-preview";
import ProspectDashboardClient from "./prospect-dashboard-client";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const metadata: Metadata = {
  title: "Prospects | Arcli",
  description: "Review evidence-backed prospect conversations and next steps.",
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

  const [serviceProfile, crawlJob, entitlements, websiteCrawlCooldown] = await Promise.all([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
    getWorkspaceEntitlements(supabase, tenantId),
    fetchWebsiteCrawlCooldown(supabase, tenantId),
  ]);
  const buyerDemandReport = await fetchBuyerDemandReport(
    supabase,
    tenantId,
    serviceProfile.id,
    threshold,
  );
  const crawlStatus = crawlJob?.status?.trim().toLowerCase() ?? null;
  const crawlIsActive = ["queued", "pending", "processing"].includes(crawlStatus ?? "");
  const crawlFailed = crawlStatus === "failed" || crawlStatus === "dead_lettered";
  const discoveryRunIsActive = Boolean(
    buyerDemandReport &&
      !buyerDemandReport.isTerminal &&
      isBuyerDemandReportCurrent(crawlJob, buyerDemandReport),
  );
  const isDiscoveryWarmingUp =
    isServiceProfileWarmingUp(serviceProfile) || discoveryRunIsActive;

  // An active crawl still gets the focused progress view. If a job is missing
  // or has failed, keep the dashboard available so the person can see the
  // problem and retry instead of bouncing between two loading routes.
  if (
    crawlIsActive ||
    discoveryRunIsActive ||
    (isServiceProfileWarmingUp(serviceProfile) &&
      crawlJob !== null &&
      !crawlFailed &&
      serviceProfile.hasProfile)
  ) {
    redirect("/dashboard/discovery");
  }

  if (!entitlements.isPro) {
    const counts = await fetchLeadQueueCounts(
      supabase,
      tenantId,
      serviceProfile.id,
      threshold,
      serviceProfile.updatedAt,
    );
    return (
      <FreeProspectPreview
        websiteUrl={websiteUrl}
        counts={counts}
        scanStatus={crawlStatus}
        discoveryStatus={buyerDemandReport?.status ?? null}
        verificationPending={buyerDemandReport?.summary.verifierPending ?? false}
      />
    );
  }

  const [leads, discoveryCandidates] = await Promise.all([
    fetchQualifiedLeads(
      supabase,
      tenantId,
      serviceProfile.id,
      threshold,
      serviceProfile.updatedAt,
    ),
    fetchDiscoveryCandidates(
      supabase,
      tenantId,
      serviceProfile.id,
      serviceProfile.updatedAt,
    ),
  ]);
  return (
    <ProspectDashboardClient
      serviceProfile={serviceProfile}
      crawlJob={crawlJob}
      websiteCrawlCooldown={websiteCrawlCooldown}
      leads={leads}
      discoveryCandidates={discoveryCandidates}
      buyerDemandReport={buyerDemandReport}
      isWarmingUp={isDiscoveryWarmingUp}
    />
  );
}
