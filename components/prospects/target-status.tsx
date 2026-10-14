import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  Target,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type {
  ProspectTargetEntityKind,
  ProspectTargetView,
  TargetEntityLinkConfidence,
  TargetEvidenceReviewStatus,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  targetAssessmentPresentation,
  targetAwaitingAssessment,
  targetEvidenceReviewPresentation,
  type TargetPresentationTone,
} from "./target-presentation";

const ENTITY_KIND_ICON: Record<ProspectTargetEntityKind, LucideIcon> = {
  account: Building2,
  builder: UserRound,
  project: FolderKanban,
};

const TONE_TO_STATUS: Record<TargetPresentationTone, StatusTone> = {
  info: "info",
  warning: "warning",
  success: "success",
  muted: "neutral",
};

/**
 * Each assessment state gets its own icon so states that share a colour
 * (signal-backed and triggered are both blue) never rely on hue alone.
 */
function assessmentIcon(target: ProspectTargetView, requiresEvidenceReview: boolean): LucideIcon {
  if (requiresEvidenceReview) return AlertTriangle;
  switch (target.assessmentState) {
    case "strong_buyer_signal":
      return CheckCircle2;
    case "signal_backed":
      return CircleDot;
    case "triggered":
      return Zap;
    case "high_fit":
      return Target;
    case "rejected":
      return Ban;
  }
}

export function TargetStatusBadge({
  target,
  size = "compact",
}: {
  target: ProspectTargetView;
  size?: "default" | "compact";
}) {
  if (targetAwaitingAssessment(target)) {
    return (
      <StatusBadge tone="neutral" size={size} icon={Clock3}>
        Not yet assessed
      </StatusBadge>
    );
  }

  const presentation = targetAssessmentPresentation(target);
  return (
    <StatusBadge
      tone={TONE_TO_STATUS[presentation.tone]}
      size={size}
      icon={assessmentIcon(target, presentation.requiresEvidenceReview)}
    >
      {presentation.label}
    </StatusBadge>
  );
}

export function EvidenceReviewBadge({ status }: { status: TargetEvidenceReviewStatus }) {
  const review = targetEvidenceReviewPresentation(status);
  return (
    <StatusBadge tone={TONE_TO_STATUS[review.tone]} size="compact">
      {review.label}
    </StatusBadge>
  );
}

const LINK_CONFIDENCE: Record<TargetEntityLinkConfidence, { label: string; tone: StatusTone }> = {
  verified: { label: "Verified link", tone: "success" },
  likely: { label: "Likely link", tone: "info" },
  unverified: { label: "Unverified link", tone: "neutral" },
};

export function LinkConfidenceBadge({ confidence }: { confidence: TargetEntityLinkConfidence }) {
  const presentation = LINK_CONFIDENCE[confidence];
  return (
    <StatusBadge tone={presentation.tone} size="compact">
      {presentation.label}
    </StatusBadge>
  );
}

export function TargetKindMark({
  kind,
  size = "small",
}: {
  kind: ProspectTargetEntityKind;
  size?: "small" | "large";
}) {
  const Icon = ENTITY_KIND_ICON[kind];
  const isLarge = size === "large";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-blue-tint text-primary",
        isLarge ? "size-10 rounded-lg" : "size-7 rounded-md",
      )}
      aria-hidden="true"
    >
      <Icon className={isLarge ? "size-5" : "size-3.5"} />
    </span>
  );
}
