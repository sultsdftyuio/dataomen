import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { assistedProspectPilotEnrolled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchTenantWebsiteUrl } from "./dashboard/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    const status = tenantResult.response.status;

    if (status === 401) {
      redirect("/login?next=/dashboard");
    }

    if (status === 403) {
      redirect("/unauthorized");
    }

    if (status === 202) {
      redirect("/onboarding/workspace");
    }

    redirect("/error");
  }

  const { supabase, tenantId } = tenantResult.context;
  const [websiteUrl, entitlements, assistedPilot, userResult] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId),
    getWorkspaceEntitlements(supabase, tenantId),
    assistedProspectPilotEnrolled(supabase, tenantId),
    supabase.auth.getUser(),
  ]);

  if (!websiteUrl) {
    redirect("/onboarding/workspace");
  }

  const user = userResult.data.user;
  const profileName = user?.user_metadata?.full_name;
  const userName = typeof profileName === "string" && profileName.trim()
    ? profileName.trim()
    : user?.email?.split("@")[0] || "You";

  return (
    <DashboardShell
      userName={userName}
      userEmail={user?.email ?? ""}
      entitlements={entitlements}
      assistedPilot={assistedPilot}
    >{children}</DashboardShell>
  );
}
