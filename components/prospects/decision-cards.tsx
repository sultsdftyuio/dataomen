"use client";

import type { ReactNode } from "react";

import {
  isHandledLead,
  isScreenedMatch,
  isVerifiedLead,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { LeadFeedbackValue, QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import { ArcDismissIcon, ArcDoneIcon, ArcLogoIcon } from "@/components/dashboard/arc-icons";
import { cn } from "@/lib/utils";

type DecisionCardsProps = {
  lead: QualifiedLeadView;
  /** A Maybe: it can be read and replied to, but not qualified. */
  reviewOnly: boolean;
  feedbackPending: boolean;
  qualificationPending: boolean;
  onQualify: (leadId: string) => void;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onSetHandled: (leadId: string, handled: boolean) => void;
};

const NOT_A_FIT_REASONS: Array<{ value: LeadFeedbackValue; label: string }> = [
  { value: "wrong_buyer", label: "Wrong buyer" },
  { value: "not_relevant", label: "Not relevant" },
];

/**
 * "Your call" for one prospect, as choice cards. Each card is one action the
 * product already has: qualify, feedback, or mark done.
 *
 * Only a verifier-confirmed lead can be qualified (which can also export it
 * to a CRM). The server and RLS policy enforce the same boundary; keeping it
 * explicit here prevents a misleading action on a Maybe or a screened-out
 * record, which get a "Good fit" feedback card instead.
 */
export function DecisionCards({
  lead,
  reviewOnly,
  feedbackPending,
  qualificationPending,
  onQualify,
  onFeedback,
  onSetHandled,
}: DecisionCardsProps) {
  const isScreened = isScreenedMatch(lead);
  const isHandled = isHandledLead(lead);
  const isQualified = lead.matchStatus === "qualified";
  const isReviewOnly = reviewOnly || lead.matchStatus === "discovery_candidate" || !isVerifiedLead(lead);
  const canQualify = !isReviewOnly && !isQualified;

  const fitCard = isScreened ? (
    <ChoiceCard
      icon={<ArcLogoIcon size={20} accent="var(--c-blue)" />}
      title="Should be a signal"
      description="Tell Arcli it missed this one."
      disabled={feedbackPending}
      onSelect={() => onFeedback(lead.id, "good_fit")}
    />
  ) : isQualified ? (
    <ChoiceCard
      icon={<ArcLogoIcon size={20} accent="var(--c-blue)" />}
      title="Qualified"
      description="You marked this signal qualified."
      selected
      disabled
    />
  ) : canQualify ? (
    <ChoiceCard
      icon={<ArcLogoIcon size={20} accent="var(--c-blue)" />}
      title={qualificationPending ? "Qualifying…" : "Worth contacting"}
      description="Marks it qualified."
      disabled={qualificationPending}
      onSelect={() => onQualify(lead.id)}
    />
  ) : (
    <ChoiceCard
      icon={<ArcLogoIcon size={20} accent="var(--c-blue)" />}
      title="Good fit"
      description="Not verified, so it can't be qualified yet. Tells Arcli it fits."
      disabled={feedbackPending}
      onSelect={() => onFeedback(lead.id, "good_fit")}
    />
  );

  return (
    <section aria-labelledby="your-call-heading" className="space-y-3">
      <h3 id="your-call-heading" className="text-sm font-semibold text-foreground">Your call</h3>
      <div className={cn("grid gap-3", isScreened ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {fitCard}

        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl p-4",
            isScreened ? "bg-off-white ring-2 ring-navy" : "bg-card ring-1 ring-border",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <CardIcon><ArcDismissIcon size={20} accent="var(--c-blue)" /></CardIcon>
            {isScreened ? (
              <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">Arcli suggests</span>
            ) : null}
          </div>
          <div>
            <p id={`not-fit-${lead.id}`} className="text-[15px] font-semibold text-foreground">Not a fit</p>
            <p className="text-sm leading-5 text-muted-foreground">
              {isScreened ? "Agree, and tell Arcli why." : "Tell Arcli why. It tunes future scans."}
            </p>
          </div>
          <div role="group" aria-labelledby={`not-fit-${lead.id}`} className="flex flex-wrap gap-2">
            {NOT_A_FIT_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                disabled={feedbackPending}
                onClick={() => onFeedback(lead.id, reason.value)}
                className="min-h-9 rounded-full bg-card px-3.5 text-sm font-medium text-navy-soft ring-1 ring-rule-dark ring-inset transition-colors hover:bg-blue-tint hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>

        {isScreened ? null : (
          <ChoiceCard
            icon={<ArcDoneIcon size={20} accent="var(--c-blue)" />}
            title={isHandled ? "Move to inbox" : "Done"}
            description={isHandled ? "Bring it back for review." : "Reviewed. Clears it from your inbox."}
            onSelect={() => onSetHandled(lead.id, !isHandled)}
          />
        )}
      </div>
    </section>
  );
}

function CardIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-lg bg-blue-pale text-navy" aria-hidden="true">
      {children}
    </span>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  selected = false,
  disabled = false,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        selected ? "bg-off-white ring-2 ring-navy" : "bg-card ring-1 ring-border hover:bg-blue-tint",
        disabled && !selected && "opacity-60",
      )}
    >
      <CardIcon>{icon}</CardIcon>
      <span>
        <span className="block text-[15px] font-semibold text-foreground">{title}</span>
        <span className="block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
