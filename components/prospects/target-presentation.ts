import type {
  ProspectTargetEntityKind,
  ProspectTargetView,
  TargetAssessmentState,
  TargetEvidenceKind,
  TargetEvidenceReviewStatus,
  TargetEvidenceView,
} from "@/app/(dashboard)/dashboard/prospect-types";

export type TargetPresentationTone = "info" | "warning" | "success" | "muted";

export type TargetAssessmentPresentation = {
  label: string;
  description: string;
  tone: TargetPresentationTone;
  /** True when the UI withheld an unsupported strong-signal label. */
  requiresEvidenceReview: boolean;
};

export type TargetEvidencePresentation = {
  label: string;
  description: string;
};

export type TargetEvidenceReviewPresentation = {
  label: string;
  description: string;
  tone: Exclude<TargetPresentationTone, "info">;
};

const ENTITY_KIND_LABELS: Record<ProspectTargetEntityKind, string> = {
  account: "Account",
  builder: "Builder",
  project: "Project",
};

const EVIDENCE_PRESENTATION: Record<TargetEvidenceKind, TargetEvidencePresentation> = {
  fit: {
    label: "Fit evidence",
    description: "Shows why this target resembles the targeting profile.",
  },
  trigger: {
    label: "Change trigger",
    description: "Shows a recent change that may make the problem more relevant now.",
  },
  problem: {
    label: "Problem evidence",
    description: "Shows a publicly stated workflow problem or pain point.",
  },
  evaluation: {
    label: "Evaluation evidence",
    description: "Shows public consideration of an approach, tool, or alternative.",
  },
  relationship: {
    label: "Relationship evidence",
    description: "Shows how a public profile, builder, project, or account is connected.",
  },
};

const EVIDENCE_REVIEW_PRESENTATION: Record<
  TargetEvidenceReviewStatus,
  TargetEvidenceReviewPresentation
> = {
  pending: {
    label: "Pending review",
    description:
      "This observation cannot support an assessment until a human reviewer accepts it.",
    tone: "warning",
  },
  accepted: {
    label: "Accepted evidence",
    description:
      "A human reviewer accepted this cited public observation for assessment use.",
    tone: "success",
  },
};

const ASSESSMENT_PRESENTATION: Record<
  Exclude<TargetAssessmentState, "strong_buyer_signal">,
  Omit<TargetAssessmentPresentation, "requiresEvidenceReview">
> = {
  high_fit: {
    label: "High-fit target",
    description:
      "This target resembles your ideal customer. No public buyer signal has been observed.",
    tone: "info",
  },
  triggered: {
    label: "Triggered target",
    description:
      "This target resembles your ideal customer and has a relevant public change. No direct buyer signal has been observed.",
    tone: "warning",
  },
  signal_backed: {
    label: "Signal-backed target",
    description:
      "Relevant public evidence supports this target. Review the source before deciding whether to reach out.",
    tone: "info",
  },
  rejected: {
    label: "Rejected target",
    description:
      "This target was excluded because it is a poor fit, stale, or not reliably identified.",
    tone: "muted",
  },
};

const STRONG_BUYER_EVIDENCE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1_000;

/**
 * A strong buyer signal needs a cited, verified observation of active
 * evaluation. This mirrors the database state so a partial API projection
 * cannot turn a high-fit target into an unsupported buying claim in the
 * browser.
 */
export function hasVerifiedDirectBuyerEvidence(
  evidence: readonly TargetEvidenceView[],
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  return evidence.some(
    (item) => {
      const observedAtMs = Date.parse(item.observedAt ?? "");
      return (
        item.reviewStatus === "accepted" &&
        item.kind === "evaluation" &&
        item.entityLinkConfidence === "verified" &&
        Boolean(item.sourceUrl?.trim()) &&
        Number.isFinite(observedAtMs) &&
        observedAtMs <= nowMs &&
        nowMs - observedAtMs <= STRONG_BUYER_EVIDENCE_MAX_AGE_MS
      );
    },
  );
}

export function targetAssessmentPresentation(
  target: Pick<ProspectTargetView, "assessmentState" | "evidence">,
  now: Date = new Date(),
): TargetAssessmentPresentation {
  if (target.assessmentState === "strong_buyer_signal") {
    if (!hasVerifiedDirectBuyerEvidence(target.evidence, now)) {
      return {
        label: "Evidence review needed",
        description:
          "A strong buyer signal needs a cited, verified public evaluation observation. The evidence shown does not meet that bar.",
        tone: "warning",
        requiresEvidenceReview: true,
      };
    }

    return {
      label: "Strong buyer signal",
      description:
        "This high-fit target has current, cited public evidence of active evaluation. It is not a confirmed customer.",
      tone: "success",
      requiresEvidenceReview: false,
    };
  }

  return {
    ...ASSESSMENT_PRESENTATION[target.assessmentState],
    requiresEvidenceReview: false,
  };
}

export function targetEntityKindLabel(kind: ProspectTargetEntityKind): string {
  return ENTITY_KIND_LABELS[kind];
}

export function targetEvidencePresentation(
  kind: TargetEvidenceKind,
): TargetEvidencePresentation {
  return EVIDENCE_PRESENTATION[kind];
}

export function targetEvidenceReviewPresentation(
  status: TargetEvidenceReviewStatus,
): TargetEvidenceReviewPresentation {
  return EVIDENCE_REVIEW_PRESENTATION[status];
}

const EVIDENCE_ORDER: Record<TargetEvidenceKind, number> = {
  evaluation: 0,
  problem: 1,
  trigger: 2,
  fit: 3,
  relationship: 4,
};

/**
 * Keep the evidence most useful for a decision at the top, while retaining a
 * deterministic fallback order for sources with missing or malformed dates.
 */
export function sortTargetEvidence(
  evidence: readonly TargetEvidenceView[],
): TargetEvidenceView[] {
  return [...evidence].sort((left, right) => {
    const kindDifference = EVIDENCE_ORDER[left.kind] - EVIDENCE_ORDER[right.kind];
    if (kindDifference !== 0) return kindDifference;

    const leftTime = Date.parse(left.observedAt ?? "");
    const rightTime = Date.parse(right.observedAt ?? "");
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    if (normalizedLeftTime !== normalizedRightTime) {
      return normalizedRightTime - normalizedLeftTime;
    }

    return left.id.localeCompare(right.id);
  });
}

/** Limit long server-owned reason lists without implying the list is exhaustive. */
export function displayedAssessmentReasons(
  reasons: readonly string[],
  maximum = 3,
): { reasons: string[]; remainingCount: number } {
  const cleaned = Array.from(
    new Set(reasons.map((reason) => reason.trim()).filter(Boolean)),
  );
  const safeMaximum = Math.max(0, Math.floor(maximum));

  return {
    reasons: cleaned.slice(0, safeMaximum),
    remainingCount: Math.max(0, cleaned.length - safeMaximum),
  };
}

export function targetAssessmentPriority(
  state: TargetAssessmentState,
): number {
  switch (state) {
    case "strong_buyer_signal":
      return 0;
    case "signal_backed":
      return 1;
    case "triggered":
      return 2;
    case "high_fit":
      return 3;
    case "rejected":
      return 4;
  }
}
