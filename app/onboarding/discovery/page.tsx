import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DiscoveryLoadingPage } from "@/components/onboarding/discovery-loading-page";
import { BriefLoadingPage } from "@/components/onboarding/brief-loading-page";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { fetchCrawlPageSummaries } from "@/lib/onboarding/crawl-pages";
import {
  fetchBuyerDemandReport,
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  isBuyerDemandReportCurrent,
  isServiceProfileWarmingUp,
  verifierScoreThreshold,
} from "@/app/(dashboard)/dashboard/data";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reading your website | Arcli",
  description: "Follow website brief preparation and, on Pro, public discovery.",
};

type DiscoveryPageProps = {
  searchParams: Promise<{ scan?: string | string[] }>;
};

export default async function DiscoveryPage({ searchParams }: DiscoveryPageProps) {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;
    if (status === 401) redirect("/login?next=/onboarding/discovery");
    if (status === 202) redirect("/onboarding/workspace");
    if (status === 403) redirect("/unauthorized");
    redirect("/error");
  }

  const { supabase, tenantId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);
  if (!websiteUrl) redirect("/onboarding/workspace");

  const [serviceProfile, crawlJob, entitlements] = await Promise.all([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
    getWorkspaceEntitlements(supabase, tenantId),
  ]);
  const crawledPages = await fetchCrawlPageSummaries(supabase, tenantId, crawlJob?.id);
  const resolvedSearchParams = await searchParams;
  const scanWasJustRequested = Boolean(resolvedSearchParams.scan);
  const crawlStatus = crawlJob?.status?.trim().toLowerCase() ?? null;
  const crawlIsActive = ["queued", "pending", "processing"].includes(crawlStatus ?? "");

  // The extracted profile is a draft until the customer approves it. Bring
  // them to the existing editor as soon as the website read has finished.
  if (
    serviceProfile.hasProfile &&
    serviceProfile.status?.trim().toLowerCase() === "pending_review" &&
    !crawlIsActive
  ) {
    redirect("/onboarding/workspace?edit=1");
  }

  if (!entitlements.isPro) {
    return (
      <BriefLoadingPage
        websiteUrl={websiteUrl}
        crawlJob={crawlJob}
        serviceProfile={serviceProfile}
        crawledPages={crawledPages}
        scanWasJustRequested={scanWasJustRequested}
      />
    );
  }

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
  // Never make onboarding a dead end. If no job was ever recorded, the
  // dashboard shows the recovery controls instead of sending the customer
  // straight back to this polling page. A fresh submission keeps `?scan=1`
  // so the page can show a useful start failure if its job is missing.
  if (!scanWasJustRequested && !crawlJob) {
    redirect("/dashboard");
  }

  // A completed profile and terminal report can be opened directly from a
  // bookmark. Likewise, once no crawl or profile preparation is active, the
  // dashboard is the useful place to inspect a delayed source search rather
  // than waiting here forever for optional discovery telemetry.
  if (
    !scanWasJustRequested &&
    !crawlIsActive &&
    !isServiceProfileWarmingUp(serviceProfile)
  ) {
    redirect("/dashboard");
  }

  return (
    <DiscoveryLoadingPage
      websiteUrl={websiteUrl}
      crawlJob={crawlJob}
      serviceProfile={serviceProfile}
      crawledPages={crawledPages}
      scanWasJustRequested={scanWasJustRequested}
      buyerDemandReport={currentBuyerDemandReport}
      isWarmingUp={isServiceProfileWarmingUp(serviceProfile)}
    />
  );
}
