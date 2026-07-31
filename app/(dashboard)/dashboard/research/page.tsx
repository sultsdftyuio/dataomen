import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, MessageSquareText } from "lucide-react";

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
  title: "Buyer Research | Arcli",
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section
        className="overflow-hidden rounded-xl border shadow-sm"
        style={{ borderColor: C.navyMid, backgroundColor: C.navy }}
      >
        <div className="px-5 py-6 sm:px-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.blueLight }}>
            Evidence-backed learning
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Buyer research
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.faint }}>
            Use accepted public evidence to sharpen your wording. These are
            insights for your matching brief, not a second lead queue.
          </p>
        </div>
      </section>

      {buyerDemandReport?.isTerminal ? (
        <BuyerDemandPatterns report={buyerDemandReport} />
      ) : (
        <Card className="rounded-lg bg-white shadow-sm" style={{ borderColor: C.rule }}>
          <CardContent className="flex gap-3 p-4">
            <BarChart3 className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: C.navy }}>
                Themes will appear after accepted matches accumulate
              </h2>
              <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
                A recurring theme needs at least two verifier-confirmed, ready-to-act
                matches in this workspace before it is shown here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: C.rule }}>
        <div className="mb-5 flex items-center gap-2">
          <MessageSquareText className="size-4" style={{ color: C.blue }} aria-hidden="true" />
          <span className="text-sm font-semibold" style={{ color: C.navy }}>
            Language from accepted evidence
          </span>
        </div>
        <BuyerLanguageResearch
          research={buyerLanguageResearch}
          requestBuyerLanguageResearch={requestBuyerLanguageResearch}
        />
      </div>
    </div>
  );
}
