"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleAlert,
  CircleCheckBig,
  ExternalLink,
  FileSearch,
  FolderKanban,
  Link2,
  MessageSquareText,
  Sparkles,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidenceReviewControls } from "@/components/prospects/evidence-review-controls";
import { TargetFeedbackControls } from "@/components/prospects/target-feedback-controls";
import { TargetMonitoringControls } from "@/components/prospects/target-monitoring-controls";
import { TargetOpportunityControls } from "@/components/prospects/target-opportunity-controls";
import { supportsRetainedPublicTargetMonitoring } from "@/lib/retained-public-monitoring";
import { normalizeSeedUrl } from "@/lib/targeting-brief";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type {
  ProspectTargetEntityKind,
  ProspectTargetView,
  TargetFeedbackSummary,
  TargetEntityLinkConfidence,
  TargetFeedbackAction,
  TargetEvidenceReviewAction,
  TargetEvidenceView,
  TargetMonitoringAction,
  TargetOpportunityCreateAction,
  TargetOpportunityQualifyAction,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  displayedAssessmentReasons,
  sortTargetEvidence,
  targetAssessmentPresentation,
  targetAssessmentPriority,
  targetEntityKindLabel,
  targetEvidencePresentation,
  targetEvidenceReviewPresentation,
} from "./target-presentation";

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
  /** Explicit evidence-to-opportunity handoff; absent until its contract is deployed. */
  onCreateOpportunity?: TargetOpportunityCreateAction | null;
  /** Separate explicit qualification and optional CRM-export handoff. */
  onQualifyOpportunity?: TargetOpportunityQualifyAction | null;
  /** Aggregate workspace outcome counts, never individual reviewer data. */
  feedbackSummary?: readonly TargetFeedbackSummary[];
  className?: string;
};

type ToneColors = {
  background: string;
  color: string;
  border: string;
};

const TONE_COLORS: Record<"info" | "warning" | "success" | "muted", ToneColors> = {
  info: { background: C.bluePale, color: C.blue, border: C.blueLight },
  warning: { background: C.amberPale, color: C.amber, border: "#F3C96A" },
  success: { background: C.greenPale, color: C.green, border: "#6EE7B7" },
  muted: { background: C.offWhite, color: C.muted, border: C.ruleDark },
};

const ENTITY_KIND_ICON: Record<ProspectTargetEntityKind, LucideIcon> = {
  account: Building2,
  builder: UserRound,
  project: FolderKanban,
};

const FEEDBACK_SUMMARY_LABEL: Record<TargetFeedbackSummary["feedbackType"], string> = {
  promote_to_opportunity: "Promoted",
  target: "Kept targeting",
  useful_not_now: "Not now",
  not_relevant: "Not relevant",
  monitor: "Monitoring",
  contacted: "Contacted",
  meeting: "Meetings",
  won: "Won",
  lost: "Lost",
};

function publicHttpUrl(value: string | null): string | null {
  return value?.trim() ? normalizeSeedUrl(value) || null : null;
}

function displayDomain(value: string | null): string | null {
  const safeUrl = publicHttpUrl(value);
  if (!safeUrl) return null;

  try {
    return new URL(safeUrl).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function formatObservedAt(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    // This client component is also rendered during the initial server pass.
    // A fixed zone avoids a one-day hydration shift near midnight.
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function linkConfidencePresentation(confidence: TargetEntityLinkConfidence) {
  switch (confidence) {
    case "verified":
      return { label: "Verified link", tone: "success" as const };
    case "likely":
      return { label: "Likely link", tone: "warning" as const };
    case "unverified":
      return { label: "Unverified link", tone: "muted" as const };
  }
}

function targetTimestamp(target: ProspectTargetView): number {
  const timestamp = Date.parse(target.assessedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function TargetKindMark({ kind, size = "small" }: { kind: ProspectTargetEntityKind; size?: "small" | "large" }) {
  const Icon = ENTITY_KIND_ICON[kind];
  const isLarge = size === "large";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        isLarge ? "size-10" : "size-7 rounded-md",
      )}
      style={{ backgroundColor: C.blueTint, color: C.blue }}
      aria-hidden="true"
    >
      <Icon className={isLarge ? "size-5" : "size-3.5"} />
    </span>
  );
}

function AssessmentBadge({ target }: { target: ProspectTargetView }) {
  const presentation = targetAssessmentPresentation(target);
  const colors = TONE_COLORS[presentation.tone];

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold"
      title={presentation.description}
      style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.color }}
    >
      {presentation.requiresEvidenceReview ? (
        <CircleAlert className="size-3 shrink-0" aria-hidden="true" />
      ) : presentation.tone === "success" ? (
        <CircleCheckBig className="size-3 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="truncate">{presentation.label}</span>
    </span>
  );
}

function TargetListItem({
  target,
  selected,
  onSelect,
}: {
  target: ProspectTargetView;
  selected: boolean;
  onSelect: () => void;
}) {
  const reasonSummary = displayedAssessmentReasons(target.assessmentReasons, 1).reasons[0];
  const domain = displayDomain(target.canonicalUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className="w-full border-b px-3 py-3 text-left transition hover:bg-[#F6FAFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-4"
      style={{
        borderColor: C.rule,
        backgroundColor: selected ? C.blueTint : C.white,
        outlineColor: C.blue,
      }}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <TargetKindMark kind={target.entityKind} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold" title={target.displayName} style={{ color: C.navy }}>
              {target.displayName}
            </p>
            {selected ? (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                Selected
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: C.muted }}>
            {targetEntityKindLabel(target.entityKind)}
            {target.subtitle ? ` · ${target.subtitle}` : domain ? ` · ${domain}` : ""}
          </p>
          <div className="mt-2">
            <AssessmentBadge target={target} />
          </div>
          {reasonSummary ? (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-4" style={{ color: C.navySoft }}>
              {reasonSummary}
            </p>
          ) : null}
          <p className="mt-1 text-[10px]" style={{ color: C.muted }}>
            {target.evidence.length === 1 ? "1 public observation" : `${target.evidence.length} public observations`}
          </p>
        </div>
      </div>
    </button>
  );
}

function EvidenceItem({
  evidence,
  onReviewEvidence,
}: {
  evidence: TargetEvidenceView;
  onReviewEvidence: TargetEvidenceReviewAction | null | undefined;
}) {
  const presentation = targetEvidencePresentation(evidence.kind);
  const review = targetEvidenceReviewPresentation(evidence.reviewStatus);
  const confidence = linkConfidencePresentation(evidence.entityLinkConfidence);
  const reviewColors = TONE_COLORS[review.tone];
  const confidenceColors = TONE_COLORS[confidence.tone];
  const sourceUrl = publicHttpUrl(evidence.sourceUrl);
  const observedAt = formatObservedAt(evidence.observedAt);

  return (
    <article className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.white }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.blue }}>
            {presentation.label}
          </p>
          <p className="mt-1 text-xs font-medium leading-5" style={{ color: C.navy }}>
            {evidence.summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span
            className="inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
            title={review.description}
            style={{
              backgroundColor: reviewColors.background,
              borderColor: reviewColors.border,
              color: reviewColors.color,
            }}
          >
            {review.label}
          </span>
          <span
            className="inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
            title="How confidently the public source is linked to this target"
            style={{
              backgroundColor: confidenceColors.background,
              borderColor: confidenceColors.border,
              color: confidenceColors.color,
            }}
          >
            {confidence.label}
          </span>
        </div>
      </div>

      {evidence.excerpt ? (
        <blockquote className="mt-2 border-l-2 pl-2.5 text-xs leading-5" style={{ borderColor: C.blueLight, color: C.navySoft }}>
          “{evidence.excerpt}”
        </blockquote>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]" style={{ color: C.muted }}>
        <span>{evidence.sourceLabel?.trim() || "Public source"}</span>
        {observedAt ? <span aria-hidden="true">·</span> : null}
        {observedAt ? <span>{observedAt}</span> : null}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
            style={{ color: C.blue }}
          >
            Open source
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <span title="This observation cannot support a strong buyer-signal claim until a public source is available.">
            Source link unavailable
          </span>
        )}
      </div>
      {evidence.reviewStatus === "pending" && onReviewEvidence ? (
        <EvidenceReviewControls
          evidenceId={evidence.id}
          sourceAvailable={Boolean(sourceUrl)}
          onReview={onReviewEvidence}
        />
      ) : null}
    </article>
  );
}

function TargetDeskEmpty({ targetBriefHref }: { targetBriefHref: string | null | undefined }) {
  return (
    <section
      aria-labelledby="target-desk-heading"
      className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border p-8 text-center"
      style={{ borderColor: C.ruleDark, backgroundColor: C.white }}
    >
      <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: C.bluePale, color: C.blue }}>
        <Target className="size-5" aria-hidden="true" />
      </span>
      <h2 id="target-desk-heading" className="mt-4 text-base font-semibold" style={{ color: C.navy }}>
        No targets ready to review
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6" style={{ color: C.muted }}>
        Targets can be accounts, independent builders, or projects. They can appear before anyone posts a public buying request.
      </p>
      {targetBriefHref ? (
        <Button asChild variant="outline" size="sm" className="mt-4 border-[#C8D9E8]">
          <Link href={targetBriefHref}>Review targeting</Link>
        </Button>
      ) : null}
    </section>
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
  className,
}: TargetDeskProps) {
  const sortedTargets = useMemo(
    () =>
      [...targets].sort((left, right) => {
        const priorityDifference =
          targetAssessmentPriority(left.assessmentState) -
          targetAssessmentPriority(right.assessmentState);
        return priorityDifference || targetTimestamp(right) - targetTimestamp(left) || left.displayName.localeCompare(right.displayName);
      }),
    [targets],
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(
    initialSelectedTargetId ?? sortedTargets[0]?.id ?? null,
  );

  useEffect(() => {
    if (sortedTargets.some((target) => target.id === selectedTargetId)) return;
    setSelectedTargetId(initialSelectedTargetId ?? sortedTargets[0]?.id ?? null);
  }, [initialSelectedTargetId, selectedTargetId, sortedTargets]);

  const selectedTarget =
    sortedTargets.find((target) => target.id === selectedTargetId) ?? sortedTargets[0] ?? null;
  const selectedPresentation = selectedTarget
    ? targetAssessmentPresentation(selectedTarget)
    : null;
  const evidence = selectedTarget ? sortTargetEvidence(selectedTarget.evidence) : [];
  const displayedReasons = selectedTarget
    ? displayedAssessmentReasons(selectedTarget.assessmentReasons)
    : { reasons: [], remainingCount: 0 };
  const validStrongSignalCount = sortedTargets.filter(
    (target) => targetAssessmentPresentation(target).tone === "success",
  ).length;
  const evidenceReviewCount = sortedTargets.filter(
    (target) => targetAssessmentPresentation(target).requiresEvidenceReview,
  ).length;
  const signalBackedCount = sortedTargets.filter(
    (target) => target.assessmentState === "signal_backed",
  ).length;
  const activeTargetCount = sortedTargets.filter(
    (target) => target.assessmentState !== "rejected",
  ).length;
  const feedbackEventCount = feedbackSummary.reduce(
    (total, summary) => total + summary.feedbackCount,
    0,
  );
  const feedbackSummaryText = feedbackSummary
    .slice(0, 3)
    .map((summary) => `${FEEDBACK_SUMMARY_LABEL[summary.feedbackType]} ${summary.feedbackCount}`)
    .join(" · ");
  const targetUrl = selectedTarget ? publicHttpUrl(selectedTarget.canonicalUrl) : null;

  if (sortedTargets.length === 0) {
    return <TargetDeskEmpty targetBriefHref={targetBriefHref} />;
  }

  return (
    <section
      aria-labelledby="target-desk-heading"
      className={cn("overflow-hidden rounded-xl border", className)}
      style={{ borderColor: C.ruleDark, backgroundColor: C.white }}
    >
      <header className="border-b px-4 py-4 sm:px-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.bluePale, color: C.blue }}>
              <FileSearch className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                Entity-first discovery
              </p>
              <h2 id="target-desk-heading" className="mt-0.5 text-base font-semibold" style={{ color: C.navy }}>
                Target desk
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: C.navySoft }}>
                Review accounts, builders, and projects before public conversations exist. High fit is not a buyer signal.
              </p>
            </div>
          </div>
          {targetBriefHref ? (
            <Link
              href={targetBriefHref}
              className="shrink-0 text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
              style={{ color: C.blue }}
            >
              Review targeting
            </Link>
          ) : null}
        </div>

        <dl className="mt-4 grid overflow-hidden rounded-lg border sm:grid-cols-3" style={{ borderColor: C.rule }}>
          <DeskMetric label="Active targets" value={activeTargetCount} detail="Fit or evidence worth reviewing" />
          <DeskMetric label="Signal-backed" value={signalBackedCount} detail="Relevant public evidence found" />
          <DeskMetric
            label={evidenceReviewCount > 0 ? "Needs evidence review" : "Strong buyer signals"}
            value={evidenceReviewCount > 0 ? evidenceReviewCount : validStrongSignalCount}
            detail={
              evidenceReviewCount > 0
                ? "Unsupported strong-signal claims withheld"
                : "Cited, verified public evidence"
            }
          />
        </dl>
        {feedbackEventCount > 0 ? (
          <p className="mt-2 text-[11px] leading-4" style={{ color: C.muted }}>
            {feedbackEventCount} recorded target outcome{feedbackEventCount === 1 ? "" : "s"}
            {feedbackSummaryText ? ` · ${feedbackSummaryText}` : ""}. These are feedback inputs, not automatic ranking changes.
          </p>
        ) : null}
      </header>

      <div className="grid min-h-[480px] lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]">
        <section className="min-w-0 border-b lg:border-b-0 lg:border-r" style={{ borderColor: C.rule }} aria-label="Targets">
          <div className="flex items-center justify-between border-b px-3 py-2.5 sm:px-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
              Targets
            </p>
            <span className="text-[11px]" style={{ color: C.muted }}>
              {sortedTargets.length}
            </span>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {sortedTargets.map((target) => (
              <TargetListItem
                key={target.id}
                target={target}
                selected={target.id === selectedTarget?.id}
                onSelect={() => setSelectedTargetId(target.id)}
              />
            ))}
          </div>
        </section>

        {selectedTarget && selectedPresentation ? (
          <aside className="min-w-0 p-4 sm:p-5" aria-label={`${selectedTarget.displayName} assessment`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <TargetKindMark kind={selectedTarget.entityKind} size="large" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                    {targetEntityKindLabel(selectedTarget.entityKind)}
                  </p>
                  <h3 className="mt-0.5 break-words text-lg font-semibold" style={{ color: C.navy }}>
                    {selectedTarget.displayName}
                  </h3>
                  {selectedTarget.subtitle ? (
                    <p className="mt-0.5 text-xs" style={{ color: C.navySoft }}>
                      {selectedTarget.subtitle}
                    </p>
                  ) : null}
                </div>
              </div>
              {targetUrl ? (
                <Button asChild variant="outline" size="sm" className="shrink-0 border-[#C8D9E8]">
                  <a href={targetUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open target
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: TONE_COLORS[selectedPresentation.tone].border, backgroundColor: TONE_COLORS[selectedPresentation.tone].background }}>
              <AssessmentBadge target={selectedTarget} />
              <p className="mt-2 text-xs leading-5" style={{ color: TONE_COLORS[selectedPresentation.tone].color }}>
                {selectedPresentation.description}
              </p>
            </div>

            <section className="mt-5" aria-labelledby="target-assessment-reasons">
              <h4 id="target-assessment-reasons" className="text-xs font-semibold" style={{ color: C.navy }}>
                Why it is here
              </h4>
              {displayedReasons.reasons.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: C.navySoft }}>
                  {displayedReasons.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
                      <span>{reason}</span>
                    </li>
                  ))}
                  {displayedReasons.remainingCount > 0 ? (
                    <li className="pl-5.5 text-[11px]" style={{ color: C.muted }}>
                      +{displayedReasons.remainingCount} more server-assessed reason{displayedReasons.remainingCount === 1 ? "" : "s"}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs leading-5" style={{ color: C.muted }}>
                  No display-safe assessment reason is available yet.
                </p>
              )}
            </section>

            <section className="mt-5" aria-labelledby="target-evidence-heading">
              <div className="flex items-baseline justify-between gap-2">
                <h4 id="target-evidence-heading" className="text-xs font-semibold" style={{ color: C.navy }}>
                  Public evidence
                </h4>
                <span className="text-[10px]" style={{ color: C.muted }}>
                  {evidence.length === 1 ? "1 observation" : `${evidence.length} observations`}
                </span>
              </div>
              {evidence.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {evidence.map((item) => (
                    <EvidenceItem
                      key={item.id}
                      evidence={item}
                      onReviewEvidence={onReviewEvidence}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
                  <div className="flex gap-2.5">
                    <MessageSquareText className="mt-0.5 size-4 shrink-0" style={{ color: C.muted }} aria-hidden="true" />
                    <p className="text-xs leading-5" style={{ color: C.navySoft }}>
                      No public observation is available yet. This can still be a high-fit research target, but it is not a buyer signal.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {selectedTarget.assessmentId &&
            (onCreateOpportunity || onQualifyOpportunity) ? (
              <TargetOpportunityControls
                assessmentId={selectedTarget.assessmentId}
                evidence={evidence}
                opportunity={selectedTarget.opportunity}
                onCreate={onCreateOpportunity}
                onQualify={onQualifyOpportunity}
              />
            ) : null}

            {selectedTarget.assessmentId && onTargetFeedback ? (
              <TargetFeedbackControls
                assessmentId={selectedTarget.assessmentId}
                onFeedback={onTargetFeedback}
              />
            ) : null}

            {selectedTarget.assessmentId &&
            onTargetMonitoring &&
            supportsRetainedPublicTargetMonitoring(
              selectedTarget.entityKind,
              selectedTarget.canonicalUrl,
            ) ? (
              <TargetMonitoringControls
                assessmentId={selectedTarget.assessmentId}
                monitoring={selectedTarget.monitoring}
                onChange={onTargetMonitoring}
              />
            ) : null}

            <section className="mt-5 rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }} aria-label="Review boundary">
              <div className="flex gap-2.5">
                <Link2 className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
                <p className="text-xs leading-5" style={{ color: C.navySoft }}>
                  {selectedPresentation.tone === "success"
                    ? "Review the cited source before acting. A strong buyer signal is evidence-backed prioritisation, not a confirmed customer."
                    : "Keep this in research or monitoring until cited public evidence supports a stronger claim. Do not treat it as a CRM lead automatically."}
                </p>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function DeskMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="min-w-0 border-b px-3 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0" style={{ borderColor: C.rule }}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold leading-none" style={{ color: C.navy }}>
          {value}
        </span>
        <span className="truncate text-[10px]" title={detail} style={{ color: C.muted }}>
          {detail}
        </span>
      </dd>
    </div>
  );
}
