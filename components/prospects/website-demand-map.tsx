"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Compass, Radar } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import { C } from "@/lib/tokens";

type WebsiteDemandMapProps = {
  suggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: (suggestionId: string) => Promise<{
    ok: boolean;
    message: string;
  }>;
};

/**
 * The first result from a website is a set of evidence-backed directions, not
 * an invented lead list. Activating a direction delegates to the existing
 * tenant-scoped Buyer Groups/Watchlist pipeline.
 */
export function WebsiteDemandMap({
  suggestions,
  activateBuyerGroup,
}: WebsiteDemandMapProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  const activate = (suggestionId: string) => {
    setNotice(null);
    setPendingId(suggestionId);
    startTransition(async () => {
      try {
        const result = await activateBuyerGroup(suggestionId);
        setNotice(result.message);
        if (result.ok) router.refresh();
      } catch {
        setNotice("We could not start a focused buyer-group scan. Please try again.");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <section
      aria-labelledby="website-demand-map-heading"
      className="shrink-0 overflow-hidden rounded-lg border"
      style={{ borderColor: C.blueLight, backgroundColor: C.white }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-5" style={{ borderColor: C.rule }}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: C.blueTint, color: C.blue }}
          >
            <Compass className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
              Website demand map
            </p>
            <h2 id="website-demand-map-heading" className="mt-0.5 text-sm font-semibold" style={{ color: C.navy }}>
              Start with a focused buyer direction
            </h2>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-4" style={{ color: C.navySoft }}>
              These are hypotheses, not leads. Test one against public conversations.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/watchlists"
          className="rounded-sm text-[11px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
          style={{ color: C.blue }}
        >
          Manage buyer groups
        </Link>
      </div>

      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3" style={{ borderColor: C.rule }}>
        {suggestions.map((suggestion) => {
          const isActivating = pendingId === suggestion.id;
          return (
            <article key={suggestion.id} className="min-w-0 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                    Website-derived hypothesis
                  </p>
                  <h3 className="mt-0.5 truncate text-sm font-semibold leading-5" title={suggestion.name} style={{ color: C.navy }}>
                    {suggestion.name}
                  </h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 bg-[#1B6EBF] px-2.5 text-[11px] text-white hover:bg-[#155a9f]"
                  disabled={isPending || pendingId !== null}
                  onClick={() => activate(suggestion.id)}
                >
                  <Radar className="size-3" aria-hidden="true" />
                  {isActivating ? "Starting..." : "Start focused scan"}
                </Button>
              </div>

              <p className="mt-1.5 truncate text-[11px] leading-4" title={suggestion.targetBuyer} style={{ color: C.navySoft }}>
                <span className="font-semibold" style={{ color: C.muted }}>Audience: </span>
                {suggestion.targetBuyer}
              </p>
              <p className="mt-0.5 truncate text-[11px] leading-4" title={suggestion.problemToSolve} style={{ color: C.navySoft }}>
                <span className="font-semibold" style={{ color: C.muted }}>Tests: </span>
                {suggestion.problemToSolve}
              </p>
            </article>
          );
        })}
      </div>

      {notice ? (
        <p className="border-t px-4 py-2.5 text-xs leading-5" role="status" style={{ borderColor: C.rule, color: C.navySoft }}>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
