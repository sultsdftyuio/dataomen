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
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        title="Your buyers"
        icon={Target}
        visual={
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Match state
            </p>
            <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <p className="text-xs font-semibold" style={{ color: C.navy }}>
                {isActive ? "Ready now" : "Getting ready"}
              </p>
              <p className="mt-1 text-[11px] leading-5" style={{ color: C.muted }}>
                {isActive
                  ? "Arcli is using these instructions to check public conversations."
                  : "Your current rules stay in place until the refreshed brief is ready."}
              </p>
            </div>
            <p className="mt-2 text-[10px] leading-4" style={{ color: C.muted }}>
              Clear buyer language improves discovery without lowering the quality gate.
            </p>
          </div>
        }
      />

      <section aria-label="Brief tips" className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-white p-3 shadow-sm" style={{ borderColor: C.rule }}>
          <Globe2 className="size-3.5" style={{ color: C.blue }} aria-hidden="true" />
          <h2 className="mt-2 text-xs font-semibold" style={{ color: C.navy }}>
            Website details
          </h2>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            The crawl gives Arcli a starting point. Add details when the site does
            not fully explain who should buy or why they would act now.
          </p>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-sm" style={{ borderColor: C.rule }}>
          <ClipboardPenLine className="size-3.5" style={{ color: C.blue }} aria-hidden="true" />
          <h2 className="mt-2 text-xs font-semibold" style={{ color: C.navy }}>
            Buyer wording
          </h2>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Phrase the problem as someone would ask for help: the work they are
            stuck doing, the outcome they need, or the change that prompted a search.
          </p>
        </div>
      </section>

      <Card className="rounded-md bg-white shadow-sm" style={{ borderColor: C.rule }}>
        <CardHeader className="border-b p-3" style={{ borderColor: C.rule }}>
          <CardTitle className="text-xs font-semibold" style={{ color: C.navy }}>
            Edit brief
          </CardTitle>
          <p className="text-xs leading-5" style={{ color: C.muted }}>
            Saving changes refreshes matching embeddings in the background. Your
            current rules remain active until the refreshed brief is ready.
          </p>
        </CardHeader>
        <CardContent className="p-3 pt-4">
          <ServiceProfileSettings
            serviceProfile={serviceProfile}
            websiteUrl={websiteUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
