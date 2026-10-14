import type { ReactNode } from "react";

import type { ProspectTargetView } from "@/app/(dashboard)/dashboard/prospect-types";
import { displayDomain, formatTargetDate } from "./target-format";
import {
  displayedAssessmentReasons,
  targetAssessmentPresentation,
  targetAwaitingAssessment,
  targetEntityKindLabel,
} from "./target-presentation";
import { TargetKindMark, TargetStatusBadge } from "./target-status";

function statusLabel(target: ProspectTargetView): string {
  return targetAwaitingAssessment(target)
    ? "Not yet assessed"
    : targetAssessmentPresentation(target).label;
}

function sourceCountLabel(count: number): string {
  return count === 1 ? "1 source" : `${count} sources`;
}

function TargetRow({
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
  const meta = target.subtitle ? displayDomain(target.subtitle) ?? target.subtitle : domain;
  const sourceCount = target.evidence.length;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-target-id={target.id}
        aria-current={selected ? "true" : undefined}
        // The row's visible cells read as one run-on name, so give it a
        // short name and leave the columns to sighted scanning.
        aria-label={`${target.displayName}. ${statusLabel(target)}. ${sourceCountLabel(sourceCount)}.`}
        className="arc-target-row"
      >
        <span className="arc-target-row__identity">
          <TargetKindMark kind={target.entityKind} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground" title={target.displayName}>
              {target.displayName}
            </span>
            <span className="mt-0.5 flex min-w-0 gap-2 text-xs text-subtle">
              <span className="shrink-0">{targetEntityKindLabel(target.entityKind)}</span>
              {meta && meta !== target.displayName ? <span className="truncate">{meta}</span> : null}
            </span>
          </span>
        </span>
        <span className="arc-target-row__status">
          <TargetStatusBadge target={target} />
        </span>
        <span className="arc-target-row__reason">{reasonSummary || "No reasons recorded yet"}</span>
        <span className="arc-target-row__sources">
          {sourceCount}
          <span className="arc-target-row__unit"> {sourceCount === 1 ? "source" : "sources"}</span>
        </span>
        <span className="arc-target-row__date">
          {formatTargetDate(target.assessedAt) ?? "Not yet"}
        </span>
      </button>
    </li>
  );
}

/**
 * The list half of the target desk. Selection lives in TargetDesk; this only
 * renders rows. Column headings show only when the list is wide enough for
 * columns (see target-desk.css container queries).
 */
export function TargetList({
  targets,
  selectedTargetId,
  onSelect,
  footer,
}: {
  targets: readonly ProspectTargetView[];
  selectedTargetId: string | null;
  onSelect: (targetId: string) => void;
  footer?: ReactNode;
}) {
  return (
    <section className="arc-target-list" aria-label="Targets">
      <div className="arc-target-list__heading" aria-hidden="true">
        <span>Target</span>
        <span>Status</span>
        <span>Main reason</span>
        <span className="text-right">Sources</span>
        <span>Researched</span>
      </div>
      <ul className="arc-target-list__rows">
        {targets.map((target) => (
          <TargetRow
            key={target.id}
            target={target}
            selected={target.id === selectedTargetId}
            onSelect={() => onSelect(target.id)}
          />
        ))}
      </ul>
      {footer}
    </section>
  );
}
