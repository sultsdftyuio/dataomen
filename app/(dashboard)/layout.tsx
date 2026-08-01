import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation";
import { WorkspaceTopNav } from "@/components/dashboard/WorkspaceTopNav";
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
  const websiteUrl = await fetchTenantWebsiteUrl(supabase, tenantId);

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
              <DashboardNavigation />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/settings"
              className="rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ color: C.navySoft, backgroundColor: C.blueTint }}
              title="Workspace settings"
              aria-label="Workspace settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden p-4 animate-in fade-in duration-300">
        {children}
      </main>
    </div>
  );
}
