import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, MessageSquareText } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { Card, CardContent } from "@/components/ui/card";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { requestBuyerLanguageResearch } from "../actions";
import {
  fetchBuyerDemandReport,
  fetchBuyerLanguageResearch,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  verifierScoreThreshold,
} from "../data";
import {
  BuyerDemandPatterns,
  BuyerLanguageResearch,
} from "../prospect-dashboard-client";

export const metadata: Metadata = {
  title: "Buyer Language Library | Arcli",
  description: "Review buyer language and recurring themes from accepted evidence.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResearchPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard/research");
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

  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const threshold = verifierScoreThreshold();
  const [buyerDemandReport, buyerLanguageResearch] = await Promise.all([
    fetchBuyerDemandReport(supabase, tenantId, serviceProfile.id, threshold),
    fetchBuyerLanguageResearch(supabase, tenantId, serviceProfile.id),
  ]);
  const sourceCount = new Set(
    buyerLanguageResearch.evidence.map((item) => item.source),
  ).size;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Research, not prospects"
        title="Buyer language library"
        description="Keep the exact words buyers use close at hand, then use them to make your matching brief sharper."
        icon={MessageSquareText}
        visual={
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Library at a glance
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-5 rounded-md border p-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <div>
                <p className="text-lg font-bold tracking-tight" style={{ color: C.navy }}>
                  {buyerLanguageResearch.evidence.length}
                </p>
                <p className="mt-1 text-[10px] font-medium" style={{ color: C.navySoft }}>
                  saved phrase{buyerLanguageResearch.evidence.length === 1 ? "" : "s"}
                </p>
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight" style={{ color: C.navy }}>
                  {sourceCount}
                </p>
                <p className="mt-1 text-[10px] font-medium" style={{ color: C.navySoft }}>
                  source{sourceCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>
        }
      />

      {buyerDemandReport?.isTerminal ? (
        <BuyerDemandPatterns report={buyerDemandReport} />
      ) : (
        <Card className="rounded-md bg-white shadow-none" style={{ borderColor: C.rule }}>
          <CardContent className="flex gap-2 p-3">
            <BarChart3 className="mt-0.5 size-3.5 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <div>
              <h2 className="font-serif text-xl leading-none" style={{ color: C.navy }}>
                What repeats, later
              </h2>
              <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                A recurring theme needs at least two verifier-confirmed, ready-to-act
                matches in this workspace before it is shown here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <BuyerLanguageResearch
        research={buyerLanguageResearch}
        requestBuyerLanguageResearch={requestBuyerLanguageResearch}
        layout="library"
      />
    </div>
  );
}
