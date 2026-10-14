import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ServiceProfileSettings } from "@/components/settings/workspace_page/service-profile-settings";
import { TargetingBriefEditor } from "@/components/settings/workspace_page/targeting-brief-editor";
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
import { BriefSaveProvider } from "./brief-save";

export const metadata: Metadata = {
  title: "Targeting | Arcli",
  description: "Tell Arcli who to look for and what public signals matter.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function lastUpdatedLabel(updatedAt: string | null) {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Last updated ${date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

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
      <PageHeader
        title="Targeting"
        description="Who Arcli looks for, and what counts as a signal. Changes apply to future scans only."
        meta={lastUpdatedLabel(serviceProfile.updatedAt)}
      />

      {/* One save bar for both parts of the brief, so saving one never discards the other's edits. */}
      <BriefSaveProvider>
        <ServiceProfileSettings
          serviceProfile={serviceProfile}
          websiteUrl={websiteUrl}
          isPro={entitlements.isPro}
          latestScan={latestScan}
        />

        {serviceProfile.hasProfile ? (
          <TargetingBriefEditor
            initialBrief={targetingBrief}
            onSave={saveBrief}
          />
        ) : null}
      </BriefSaveProvider>
    </div>
  );
}
