import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
import { assistedProspectPilotEnrolled, assistedProspectPilotEnabled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";

import { fetchServiceProfile, fetchTenantWebsiteUrl } from "../data";
import { fetchTargetingBrief } from "../targets/data";
import { fetchAssistedProspects, type AssistedProspect } from "./data";
import { VerdictForm } from "./verdict-form";

export const metadata: Metadata = {
  title: "Today's prospects | Arcli",
  description: "Review prospect recommendations, source evidence, and a useful next step.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

const tierLabels: Record<AssistedProspect["tier"], string> = {
  direct_intent: "Buyer-intent signal",
  timely: "Timely prospect",
  high_fit: "High-fit prospect",
};
function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function ProspectCard({ prospect }: { prospect: AssistedProspect }) {
  const name = prospect.entity_title || new URL(prospect.entity_url).hostname;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tierLabels[prospect.tier]}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{name}</h2>
          <p className="text-xs text-slate-500">Delivered {readableDate(prospect.delivered_at)} · {prospect.entity_kind}</p>
        </div>
        <a href={prospect.entity_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
          View prospect <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Why this prospect</h3>
          <p className="mt-1 text-sm text-slate-700">{prospect.fit_summary}</p>
          <p className="mt-2 text-xs text-slate-600">Likely buyer role: {prospect.buyer_role}</p>
          <a href={prospect.fit_source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-700 hover:underline">Fit source ↗</a>
          <p className="mt-1 text-xs text-slate-500">Source checked {readableDate(prospect.source_checked_at)}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Suggested approach</h3>
          <p className="mt-1 text-sm text-slate-700">{prospect.angle}</p>
          <a href={prospect.contact_route_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-700 hover:underline">Open {prospect.contact_route_type.replaceAll("_", " ")} ↗</a>
          <p className="mt-1 text-xs text-slate-500">Route checked {readableDate(prospect.route_checked_at)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {prospect.signal_summary && prospect.signal_source_url ? (
          <>
            <span className="font-semibold">Observed signal:</span> {prospect.signal_summary}{" "}
            <a href={prospect.signal_source_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Source ↗</a>
            {prospect.signal_date ? <span className="ml-2 text-xs text-slate-500">{readableDate(prospect.signal_date)}</span> : null}
          </>
        ) : "No recent buying signal observed. This is a fit-based prospect, not evidence of active buying intent."}
      </div>
      <p className="mt-3 text-xs text-slate-600"><span className="font-semibold">Still unknown:</span> {prospect.uncertainty_summary}</p>

      <VerdictForm deliveryId={prospect.id} currentVerdict={prospect.my_verdict} />
    </article>
  );
}

export default async function TodayPage() {
  if (!assistedProspectPilotEnabled()) notFound();
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202: redirect("/onboarding/workspace");
      case 401: redirect("/login?next=/dashboard/today");
      case 403: redirect("/unauthorized");
      default: redirect("/error");
    }
  }
  const { supabase, tenantId } = tenantResult.context;
  const [websiteUrl, enrolled] = await Promise.all([
    fetchTenantWebsiteUrl(supabase, tenantId),
    assistedProspectPilotEnrolled(supabase, tenantId),
  ]);
  if (!websiteUrl) redirect("/onboarding/workspace");
  if (!enrolled) notFound();

  const serviceProfile = await fetchServiceProfile(supabase, tenantId, websiteUrl);
  const brief = await fetchTargetingBrief(supabase, tenantId, serviceProfile.id);
  const prospects = brief.id && brief.hasBrief
    ? await fetchAssistedProspects(supabase, brief.id)
    : [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentProspects = prospects.filter((prospect) =>
    Date.parse(prospect.delivered_at) >= sevenDaysAgo,
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-4 overflow-y-auto pr-1">
      <DashboardPageIntro
        eyebrow="Assisted prospect pilot"
        title="Today's prospects"
        description="Reviewed accounts with cited fit, an honest signal tier, and a route you can use."
        icon={ClipboardCheck}
      />
      {!brief.hasBrief ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          Approve your <Link href="/dashboard/brief" className="font-medium text-blue-700 underline">targeting brief</Link> before we deliver prospects.
        </div>
      ) : prospects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          No reviewed prospects have been delivered for this targeting brief yet. We will show each one here after it passes review.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <strong className="text-lg text-slate-950">{recentProspects.length}</strong> delivered in the last 7 days
            <span className="ml-2 text-xs text-slate-500">
              {recentProspects.filter((prospect) => prospect.tier === "direct_intent").length} buyer intent ·{" "}
              {recentProspects.filter((prospect) => prospect.tier === "timely").length} timely ·{" "}
              {recentProspects.filter((prospect) => prospect.tier === "high_fit").length} high fit
            </span>
          </div>
          <p className="text-sm text-slate-600">{prospects.length} currently reviewable prospect{prospects.length === 1 ? "" : "s"} in this brief · your feedback helps us improve the next delivery.</p>
          {prospects.map((prospect) => <ProspectCard key={prospect.id} prospect={prospect} />)}
        </div>
      )}
    </div>
  );
}
