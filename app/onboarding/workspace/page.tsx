import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkspaceProvisioningPanel } from "@/components/onboarding/workspace-provisioning-panel";
import { normalizeWebsite } from "@/lib/website-url";
import type { ResultEmailOffer } from "@/components/onboarding/result-email-prompt";
import {
  fetchLatestCrawlJob,
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "@/app/(dashboard)/dashboard/data";
import { resultEmailsEnabled } from "@/lib/result-email-preference";
import { fetchCrawlPageSummaries } from "@/lib/onboarding/crawl-pages";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Website setup | Arcli",
  description: "Connect your website and approve the prospect intelligence profile.",
};

export default async function WorkspaceOnboardingPage({ searchParams }: { searchParams: Promise<{ website?: string; edit?: string }> }) {
  const { website, edit } = await searchParams;
  const suggestedWebsiteUrl = normalizeWebsite(website ?? "");
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    if (status === 401) {
      redirect("/login?next=/onboarding/workspace");
    }

    if (status === 202) {
      return <WorkspaceProvisioningPanel workspacePending initialWebsiteUrl={suggestedWebsiteUrl} />;
    }

    redirect("/error");
  }

  const { supabase, tenantId, userId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);

  if (websiteUrl && edit !== "1") {
    redirect("/onboarding/discovery");
  }

  const [account, membership, preference, crawlJob, serviceProfile] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("crawl_notification_preferences")
      .select("enabled,opted_in_at,opted_in_email,notice_version")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),
    websiteUrl ? fetchLatestCrawlJob(supabase, tenantId, websiteUrl) : Promise.resolve(null),
    websiteUrl ? fetchServiceProfile(supabase, tenantId, websiteUrl) : Promise.resolve(null),
  ]);
  const crawledPages = await fetchCrawlPageSummaries(supabase, tenantId, crawlJob?.id);
  const user = account.data.user;
  const email = user?.id === userId ? user.email ?? null : null;
  let resultEmailOffer: ResultEmailOffer = { status: "unavailable", email };
  if (email && !membership.error && membership.data && !preference.error) {
    const eligible = ["owner", "admin"].includes(
      membership.data.role?.toLowerCase() ?? "",
    );
    resultEmailOffer = {
      status: !eligible
        ? "ineligible"
        : resultEmailsEnabled(preference.data, email)
          ? "on"
          : "off",
      email,
    };
  }

  return (
    <WorkspaceProvisioningPanel
      initialWebsiteUrl={websiteUrl ?? suggestedWebsiteUrl}
      crawlJob={crawlJob}
      crawledPages={crawledPages}
      serviceProfile={serviceProfile ?? undefined}
      initialResultEmailOffer={resultEmailOffer}
    />
  );
}
