"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Target } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ProspectTargetView,
  TargetFeedbackSummary,
  TargetFeedbackAction,
  TargetEvidenceReviewAction,
  TargetMonitoringAction,
  TargetOpportunityCreateAction,
  TargetOpportunityQualifyAction,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { TARGET_DETAIL_HEADING_ID, TargetDetail } from "./target-detail";
import { TargetList } from "./target-list";
import {
  targetAssessmentPresentation,
  targetAssessmentPriority,
} from "./target-presentation";
import "./target-desk.css";

export type TargetDeskProps = {
  /** Tenant-scoped, server-assessed targets. This component never fetches or scores targets. */
  targets: readonly ProspectTargetView[];
  /** Lets an embedding route choose the first detail panel without owning UI state. */
  initialSelectedTargetId?: string | null;
  /** Existing customers can point this to their approved targeting-brief workflow. */
  targetBriefHref?: string | null;
  /** A server-owned review action; absent during partial database rollouts. */
  onReviewEvidence?: TargetEvidenceReviewAction | null;
  /** Human target outcomes; this never creates a lead or CRM record. */
  onTargetFeedback?: TargetFeedbackAction | null;
  /** Explicit retained-corpus watch control; absent until the worker is deployed. */
  onTargetMonitoring?: TargetMonitoringAction | null;
  /**
   * Explicit evidence-to-opportunity handoff; absent until its contract is
   * deployed. TargetDetail renders TargetOpportunityControls only when this
   * or onQualifyOpportunity is present.
   */
  onCreateOpportunity?: TargetOpportunityCreateAction | null;
  /** Separate explicit qualification and optional CRM-export handoff. */
  onQualifyOpportunity?: TargetOpportunityQualifyAction | null;
  /** Aggregate workspace outcome counts, never individual reviewer data. */
  feedbackSummary?: readonly TargetFeedbackSummary[];
  /** Id of the URL field that adds a target, so the empty state can focus it. */
  addTargetInputId?: string | null;
  className?: string;
};

const FEEDBACK_SUMMARY_LABEL: Record<TargetFeedbackSummary["feedbackType"], string> = {
  promote_to_opportunity: "promoted",
  target: "kept targeting",
  useful_not_now: "not now",
  not_relevant: "not relevant",
  monitor: "monitoring",
  contacted: "contacted",
  meeting: "meeting",
  won: "won",
  lost: "lost",
};

// Matches the CSS breakpoint where the list becomes a rail beside the detail.
const SIDE_BY_SIDE_QUERY = "(min-width: 1180px)";

function targetTimestamp(target: ProspectTargetView): number {
  const timestamp = Date.parse(target.assessedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function DeskMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold leading-6 tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function TargetDeskEmpty({
  targetBriefHref,
  addTargetInputId,
}: {
  targetBriefHref: string | null | undefined;
  addTargetInputId: string | null | undefined;
}) {
  return (
    <EmptyState
      variant="never-used"
      icon={Target}
      title="No targets yet"
      description="Add a company, builder or project URL above. Arcli checks it against your targeting brief and lists the public evidence it finds."
      action={
        addTargetInputId ? (
          <Button type="button" onClick={() => document.getElementById(addTargetInputId)?.focus()}>
            Add your first target
          </Button>
        ) : undefined
      }
      secondaryAction={
        targetBriefHref ? (
          <Link
            href={targetBriefHref}
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Review your targeting brief
          </Link>
        ) : undefined
      }
    />
  );
}

/**
 * A human-review surface for entity-first discovery. Fit and public evidence
 * remain separate from an opportunity; the optional opportunity controls make
 * both the promotion and CRM-export qualification explicit user decisions.
 */
export function TargetDesk({
  targets,
  initialSelectedTargetId = null,
  targetBriefHref = "/dashboard/brief",
  onReviewEvidence = null,
  onTargetFeedback = null,
  onTargetMonitoring = null,
  onCreateOpportunity = null,
  onQualifyOpportunity = null,
  feedbackSummary = [],
  addTargetInputId = null,
  className,
}: TargetDeskProps) {
  const sortedTargets = useMemo(
    () =>
      [...targets].sort((left, right) => {
        const priorityDifference =
          targetAssessmentPriority(left.assessmentState) -
          targetAssessmentPriority(right.assessmentState);
        return priorityDifference ||
          right.priorityScore - left.priorityScore ||
          targetTimestamp(right) - targetTimestamp(left) ||
          left.displayName.localeCompare(right.displayName);
      }),
    [targets],
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(
    initialSelectedTargetId ?? sortedTargets[0]?.id ?? null,
  );
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const knownTargetIds = useRef<Set<string>>(new Set(targets.map((target) => target.id)));

  // A target added from this page (or by research) arrives on refresh with
  // no id in the action result. When exactly one new target appears, select
  // it and bring its row into view so "Target added" points somewhere.
  useEffect(() => {
    const newIds = sortedTargets
      .map((target) => target.id)
      .filter((id) => !knownTargetIds.current.has(id));
    knownTargetIds.current = new Set(sortedTargets.map((target) => target.id));
    if (newIds.length !== 1) return;

    const [newId] = newIds;
    setSelectedTargetId(newId);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(newId)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }, [sortedTargets]);

  const selectTarget = (targetId: string) => {
    setSelectedTargetId(targetId);
    // Stacked layout: the detail sits below the whole list, so move to it.
    if (window.matchMedia(SIDE_BY_SIDE_QUERY).matches) return;
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      document.getElementById(TARGET_DETAIL_HEADING_ID)?.focus({ preventScroll: true });
    });
  };

  const backToList = () => {
    const row = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    row?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    row?.focus({ preventScroll: true });
  };

  if (sortedTargets.length === 0) {
    return <TargetDeskEmpty targetBriefHref={targetBriefHref} addTargetInputId={addTargetInputId} />;
  }

  // A selection that left the list (after a refresh) falls back without an
  // extra render: the route's choice first, then the strongest target.
  const selectedTarget =
    sortedTargets.find((target) => target.id === selectedTargetId) ??
    sortedTargets.find((target) => target.id === initialSelectedTargetId) ??
    sortedTargets[0];
  const presentations = sortedTargets.map((target) => targetAssessmentPresentation(target));
  const activeTargetCount = sortedTargets.filter((target) => target.assessmentState !== "rejected").length;
  const strongSignalCount = presentations.filter((presentation) => presentation.tone === "success").length;
  const signalBackedCount = sortedTargets.filter((target) => target.assessmentState === "signal_backed").length;
  const evidenceReviewCount = presentations.filter((presentation) => presentation.requiresEvidenceReview).length;
  const feedbackEventCount = feedbackSummary.reduce((total, summary) => total + summary.feedbackCount, 0);
  const feedbackSummaryText = feedbackSummary
    .map((summary) => `${summary.feedbackCount} ${FEEDBACK_SUMMARY_LABEL[summary.feedbackType]}`)
    .join(", ");

  return (
    <section
      aria-labelledby="target-desk-heading"
      // overflow-clip (not hidden) keeps the rounded corners without
      // creating a scroll container, so the list rail can stay sticky.
      className={cn("overflow-clip rounded-lg border border-border bg-card", className)}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0 max-w-[62ch]">
          <h2 id="target-desk-heading" className="text-base font-semibold text-foreground">
            Review targets
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {sortedTargets.length === 1 ? "1 target" : `${sortedTargets.length} targets`}, strongest
            signal first.
            {evidenceReviewCount > 0
              ? ` ${evidenceReviewCount} ${evidenceReviewCount === 1 ? "needs" : "need"} evidence review.`
              : ""}
          </p>
        </div>
        {/* On phones the counts give way to the list; the header line above
            already carries the one count that asks for action. */}
        <dl className="hidden grid-cols-4 gap-x-5 sm:grid">
          <DeskMetric label="Active" value={activeTargetCount} />
          <DeskMetric label="Strong signal" value={strongSignalCount} />
          <DeskMetric label="Signal-backed" value={signalBackedCount} />
          <DeskMetric label="Needs review" value={evidenceReviewCount} />
        </dl>
      </header>

      <div className="arc-target-desk__body">
        <div ref={listRef} className="contents">
          <TargetList
            targets={sortedTargets}
            selectedTargetId={selectedTarget.id}
            onSelect={selectTarget}
            footer={
              <div className="space-y-1 border-t border-border px-4 py-3 text-xs leading-5 text-subtle">
                <p>Arcli never contacts anyone or exports to your CRM unless you qualify an opportunity.</p>
                {feedbackEventCount > 0 ? (
                  <p>
                    {feedbackEventCount} {feedbackEventCount === 1 ? "outcome" : "outcomes"} recorded:{" "}
                    {feedbackSummaryText}. They inform future ranking reviews, not automatic ranking changes.
                  </p>
                ) : null}
              </div>
            }
          />
        </div>

        <TargetDetail
          ref={detailRef}
          target={selectedTarget}
          onBackToList={backToList}
          onReviewEvidence={onReviewEvidence}
          onTargetFeedback={onTargetFeedback}
          onTargetMonitoring={onTargetMonitoring}
          onCreateOpportunity={onCreateOpportunity}
          onQualifyOpportunity={onQualifyOpportunity}
        />
      </div>
    </section>
  );
}
