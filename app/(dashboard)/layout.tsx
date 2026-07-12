import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Settings } from "lucide-react";

import { WorkspaceTopNav } from "@/components/dashboard/WorkspaceTopNav";
import Logo from "@/components/ui/logo";
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
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] font-sans text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex h-14 w-full items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center">
              <Link
                href="/dashboard"
                className="flex items-center transition-opacity hover:opacity-90"
              >
                <Logo className="h-7" iconOnly={false} />
              </Link>

              <WorkspaceTopNav />
            </div>

            <nav className="ml-4 hidden items-center gap-1 md:flex">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-slate-400" />
                Overview
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="System Preferences"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full flex-1 flex-col p-4 animate-in fade-in duration-500 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
