import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

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
        eyebrow="The matching thesis"
        title="Prospect desk brief"
        description="Set the buyer, problem, and signals that make a conversation worth your attention."
        icon={Target}
        visual={
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Match state
            </p>
            <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <p className="pfd text-lg leading-none" style={{ color: C.navy }}>
                {isActive ? "Active" : "Updating"}
              </p>
              <p className="mt-1 text-[11px] leading-5" style={{ color: C.muted }}>
                {isActive
                  ? "This brief is shaping the signals on your Prospect desk."
                  : "Your last active brief remains in use while this one refreshes."}
              </p>
            </div>
          </div>
        }
      />

      <details className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: C.rule }}>
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: C.navy }}>
          How the matching brief works
        </summary>
        <p className="mt-2 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
          Start with the buyer and painful situation. Add the language people use when they need help, then use guardrails to keep weak matches out. Saving refreshes this brief in the background without interrupting the active one.
        </p>
      </details>

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
            websiteUrl={websiteUrl}
            layout="progressive"
          />
        </CardContent>
      </Card>
    </div>
  );
}
