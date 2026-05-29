import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveTenantContext } from "@/utils/supabase/tenant";

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
      return (
        <main className="min-h-screen flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
              Workspace provisioning
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-slate-950">
              Finalizing your Arcli workspace
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Your account is authenticated, but the tenant mapping is still being created.
              This usually finishes within a few hundred milliseconds.
            </p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              You can stay on this page while the provisioning completes, then refresh or
              continue to the dashboard.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Continue to dashboard
              </a>
              <a
                href="/onboarding/workspace"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                Refresh status
              </a>
            </div>
          </div>
        </main>
      );
    }

    redirect("/error");
  }

  redirect("/dashboard");
}