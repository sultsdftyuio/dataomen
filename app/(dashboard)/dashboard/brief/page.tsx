import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardPenLine, Globe2, Target } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceProfileSettings } from "@/components/settings/workspace_page/service-profile-settings";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchServiceProfile, fetchTenantWebsiteUrl } from "../data";

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

  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const isActive = serviceProfile.embeddingStatus === "completed";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <DashboardPageIntro
        eyebrow="Your discovery instructions"
        title="Make your ideal customer unmistakably clear."
        description="Start with your website, then add the buyer, their real-world problem, and the events that make a solution feel urgent."
        icon={Target}
        visual={
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: C.faint }}>
              Matching status
            </p>
            <div className="mt-4 rounded-md border p-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <p className="text-sm font-semibold" style={{ color: C.navy }}>
                {isActive ? "Your matching brief is active" : "Your matching brief is preparing"}
              </p>
              <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
                {isActive
                  ? "Arcli is using these instructions to check public conversations."
                  : "Your current rules stay in place until the refreshed brief is ready."}
              </p>
            </div>
            <p className="mt-4 text-xs leading-5" style={{ color: C.muted }}>
              Clear buyer language improves discovery without lowering the quality gate.
            </p>
          </div>
        }
      />

      <section aria-label="What makes a useful matching brief" className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 shadow-sm" style={{ borderColor: C.rule }}>
          <Globe2 className="size-4" style={{ color: C.blue }} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>
            Website context plus your expertise
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
            The crawl gives Arcli a starting point. Add details when the site does
            not fully explain who should buy or why they would act now.
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm" style={{ borderColor: C.rule }}>
          <ClipboardPenLine className="size-4" style={{ color: C.blue }} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>
            Use buyer language, not internal labels
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
            Phrase the problem as someone would ask for help: the work they are
            stuck doing, the outcome they need, or the change that prompted a search.
          </p>
        </div>
      </section>

      <Card className="rounded-xl bg-white shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="border-b" style={{ borderColor: C.rule }}>
          <CardTitle className="text-lg" style={{ color: C.navy }}>
            Edit your matching brief
          </CardTitle>
          <p className="text-sm leading-6" style={{ color: C.muted }}>
            Saving changes refreshes matching embeddings in the background. Your
            current rules remain active until the refreshed brief is ready.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <ServiceProfileSettings
            serviceProfile={serviceProfile}
            websiteUrl={websiteUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
