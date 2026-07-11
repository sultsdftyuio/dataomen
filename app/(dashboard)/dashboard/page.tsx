import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  fetchQualifiedLeads,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
  verifierScoreThreshold,
} from "./data";
import ProspectDashboardClient from "./prospect-dashboard-client";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const metadata: Metadata = {
  title: "Prospect Intelligence | Arcli",
  description: "Review service profiles and qualified prospect matches.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    switch (status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const threshold = verifierScoreThreshold();

  const [websiteUrl, leads] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId),
    fetchQualifiedLeads(supabase, tenantId, threshold),
  ]);
  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);

  return (
    <ProspectDashboardClient
      initialWebsiteUrl={websiteUrl}
      serviceProfile={serviceProfile}
      leads={leads}
      verifierThreshold={threshold}
    />
  );
}
