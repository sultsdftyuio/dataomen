import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, Globe2, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { C } from "@/lib/tokens";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import {
  createWatchlist,
  runWatchlistDiscovery,
  setWatchlistActive,
} from "../actions";
import {
  fetchWatchlistResults,
  fetchWatchlists,
  verifierScoreThreshold,
} from "../data";
import WatchlistsPanel from "../watchlists-panel";

export const metadata: Metadata = {
  title: "Buyer Groups | Arcli",
  description: "Focus prospect discovery on the buyer groups that matter most.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WatchlistsPage() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    switch (tenantResult.response.status) {
      case 202:
        redirect("/onboarding/workspace");
      case 401:
        redirect("/login?next=/dashboard/watchlists");
      case 403:
        redirect("/unauthorized");
      default:
        redirect("/error");
    }
  }

  const { supabase, tenantId } = tenantResult.context;
  const threshold = verifierScoreThreshold();
  const watchlists = await fetchWatchlists(supabase, tenantId);
  const results = await fetchWatchlistResults(
    supabase,
    tenantId,
    watchlists,
    threshold,
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section
        className="overflow-hidden rounded-xl border shadow-sm"
        style={{ borderColor: C.navyMid, backgroundColor: C.navy }}
      >
        <div className="grid gap-5 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.blueLight }}>
              Focused discovery
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Buyer groups
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.faint }}>
              Give each audience its own problem statement, natural language, and
              source choices. This makes the next scan more specific without
              changing the evidence for what your product offers.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit rounded-md px-3 py-1"
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.navyMid,
              color: C.white,
            }}
          >
            <Radar className="size-3" />
            {watchlists.length} active group{watchlists.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </section>

      <section aria-label="How buyer groups work" className="grid gap-3 md:grid-cols-3">
        {[
          {
            icon: CircleCheck,
            title: "Describe a real situation",
            detail: "Use the outcome people want and the frustration they would actually describe.",
          },
          {
            icon: Globe2,
            title: "Choose public sources",
            detail: "Select the sources worth checking now; suggested communities are saved for prioritization.",
          },
          {
            icon: Radar,
            title: "Review the evidence",
            detail: "Only verifier-confirmed matches become ready to review. Plausible signals stay review-only.",
          },
        ].map(({ icon: Icon, title, detail }) => (
          <div
            key={title}
            className="rounded-lg border bg-white p-4 shadow-sm"
            style={{ borderColor: C.rule }}
          >
            <Icon className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
              {detail}
            </p>
          </div>
        ))}
      </section>

      <WatchlistsPanel
        watchlists={watchlists}
        results={results}
        createWatchlist={createWatchlist}
        runWatchlistDiscovery={runWatchlistDiscovery}
        setWatchlistActive={setWatchlistActive}
      />
    </div>
  );
}
