import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { assistedProspectPilotEnrolled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchTenantWebsiteUrl } from "./dashboard/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  // app/(dashboard)/error.tsx renders inside this layout, so it can't catch a
  // failure here. A failed website read goes to the /error page instead of
  // looking like a workspace that still needs onboarding.
  const [websiteUrl, entitlements, assistedPilot, userResult] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId).catch(() => undefined),
    getWorkspaceEntitlements(supabase, tenantId),
    assistedProspectPilotEnrolled(supabase, tenantId),
    supabase.auth.getUser(),
  ]);

  if (websiteUrl === undefined) {
    redirect("/error");
  }

  if (!websiteUrl) {
    redirect("/onboarding/workspace");
  }

  const user = userResult.data.user;
  const profileName = user?.user_metadata?.full_name;
  const userName = typeof profileName === "string" && profileName.trim()
    ? profileName.trim()
    : user?.email?.split("@")[0] || "You";

  // Hydration guard: if React has to wait for a client component's chunk
  // mid-hydration, it can lose that component's position in a list of
  // siblings, which shifts every useId below it (Radix aria-controls then
  // stops matching the server HTML). Next renders this layout inside such a
  // list, so the keyed Fragment (kept as-is in the RSC payload) holds that
  // position and DashboardShell stays an only child. Keep siblings such as
  // the Toaster inside DashboardShell.
  return (
    <Fragment key="dashboard-shell">
      <DashboardShell
        userName={userName}
        userEmail={user?.email ?? ""}
        entitlements={entitlements}
        assistedPilot={assistedPilot}
      >{children}</DashboardShell>
    </Fragment>
  );
}
