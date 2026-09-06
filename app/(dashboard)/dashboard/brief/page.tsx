import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchingBriefGuide } from "@/components/settings/workspace_page/matching-brief-guide";
import { ServiceProfileSettings } from "@/components/settings/workspace_page/service-profile-settings";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { startWebsiteDemandScan } from "../actions";
import {
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "../data";

export const metadata: Metadata = {
  title: "Matching Brief | Arcli",
  description: "Define the customer, problem, and buying signals Arcli should match.",
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

  const [serviceProfile, crawlJob] = await Promise.all([
    fetchServiceProfile(supabase, tenantId, websiteUrl),
    fetchLatestCrawlJob(supabase, tenantId, websiteUrl),
  ]);
  const isActive = serviceProfile.embeddingStatus === "completed";

  return (
    <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-3 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Discovery setup"
        title="Matching brief"
        description="Set the buyer, problem, and signals that make a conversation worth your attention."
        icon={Target}
        visual={
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Match state
            </p>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: isActive ? C.green : C.blue }}>
              {isActive ? "Active" : "Updating"}
            </p>
            <p className="mt-1 text-[11px] leading-5" style={{ color: C.muted }}>
              {isActive
                ? "This brief is shaping the signals in Prospects."
                : "Your last active brief remains in use while this one refreshes."}
            </p>
          </div>
        }
      />

      <MatchingBriefGuide />

      <Card className="rounded-xl bg-white shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="border-b p-3" style={{ borderColor: C.rule }}>
          <CardTitle className="pfd text-xl leading-none" style={{ color: C.navy }}>
            Your matching brief
          </CardTitle>
          <p className="text-xs leading-5" style={{ color: C.muted }}>
            Shape how Arcli recognises a high-quality prospect.
          </p>
        </CardHeader>
        <CardContent className="p-3 pt-4">
          <ServiceProfileSettings
            serviceProfile={serviceProfile}
            crawlJob={crawlJob}
            websiteUrl={websiteUrl}
            layout="progressive"
            startWebsiteDemandScan={startWebsiteDemandScan}
          />
        </CardContent>
      </Card>
    </div>
  );
}
