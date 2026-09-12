"use client";

import Link from "next/link";
import { Compass, Search } from "lucide-react";

import type { ServiceProfileFields } from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { deriveCommunitySourcePlan } from "@/lib/community-source-plan";
import type { SourceFeedbackInsight } from "@/lib/source-feedback-insights";
import { C } from "@/lib/tokens";

export function CommunitySourcePlan({
  fields,
  sourceFeedbackInsights = [],
}: {
  fields: ServiceProfileFields;
  sourceFeedbackInsights?: SourceFeedbackInsight[];
}) {
  const plan = deriveCommunitySourcePlan({
    valueProposition: fields.unique_value_prop,
    targetAudience: fields.target_audience,
    coreProblem: fields.core_problem,
    painPoints: fields.pain_points,
    useCases: fields.use_cases,
    buyingTriggers: fields.buying_triggers,
    discoveryQueries: fields.discovery_queries,
    searchTerms: fields.search_terms,
  });
  const feedbackBySource = new Map(
    sourceFeedbackInsights.map((insight) => [insight.source, insight]),
  );
  const orderedSources = [...plan.sources].sort((left, right) => {
    const sourceGroup = (source: typeof left.source) => {
      if (source === "hackernews" || source === "bluesky") return 0;
      if (feedbackBySource.get(source)?.recommendation === "promising") return 1;
      if (feedbackBySource.get(source)?.recommendation === "deprioritized") return 3;
      return 2;
    };
    return sourceGroup(left.source) - sourceGroup(right.source);
  });

  return (
    <section
      className="overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: C.rule }}
      aria-labelledby="community-source-plan-title"
    >
      <div className="border-b px-4 py-3.5" style={{ borderColor: C.rule }}>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.15em]"
          style={{ color: C.blue }}
        >
          Stage 2 · focused discovery
        </p>
        {sourceFeedbackInsights.length > 0 ? (
          <p
            className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: C.green }}
          >
            Stage 3 feedback learning
          </p>
        ) : null}
        <h2
          id="community-source-plan-title"
          className="pfd mt-1 text-2xl leading-none"
          style={{ color: C.navy }}
        >
          Community & source plan
        </h2>
        <p className="mt-2 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
          Arcli starts with public conversation environments that fit this
          product and buyer map. Technical sources are included only when the
          website itself signals technical, commerce, or open-source context.
        </p>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-2 xl:grid-cols-3">
        {orderedSources.map((entry) => (
          <article
            key={entry.source}
            className="rounded-lg border bg-background p-3"
            style={{ borderColor: C.rule }}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md"
                style={{ color: C.blue, backgroundColor: C.bluePale }}
              >
                <Compass className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: C.navy }}>
                  {entry.label}
                </h3>
                <p className="mt-0.5 text-xs leading-5" style={{ color: C.muted }}>
                  {entry.community}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5" style={{ color: C.navySoft }}>
              {entry.rationale}
            </p>

            {(() => {
              const insight = feedbackBySource.get(entry.source);
              if (!insight) return null;

              const reviewSummary = `${insight.positiveReviews} positive / ${insight.negativeReviews} off-target`;
              const copy =
                insight.recommendation === "deprioritized"
                  ? "This source has enough off-target reviews to be checked later. It still stays in every website scan."
                  : insight.recommendation === "promising"
                    ? "Human feedback supports keeping this source in your discovery plan."
                    : "More reviewer feedback is needed before this source plan changes.";
              const color =
                insight.recommendation === "deprioritized"
                  ? C.red
                  : insight.recommendation === "promising"
                    ? C.green
                    : C.muted;

              return (
                <div
                  className="mt-3 rounded-md border px-2.5 py-2 text-[11px] leading-4"
                  style={{ borderColor: C.rule, backgroundColor: C.offWhite, color }}
                >
                  <p className="font-semibold">{reviewSummary}</p>
                  <p className="mt-0.5">{copy}</p>
                </div>
              );
            })()}

            {entry.queryTerms.length > 0 ? (
              <div className="mt-3">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: C.blue }}
                >
                  Buyer-language checks
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.queryTerms.map((term) => (
                    <span
                      key={term.toLowerCase()}
                      className="max-w-full rounded-md border px-2 py-1 text-[11px]"
                      style={{ borderColor: C.ruleDark, color: C.navySoft }}
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5" style={{ color: C.muted }}>
                Add buyer-language phrases to make this source plan more specific.
              </p>
            )}
          </article>
        ))}
      </div>

      <div
        className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      >
        <p className="max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
          These are source hypotheses, not proof of demand. Feedback only moves
          a supplemental source later after six unanimous off-target reviews; it never
          overrides a buyer group’s explicit source selection.
        </p>
        <Button asChild type="button" size="sm" variant="outline" className="shrink-0" style={{ borderColor: C.blueLight, color: C.blue }}>
          <Link href="/dashboard/watchlists">
            <Search className="size-3.5" aria-hidden="true" />
            Focus a buyer group
          </Link>
        </Button>
      </div>
    </section>
  );
}
