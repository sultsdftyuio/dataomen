"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Compass, Radar } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import { C } from "@/lib/tokens";
import "./website-demand-map.css";

type WebsiteDemandMapProps = {
  suggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: (suggestionId: string) => Promise<{
    ok: boolean;
    message: string;
  }>;
  collapsible?: boolean;
};

/**
 * The first result from a website is a set of evidence-backed directions, not
 * an invented lead list. Activating a direction delegates to the existing
 * tenant-scoped Buyer Groups/Watchlist pipeline.
 */
export function WebsiteDemandMap({
  suggestions,
  activateBuyerGroup,
  collapsible = false,
}: WebsiteDemandMapProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
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

  const suggestionCards = (
    <div className="arc-buyer-suggestions">
      {suggestions.map((suggestion) => {
        const isActivating = pendingId === suggestion.id;
        return (
          <article key={suggestion.id} className="arc-buyer-suggestions__card">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                  SUGGESTED DIRECTION
                </p>
                <h3 className="mt-1 text-sm font-semibold leading-5" title={suggestion.name} style={{ color: C.navy }}>
                  {suggestion.name}
                </h3>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 border-[#B8D8EE] bg-white px-2.5 text-[11px] text-[#1B6EBF] hover:bg-[#F0F7FD]"
                disabled={isPending || pendingId !== null}
                aria-busy={isActivating}
                onClick={() => activate(suggestion.id)}
              >
                <Radar className="size-3" aria-hidden="true" />
                {isActivating ? "Starting..." : "Start scan"}
              </Button>
            </div>

            <p className="mt-1.5 truncate text-[11px] leading-4" title={suggestion.targetBuyer} style={{ color: C.navySoft }}>
              <span className="font-semibold" style={{ color: C.muted }}>Audience: </span>
              {suggestion.targetBuyer}
            </p>
            <p className="mt-1 text-[11px] leading-4" title={suggestion.problemToSolve} style={{ color: C.navySoft }}>
              <span className="font-semibold" style={{ color: C.muted }}>Tests: </span>
              {suggestion.problemToSolve}
            </p>
            <p className="mt-2 text-[11px] leading-4" style={{ color: C.navySoft }}>
              <span className="font-semibold" style={{ color: C.muted }}>Starts in: </span>
              {suggestion.communityPlan.sources.map((source) => source.label).join(" · ")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {suggestion.communityPlan.sources.slice(0, 3).flatMap((source) => source.queryTerms.slice(0, 1)).map((term) => (
                <span
                  key={term.toLowerCase()}
                  title={term}
                  className="max-w-full truncate rounded border px-1.5 py-0.5 text-[10px]"
                  style={{ borderColor: C.rule, color: C.muted }}
                >
                  {term}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );

  const activationNotice = notice ? (
    <p className="border-t px-4 py-2.5 text-xs leading-5" role="status" style={{ borderColor: C.rule, color: C.navySoft }}>
      {notice}
    </p>
  ) : null;

  if (collapsible) {
    return (
      <section
        aria-labelledby="website-demand-map-heading"
        className="arc-buyer-suggestions__section shrink-0 overflow-hidden rounded-xl border"
        style={{ borderColor: C.ruleDark, backgroundColor: C.white }}
      >
        <button
          type="button"
          className="flex w-full flex-col gap-3 p-3 text-left transition-colors hover:bg-[#F8FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-4 lg:flex-row lg:items-center lg:justify-between"
          aria-label="Buyer groups from your website"
          aria-expanded={isExpanded}
          aria-controls="website-demand-map-suggestions"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: C.blueTint, color: C.blue }}
            >
              <Compass className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="website-demand-map-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
                Suggested from your website
              </h2>
              <p className="text-[11px]" style={{ color: C.muted }}>
                Starting audiences worth testing against public conversations.
              </p>
            </div>
          </div>

          <ChevronDown
            className={isExpanded ? "size-4 shrink-0 rotate-180" : "size-4 shrink-0"}
            style={{ color: C.muted }}
            aria-hidden="true"
          />
        </button>
        {isExpanded ? (
          <div id="website-demand-map-suggestions" className="border-t" style={{ borderColor: C.rule }}>
            {suggestionCards}
            {activationNotice}
          </div>
        ) : activationNotice}
      </section>
    );
  }

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
      {suggestionCards}
      {activationNotice}
    </section>
  );
}
