import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkspaceProvisioningPanel } from "@/components/onboarding/workspace-provisioning-panel";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace setup | Arcli",
  description: "Finalizing your workspace provisioning.",
};

export default async function WorkspaceOnboardingPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    if (status === 401) {
      redirect("/login?next=/onboarding/workspace");
    }

    if (status === 400) {
      return <WorkspaceProvisioningPanel />;
    }

    redirect("/error");
  }

  redirect("/dashboard");
}