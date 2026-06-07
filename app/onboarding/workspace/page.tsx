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

    // 1. Unauthenticated users are sent back to login
    if (status === 401) {
      redirect("/login?next=/onboarding/workspace");
    }

    // 2. FIX: Listen for 202 Accepted (Provisioning Pending/In-Progress)
    // The backend explicitly returns 202 for all provisioning phases.
    // This allows the Client Component to mount and begin polling safely.
    if (status === 202) {
      return <WorkspaceProvisioningPanel />;
    }

    // 3. Any other terminal error state (403, 410, 423, 500, 503) from the tenant resolver
    redirect("/error");
  }

  // 4. Success state: Tenant context is resolved and ready
  redirect("/dashboard");
}