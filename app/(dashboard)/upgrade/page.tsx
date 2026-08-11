import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";

import UpgradeButton from "@/components/ui/UpgradeButton";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const metadata: Metadata = {
  title: "Upgrade to Pro | Arcli",
  description: "Unlock the full prospect desk, buyer groups, and reply drafts.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const proFeatures = [
  "Every matched conversation",
  "Fit evidence and qualification signals",
  "Reply drafts ready to refine",
  "Focused buyer groups",
];

export default async function UpgradePage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/upgrade");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);

  if (entitlements.isPro) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center overflow-y-auto py-4">
      <Link
        href="/dashboard"
        className="mb-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold transition-colors hover:text-[#1B6EBF]"
        style={{ color: C.navySoft }}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to prospects
      </Link>

      <section
        className="relative overflow-hidden rounded-2xl border px-6 py-8 shadow-sm sm:px-10 sm:py-12"
        style={{
          borderColor: C.blueLight,
          background: "linear-gradient(135deg, #F4FAFF 0%, #FFFFFF 62%, #F9FCFF 100%)",
        }}
      >
        <div
          className="absolute -right-20 -top-24 size-80 rounded-full"
          style={{ backgroundColor: "rgba(59,154,232,0.12)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 right-16 size-56 rounded-full border"
          style={{ borderColor: "rgba(27,110,191,0.12)" }}
          aria-hidden="true"
        />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div className="max-w-2xl">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ color: C.blue, backgroundColor: C.bluePale }}
            >
              <Sparkles className="size-3.5" aria-hidden="true" /> Pro prospect desk
            </div>
            <h1 className="pfd mt-4 text-4xl leading-[0.95] sm:text-5xl" style={{ color: C.navy }}>
              See the people behind the signal.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7" style={{ color: C.navySoft }}>
              Open every matched conversation with its fit evidence, qualification signal, and a reply draft ready to refine.
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Pro features">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.navy }}>
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: C.green }} aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <aside className="rounded-xl border bg-white/90 p-5 shadow-sm" style={{ borderColor: C.rule }}>
            <div className="flex items-center gap-2" style={{ color: C.blue }}>
              <LockKeyhole className="size-4" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-[0.1em]">Unlock Pro</p>
            </div>
            <p className="pfd mt-4 text-3xl leading-none" style={{ color: C.navy }}>
              $35<span className="text-lg">/month</span>
            </p>
            <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
              Cancel any time. Your current discovery setup stays in place.
            </p>
            <div className="mt-5">
              <UpgradeButton className="w-full justify-center" />
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
