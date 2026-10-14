import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AssistedProspectQueue } from "@/components/prospects/assisted-prospect-queue";
import { assistedProspectPilotEnrolled, assistedProspectPilotEnabled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchServiceProfile, fetchTenantWebsiteUrl } from "../data";
import { fetchTargetingBrief } from "../targets/data";
import { BriefGate } from "./brief-gate";
import { fetchAssistedProspects } from "./data";

export const metadata: Metadata = {
  title: "Today's prospects | Arcli",
  description: "Review hand-checked prospects, their evidence and a way to reach them.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodayPage() {
  if (!assistedProspectPilotEnabled()) notFound();
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202: redirect("/onboarding/workspace");
      case 401: redirect("/login?next=/dashboard/today");
      case 403: redirect("/unauthorized");
      default: redirect("/error");
    }
  }
  const { supabase, tenantId } = tenantResult.context;
  const [websiteUrl, enrolled] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId),
    assistedProspectPilotEnrolled(supabase, tenantId),
  ]);
  if (!websiteUrl) redirect("/onboarding/workspace");
  if (!enrolled) notFound();

  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const brief = await fetchTargetingBrief(supabase, tenantId, serviceProfile.id);
  if (!brief.id || !brief.hasBrief) {
    return <BriefGate />;
  }
  const prospects = await fetchAssistedProspects(supabase, brief.id);
  return <AssistedProspectQueue prospects={prospects} />;
}
