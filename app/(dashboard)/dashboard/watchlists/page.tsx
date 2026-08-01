import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, Globe2, Radar, UsersRound } from "lucide-react";

import { DashboardPageIntro } from "@/components/dashboard/DashboardPageIntro";
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
  const activeWatchlistCount = watchlists.filter((watchlist) => watchlist.isActive).length;
  const sourceCount = new Set(
    watchlists.flatMap((watchlist) => watchlist.sourcePreferences),
  ).size;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <DashboardPageIntro
        eyebrow="Focused discovery"
        title="Find the people most likely to need your help."
        description="Give each audience its own problem statement, natural wording, and public sources. Your product brief stays intact while every buyer group becomes more specific."
        icon={UsersRound}
        visual={
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: C.faint }}>
              Discovery coverage
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3" style={{ borderColor: C.rule }}>
                <p className="text-2xl font-semibold" style={{ color: C.navy }}>{activeWatchlistCount}</p>
                <p className="mt-1 text-xs font-medium" style={{ color: C.muted }}>Active buyer groups</p>
              </div>
              <div className="rounded-md border p-3" style={{ borderColor: C.rule }}>
                <p className="text-2xl font-semibold" style={{ color: C.navy }}>{sourceCount}</p>
                <p className="mt-1 text-xs font-medium" style={{ color: C.muted }}>Selected sources</p>
              </div>
            </div>
            <p className="mt-4 border-t pt-4 text-sm leading-6" style={{ borderColor: C.rule, color: C.muted }}>
              New groups start with public sources. X remains an optional,
              cost-controlled fallback.
            </p>
          </div>
        }
      />

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
