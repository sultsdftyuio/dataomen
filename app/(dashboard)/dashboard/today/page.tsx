import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AssistedProspectQueue } from "@/components/prospects/assisted-prospect-queue";
import { assistedProspectPilotEnrolled, assistedProspectPilotEnabled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchServiceProfile, fetchTenantWebsiteUrl } from "../data";
import { fetchTargetingBrief } from "../targets/data";
import { fetchAssistedProspects } from "./data";

export const metadata: Metadata = {
  title: "Today's prospects | Arcli",
  description: "Review prospect recommendations, source evidence, and a useful next step.",
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
    return <div className="mx-auto w-full max-w-3xl rounded-xl border border-[#DDE8F2] bg-white p-6 text-sm text-[#1E3A5F]">Approve your <Link href="/dashboard/brief" className="font-semibold text-[#1B6EBF] underline">targeting brief</Link> before we deliver prospects.</div>;
  }
  const prospects = await fetchAssistedProspects(supabase, brief.id);
  return <AssistedProspectQueue prospects={prospects} />;
}
