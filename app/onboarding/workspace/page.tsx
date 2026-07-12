import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkspaceProvisioningPanel } from "@/components/onboarding/workspace-provisioning-panel";
import { fetchTenantWebsiteUrl } from "@/app/(dashboard)/dashboard/data";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Workspace setup | Arcli",
  description: "Connect your website and approve the prospect intelligence profile.",
};

export default async function WorkspaceOnboardingPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    if (status === 401) {
      redirect("/login?next=/onboarding/workspace");
    }

    if (status === 202) {
      return <WorkspaceProvisioningPanel workspacePending />;
    }

    redirect("/error");
  }

  const { supabase, tenantId } = tenantResult.context;
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);

  if (websiteUrl) {
    redirect("/dashboard");
  }

  return <WorkspaceProvisioningPanel initialWebsiteUrl={websiteUrl} />;
}
