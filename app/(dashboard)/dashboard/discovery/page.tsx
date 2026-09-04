import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DiscoveryLoadingPage } from "@/components/onboarding/discovery-loading-page";
import {
  fetchBuyerDemandReport,
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  isBuyerDemandReportCurrent,
  isServiceProfileWarmingUp,
  verifierScoreThreshold,
} from "../data";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Live discovery | Arcli",
  description: "Follow Arcli as it prepares fresh prospect discovery results.",
};

type DiscoveryPageProps = {
  searchParams: Promise<{ scan?: string | string[] }>;
};

export default async function DashboardDiscoveryPage({ searchParams }: DiscoveryPageProps) {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;
    if (status === 401) redirect("/login?next=/dashboard/discovery");
    if (status === 202) redirect("/onboarding/workspace");
    if (status === 403) redirect("/unauthorized");
    redirect("/error");
  }

  const { supabase, tenantId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);
  if (!websiteUrl) redirect("/onboarding/workspace");

  const [serviceProfile, crawlJob] = await Promise.all([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
  ]);
  const buyerDemandReport = await fetchBuyerDemandReport(
    supabase,
    tenantId,
    serviceProfile.id,
    verifierScoreThreshold(),
  );
  const currentBuyerDemandReport = isBuyerDemandReportCurrent(
    crawlJob,
    buyerDemandReport,
  )
    ? buyerDemandReport
    : null;
  const crawlStatus = crawlJob?.status?.trim().toLowerCase() ?? null;
  const crawlIsActive = ["queued", "pending", "processing"].includes(crawlStatus ?? "");
  const isWarmingUp =
    isServiceProfileWarmingUp(serviceProfile) ||
    Boolean(currentBuyerDemandReport && !currentBuyerDemandReport.isTerminal);
  const { scan } = await searchParams;
  const scanWasJustRequested = Boolean(scan);

  if (!scanWasJustRequested && !crawlIsActive && !isWarmingUp) {
    redirect("/dashboard");
  }

  return (
    <DiscoveryLoadingPage
      websiteUrl={websiteUrl}
      crawlJob={crawlJob}
      serviceProfile={serviceProfile}
      buyerDemandReport={currentBuyerDemandReport}
      isWarmingUp={isWarmingUp}
      awaitingDiscoveryStart={
        scanWasJustRequested &&
        !crawlIsActive &&
        !isWarmingUp &&
        currentBuyerDemandReport === null
      }
      mode="scan"
    />
  );
}
