import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { ServiceProfileSettings } from "@/components/settings/workspace_page/service-profile-settings";
import { TargetingBriefEditor } from "@/components/settings/workspace_page/targeting-brief-editor";
import { TargetingOverview } from "@/components/settings/workspace_page/targeting-overview";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { saveTargetingBrief } from "../targeting-actions";
import {
  fetchBuyerDemandReport,
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  isBuyerDemandReportCurrent,
  verifierScoreThreshold,
} from "../data";
import { fetchTargetingBrief } from "../targets/data";

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
  const buyerDemandReport = entitlements.isPro
    ? await fetchBuyerDemandReport(
        supabase,
        tenantId,
        serviceProfile.id,
        verifierScoreThreshold(),
      )
    : null;
  const latestScan = buyerDemandReport && isBuyerDemandReportCurrent(crawlJob, buyerDemandReport)
    ? buyerDemandReport
    : null;
  const targetingBrief = await fetchTargetingBrief(
    supabase,
    tenantId,
    serviceProfile.id,
  );
  const saveBrief = saveTargetingBrief.bind(null, serviceProfile.id);

  return (
    <div className="arc-workspace-page arc-workspace-page--targeting">
      <DashboardPageIntro
        eyebrow="Targeting"
        title="Who to look for, and why."
        description="Guides every future search. Existing prospects stay as they are."
        icon={Target}
      />

      <TargetingOverview profile={serviceProfile} brief={targetingBrief} />

      <div id="targeting-editor" className="scroll-mt-5">
        <ServiceProfileSettings
          serviceProfile={serviceProfile}
          crawlJob={crawlJob}
          websiteUrl={websiteUrl}
          isPro={entitlements.isPro}
          latestScan={latestScan}
          layout="progressive"
        />
      </div>

      {serviceProfile.hasProfile ? (
        <div id="targeting-universe-editor" className="scroll-mt-5">
          <TargetingBriefEditor
            initialBrief={targetingBrief}
            onSave={saveBrief}
          />
        </div>
      ) : null}
    </div>
  );
}
