import { ExternalLink } from "lucide-react";

import { EvidenceReviewControls } from "@/components/prospects/evidence-review-controls";
import type {
  TargetEvidenceReviewAction,
  TargetEvidenceView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { formatTargetDate, publicHttpUrl } from "./target-format";
import { targetEvidencePresentation } from "./target-presentation";
import { EvidenceReviewBadge, LinkConfidenceBadge } from "./target-status";

function EvidenceItem({
  evidence,
  onReviewEvidence,
}: {
  evidence: TargetEvidenceView;
  onReviewEvidence: TargetEvidenceReviewAction | null | undefined;
}) {
  const presentation = targetEvidencePresentation(evidence.kind);
  const sourceUrl = publicHttpUrl(evidence.sourceUrl);
  const observedAt = formatTargetDate(evidence.observedAt);
  const sourceLabel = evidence.sourceLabel?.trim() || "Public source";

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-xs font-medium text-primary" title={presentation.description}>
            {presentation.label}
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-foreground">{evidence.summary}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <EvidenceReviewBadge status={evidence.reviewStatus} />
          <LinkConfidenceBadge confidence={evidence.entityLinkConfidence} />
        </div>
      </div>

      {evidence.excerpt ? (
        <blockquote className="mt-2 border-l-2 border-rule-dark pl-3 text-sm leading-6 text-navy-soft">
          “{evidence.excerpt}”
        </blockquote>
      ) : null}

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
        <span>{sourceLabel}</span>
        {observedAt ? <span>{observedAt}</span> : null}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open source
            <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span>No source link: verify this independently before accepting it</span>
        )}
      </p>

      {evidence.reviewStatus === "pending" && onReviewEvidence ? (
        <EvidenceReviewControls
          evidenceId={evidence.id}
          sourceAvailable={Boolean(sourceUrl)}
          onReview={onReviewEvidence}
        />
      ) : null}
    </li>
  );
}

/** Observations are rows in one list, separated by dividers rather than nested cards. */
export function TargetEvidenceList({
  evidence,
  onReviewEvidence,
}: {
  evidence: readonly TargetEvidenceView[];
  onReviewEvidence: TargetEvidenceReviewAction | null | undefined;
}) {
  if (evidence.length === 0) {
    return (
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        No public evidence yet. A high fit on its own is not a buyer signal.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-border">
      {evidence.map((item) => (
        <EvidenceItem key={item.id} evidence={item} onReviewEvidence={onReviewEvidence} />
      ))}
    </ul>
  );
}
