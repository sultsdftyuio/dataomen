import { BadgeCheck, CheckCircle2, CircleHelp, CircleSlash, type LucideIcon } from "lucide-react";

import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import { isPotentialBuyer, isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

export type LeadStatusPresentation = {
  label: string;
  description: string;
  tone: StatusTone;
  icon: LucideIcon;
};

/**
 * Where a prospect stands: its bucket, or your own verdict once you qualify
 * it. Intent is a separate axis (see `leadIntent`) so one colour never means
 * two things. Labels match `leadCategoryLabel` so the vocabulary stays one.
 */
export function leadStatus(lead: QualifiedLeadView): LeadStatusPresentation {
  if (isScreenedMatch(lead)) {
    return {
      label: "Screened out",
      description: "Automated review didn't find a close enough fit.",
      tone: "neutral",
      icon: CircleSlash,
    };
  }
  if (lead.matchStatus === "qualified") {
    return {
      label: "Qualified",
      description: "You marked this prospect qualified.",
      tone: "success",
      icon: CheckCircle2,
    };
  }
  if (isPotentialBuyer(lead)) {
    return {
      label: "Maybe",
      description: "Plausible but not verified. Read the original post before replying.",
      tone: "warning",
      icon: CircleHelp,
    };
  }
  return {
    label: "Lead",
    description: "A clear, verified buyer problem. Not a confirmed customer.",
    tone: "info",
    icon: BadgeCheck,
  };
}

export type LeadIntent = { label: string; description: string; strong: boolean };

/** How ready the person sounds. Shown as text next to Match %, never as a second badge. */
export function leadIntent(lead: QualifiedLeadView): LeadIntent | null {
  if (isScreenedMatch(lead)) return null;
  if (lead.intentTier === "high") {
    return { label: "High intent", description: "A direct request or active evaluation. Review first.", strong: true };
  }
  if (lead.intentTier === "warm") {
    return { label: "Warm", description: "Relevant frustration or workflow pain.", strong: false };
  }
  if (lead.intentTier === "exploratory") {
    return { label: "Exploratory", description: "A related discussion, useful for research or later outreach.", strong: false };
  }
  return null;
}

export function LeadStatusBadge({
  lead,
  size = "default",
}: {
  lead: QualifiedLeadView;
  size?: "default" | "compact";
}) {
  const status = leadStatus(lead);
  return (
    <span title={status.description} className="inline-flex shrink-0">
      <StatusBadge tone={status.tone} icon={status.icon} size={size}>
        {status.label}
      </StatusBadge>
    </span>
  );
}
