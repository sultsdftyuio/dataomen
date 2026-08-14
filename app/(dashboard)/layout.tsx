import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation";
import { WorkspaceTopNav } from "@/components/dashboard/WorkspaceTopNav";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import Logo from "@/components/ui/logo";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { fetchTenantWebsiteUrl } from "./dashboard/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
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
  const [websiteUrl, entitlements] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId),
    getWorkspaceEntitlements(supabase, tenantId),
  ]);

  if (!websiteUrl) {
    redirect("/onboarding/workspace");
  }

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden font-sans"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <header
        className="sticky top-0 z-50 border-b bg-white shadow-sm"
        style={{ borderColor: C.rule }}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center">
              <Link
                href="/dashboard"
                className="flex items-center transition-opacity hover:opacity-90"
              >
                <Logo className="h-7" iconOnly={false} />
              </Link>

              <WorkspaceTopNav />
            </div>
            <div className="hidden min-w-0 items-center border-l pl-3 md:flex" style={{ borderColor: C.rule }}>
              <DashboardNavigation isPro={entitlements.isPro} />
            </div>
          </div>

        </div>
      </header>

      <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-3 animate-in fade-in duration-300 sm:p-4">
        {children}
      </main>

      <div
        className="shrink-0 border-t bg-white md:hidden"
        style={{ borderColor: C.rule }}
      >
        <DashboardNavigation compact isPro={entitlements.isPro} />
      </div>
    </div>
  );
}
