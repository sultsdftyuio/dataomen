"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createOutcome,
  thrownOutcome,
  type ActionOutcome,
} from "@/app/(dashboard)/dashboard/watchlists/action-outcome";
import { OutcomeNotice } from "@/app/(dashboard)/dashboard/watchlists/outcome-notice";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import { cn } from "@/lib/utils";

type WebsiteDemandMapProps = {
  suggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: (suggestionId: string) => Promise<{
    ok: boolean;
    message: string;
  }>;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

function sameText(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

/**
 * The first result from a website is a set of evidence-backed directions, not
 * an invented lead list. Activating a direction creates a buyer group through
 * the existing tenant-scoped pipeline and starts its first scan.
 */
export function WebsiteDemandMap({
  suggestions,
  activateBuyerGroup,
  collapsible = false,
  defaultExpanded = true,
}: WebsiteDemandMapProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [expandedDefault, setExpandedDefault] = useState(defaultExpanded);
  const [isPending, startTransition] = useTransition();

  // Open suggestions during an empty first scan, then give new signals room
  // when results arrive. Manual toggles remain intact while that state holds.
  if (expandedDefault !== defaultExpanded) {
    setExpandedDefault(defaultExpanded);
    setIsExpanded(defaultExpanded);
  }

  if (suggestions.length === 0) return null;

  // Website profiles often describe one problem for several audiences. Say it
  // once rather than repeating the same paragraph on every suggestion.
  const sharedProblem =
    suggestions.length > 1 &&
    suggestions.every((suggestion) => sameText(suggestion.problemToSolve, suggestions[0].problemToSolve))
      ? suggestions[0].problemToSolve
      : null;

  const activate = (suggestionId: string) => {
    setOutcome(null);
    setPendingId(suggestionId);
    startTransition(async () => {
      try {
        const result = await activateBuyerGroup(suggestionId);
        const next = createOutcome(result);
        setOutcome(next);
        if (result.ok) {
          // The new group may replace this panel's position on the page, so
          // the confirmation also goes to a toast that survives the refresh.
          toast({ title: next.title, description: next.description });
          router.refresh();
        }
      } catch {
        setOutcome(thrownOutcome("Couldn't save the buyer group"));
      } finally {
        setPendingId(null);
      }
    });
  };

  const suggestionList = (
    <div className="px-4 pb-4 md:px-5">
      {sharedProblem ? (
        <p className="pb-3 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">Problem they share: </span>
          {sharedProblem}
        </p>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {suggestions.map((suggestion) => {
          const isActivating = pendingId === suggestion.id;
          const showAudience = !sameText(suggestion.name, suggestion.targetBuyer);
          return (
            <li key={suggestion.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm leading-6 font-semibold text-foreground">{suggestion.name}</h3>
                {showAudience ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">Audience: </span>
                    {suggestion.targetBuyer}
                  </p>
                ) : null}
                {sharedProblem ? null : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">Problem: </span>
                    {suggestion.problemToSolve}
                  </p>
                )}
                <p className="text-xs leading-5 text-subtle">
                  Sources: {suggestion.communityPlan.sources.map((source) => source.label).join(", ")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start md:shrink-0"
                disabled={isPending || pendingId !== null}
                aria-busy={isActivating}
                onClick={() => activate(suggestion.id)}
              >
                {isActivating ? "Creating…" : "Create group and scan"}
              </Button>
            </li>
          );
        })}
      </ul>
      {outcome ? <OutcomeNotice outcome={outcome} className="mt-3" /> : null}
    </div>
  );

  if (collapsible) {
    return (
      <section
        aria-labelledby="website-demand-map-heading"
        className="shrink-0 overflow-hidden rounded-lg border border-border bg-card"
      >
        <h2 id="website-demand-map-heading">
          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5"
            aria-expanded={isExpanded}
            aria-controls="website-demand-map-suggestions"
            onClick={() => setIsExpanded((current) => !current)}
          >
            <span className="min-w-0">
              <span className="block text-base leading-6 font-semibold text-foreground">
                Suggested buyer groups ({suggestions.length})
              </span>
              <span className="block text-sm leading-5 font-normal text-muted-foreground">
                Audiences to test, based on your website.
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-subtle", isExpanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </h2>
        {isExpanded ? (
          <div id="website-demand-map-suggestions">{suggestionList}</div>
        ) : outcome ? (
          <div className="px-4 pb-4 md:px-5">
            <OutcomeNotice outcome={outcome} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="website-demand-map-heading"
      className="shrink-0 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 id="website-demand-map-heading" className="text-base leading-6 font-semibold text-foreground">
            Start with a focused buyer group
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            These are hypotheses, not buyer signals. Test one against public conversations.
          </p>
        </div>
        <Link
          href="/dashboard/watchlists"
          className="inline-flex min-h-10 items-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
        >
          Manage buyer groups
        </Link>
      </div>
      {suggestionList}
    </section>
  );
}
