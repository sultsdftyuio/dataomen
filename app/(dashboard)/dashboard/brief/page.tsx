import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { ServiceProfileSettings } from "@/components/settings/workspace_page/service-profile-settings";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import {
  fetchBuyerDemandReport,
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  isBuyerDemandReportCurrent,
  verifierScoreThreshold,
} from "../data";

export const metadata: Metadata = {
  title: "Targeting | Arcli",
  description: "Tell Arcli who to look for and what public signals matter.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MatchingBriefPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard/brief");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);

  if (!websiteUrl) {
    redirect("/onboarding/workspace");
  }

  const [serviceProfile, crawlJob, entitlements] = await Promise.all([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
    getWorkspaceEntitlements(supabase, tenantId),
  ]);
  const buyerDemandReport = await fetchBuyerDemandReport(
    supabase,
    tenantId,
    serviceProfile.id,
    verifierScoreThreshold(),
  );
  const latestScan = isBuyerDemandReportCurrent(crawlJob, buyerDemandReport)
    ? buyerDemandReport
    : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Discovery setup"
        title="Targeting"
        description="Define the buyer, problem, and public signals that make a conversation worth reviewing."
        icon={Target}
      />

      <ServiceProfileSettings
        serviceProfile={serviceProfile}
        crawlJob={crawlJob}
        websiteUrl={websiteUrl}
        isPro={entitlements.isPro}
        latestScan={latestScan}
        layout="progressive"
      />
    </div>
  );
}
