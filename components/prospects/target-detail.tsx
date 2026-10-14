"use client";

import type { Ref } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supportsRetainedPublicTargetMonitoring } from "@/lib/retained-public-monitoring";
import type {
  ProspectTargetView,
  TargetEvidenceReviewAction,
  TargetFeedbackAction,
  TargetMonitoringAction,
  TargetOpportunityCreateAction,
  TargetOpportunityQualifyAction,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { TargetEvidenceList } from "./target-evidence";
import { TargetFeedbackControls } from "./target-feedback-controls";
import { publicHttpUrl } from "./target-format";
import { TargetMonitoringControls } from "./target-monitoring-controls";
import { TargetOpportunityControls } from "./target-opportunity-controls";
import {
  displayedAssessmentReasons,
  sortTargetEvidence,
  targetAssessmentPresentation,
  targetAwaitingAssessment,
  targetEntityKindLabel,
  targetReasonHeading,
} from "./target-presentation";
import { TargetKindMark, TargetStatusBadge } from "./target-status";

export const TARGET_DETAIL_HEADING_ID = "target-detail-heading";

export type TargetDetailActions = {
  onReviewEvidence: TargetEvidenceReviewAction | null;
  onTargetFeedback: TargetFeedbackAction | null;
  onTargetMonitoring: TargetMonitoringAction | null;
  onCreateOpportunity: TargetOpportunityCreateAction | null;
  onQualifyOpportunity: TargetOpportunityQualifyAction | null;
};

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-sm text-muted-foreground">
      {label}{" "}
      <span className="font-semibold tabular-nums text-foreground">{Math.round(value)}</span>
      <span className="tabular-nums"> / 100</span>
    </span>
  );
}

/**
 * The selected target's assessment, evidence and actions. Per-target controls
 * are keyed by assessment so their notices and pending state reset when the
 * selection changes.
 */
export function TargetDetail({
  ref,
  target,
  onBackToList,
  onReviewEvidence,
  onTargetFeedback,
  onTargetMonitoring,
  onCreateOpportunity,
  onQualifyOpportunity,
}: {
  ref?: Ref<HTMLElement>;
  target: ProspectTargetView;
  onBackToList: () => void;
} & TargetDetailActions) {
  const presentation = targetAssessmentPresentation(target);
  const evidence = sortTargetEvidence(target.evidence);
  const reasons = displayedAssessmentReasons(target.assessmentReasons);
  const targetUrl = publicHttpUrl(target.canonicalUrl);
  const awaitingAssessment = targetAwaitingAssessment(target);
  const assessmentId = target.assessmentId;

  return (
    <article ref={ref} className="arc-target-detail" aria-labelledby={TARGET_DETAIL_HEADING_ID}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="arc-target-detail__back -ml-2 mb-3 text-primary"
        onClick={onBackToList}
      >
        <ArrowLeft aria-hidden="true" />
        Back to targets
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TargetKindMark kind={target.entityKind} size="large" />
          <div className="min-w-0">
            <p className="text-xs text-subtle">{targetEntityKindLabel(target.entityKind)}</p>
            <h3
              id={TARGET_DETAIL_HEADING_ID}
              tabIndex={-1}
              className="mt-0.5 break-words text-lg font-semibold leading-7 text-foreground outline-none"
            >
              {target.displayName}
            </h3>
            {target.subtitle ? (
              <p className="break-all text-sm text-muted-foreground">{target.subtitle}</p>
            ) : null}
          </div>
        </div>
        {targetUrl ? (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={targetUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open site
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <TargetStatusBadge target={target} size="default" />
        <Score label="Research priority" value={target.priorityScore} />
        {target.fitScore !== null ? <Score label="Fit" value={target.fitScore * 100} /> : null}
      </div>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">
        {awaitingAssessment
          ? "Arcli hasn't assessed this target against your targeting brief yet."
          : presentation.description}
      </p>

      <section className="mt-5 border-t border-border pt-4" aria-labelledby="target-reasons-heading">
        <h4 id="target-reasons-heading" className="text-sm font-semibold text-foreground">
          {targetReasonHeading(target.assessmentState)}
        </h4>
        {reasons.reasons.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-navy-soft marker:text-subtle">
            {reasons.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {reasons.remainingCount > 0 ? (
              <li className="list-none text-subtle">
                and {reasons.remainingCount} more {reasons.remainingCount === 1 ? "reason" : "reasons"}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">No reasons recorded yet.</p>
        )}
      </section>

      <section className="mt-5 border-t border-border pt-4" aria-labelledby="target-evidence-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h4 id="target-evidence-heading" className="text-sm font-semibold text-foreground">
            Public evidence
          </h4>
          <span className="text-xs tabular-nums text-subtle">
            {evidence.length === 1 ? "1 observation" : `${evidence.length} observations`}
          </span>
        </div>
        <TargetEvidenceList evidence={evidence} onReviewEvidence={onReviewEvidence} />
      </section>

      {assessmentId && (onCreateOpportunity || onQualifyOpportunity) ? (
        <TargetOpportunityControls
          key={`opportunity-${assessmentId}`}
          assessmentId={assessmentId}
          assessmentState={target.assessmentState}
          evidence={evidence}
          opportunity={target.opportunity}
          onCreate={onCreateOpportunity}
          onQualify={onQualifyOpportunity}
        />
      ) : null}

      {assessmentId && onTargetFeedback ? (
        <TargetFeedbackControls
          key={`feedback-${assessmentId}`}
          assessmentId={assessmentId}
          onFeedback={onTargetFeedback}
          rejected={target.assessmentState === "rejected"}
        />
      ) : null}

      {assessmentId &&
      onTargetMonitoring &&
      supportsRetainedPublicTargetMonitoring(target.entityKind, target.canonicalUrl) ? (
        <TargetMonitoringControls
          key={`monitoring-${assessmentId}`}
          assessmentId={assessmentId}
          monitoring={target.monitoring}
          onChange={onTargetMonitoring}
        />
      ) : null}
    </article>
  );
}
