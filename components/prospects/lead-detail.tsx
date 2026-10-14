"use client";

import { useState, type KeyboardEvent } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, CircleCheck, Inbox } from "lucide-react";

import { isHandledLead, isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type {
  LeadFeedbackValue,
  ProspectActionResult,
  QualifiedLeadView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  DetailTabButton,
  MatchDetails,
  ScreenedMatchOutcome,
  SourcePlatformMark,
  exactDateTime,
  formatScore,
  leadTitle,
  relativeTime,
  sourceDisplayName,
  type DetailTab,
} from "@/components/prospects/lead-desk-presentation";
import { LeadOutreach, LeadOutreachActions, ReviewOnlyNotice } from "@/components/prospects/lead-outreach";
import { LeadStatusBadge, leadIntent } from "@/components/prospects/lead-status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEEDBACK_ACTIONS: Array<{ value: LeadFeedbackValue; label: string }> = [
  { value: "good_fit", label: "Good fit" },
  { value: "wrong_buyer", label: "Wrong buyer" },
  { value: "not_relevant", label: "Not relevant" },
];

type LeadDetailProps = {
  lead: QualifiedLeadView;
  /** The tabs this prospect has, in order. Never empty. */
  tabs: readonly DetailTab[];
  /** A Maybe: it can be read and replied to, but not qualified. */
  reviewOnly: boolean;
  feedbackNotice: ProspectActionResult | null;
  feedbackPending: boolean;
  qualificationNotice: ProspectActionResult | null;
  qualificationPending: boolean;
  onSetHandled: (leadId: string, handled: boolean) => void;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onQualify: (leadId: string) => void;
  /** Below xl the detail sits under the list; this returns to the row. */
  onBackToList: () => void;
};

/**
 * One prospect, laid out in the order of the job: read the evidence, reply,
 * open the source, then mark it done. The tab choice survives moving between
 * prospects, falling back to the first tab the next prospect actually has.
 */
export function LeadDetail({
  lead,
  tabs,
  reviewOnly,
  feedbackNotice,
  feedbackPending,
  qualificationNotice,
  qualificationPending,
  onSetHandled,
  onFeedback,
  onQualify,
  onBackToList,
}: LeadDetailProps) {
  // Reply comes first: drafting a response is the job people came to do.
  const [detailTab, setDetailTab] = useState<DetailTab>("reply");
  const isScreened = isScreenedMatch(lead);
  const isHandled = isHandledLead(lead);
  const visibleTabs = tabs;
  const hasReply = visibleTabs.includes("reply");
  const activeTab: DetailTab = visibleTabs.includes(detailTab) ? detailTab : visibleTabs[0];
  const intent = leadIntent(lead);
  const exactEvidence = lead.evidenceExcerpt?.trim() || null;
  const sourceText = lead.sourcePost.text?.trim() || null;
  const postedAt = lead.sourcePost.publishedAt ?? lead.matchedAt;
  const sourceName = sourceDisplayName(lead.sourcePost.source);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: DetailTab) => {
    const currentIndex = visibleTabs.indexOf(tab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % visibleTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = visibleTabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    setDetailTab(nextTab);
    document.getElementById(`signal-detail-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="relative flex flex-1 flex-col gap-4 p-4 md:p-5">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-primary xl:hidden" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        Back to list
      </Button>

      <div className="flex items-start gap-3">
        <SourcePlatformMark source={lead.sourcePost.source} size="detail" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-6 font-semibold text-foreground">{leadTitle(lead)}</h2>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
            <span className="font-medium text-navy-soft">{sourceName}</span>
            {lead.sourcePost.community ? <span className="max-w-full truncate">{lead.sourcePost.community}</span> : null}
            {lead.sourcePost.author ? <span className="max-w-full truncate">by {lead.sourcePost.author}</span> : null}
            <span className="tabular-nums" title={exactDateTime(postedAt)}>{relativeTime(postedAt)}</span>
            {intent ? (
              <span className={cn(intent.strong && "font-medium text-foreground")} title={intent.description}>
                {intent.label}
              </span>
            ) : null}
            {!isScreened ? (
              <span className="tabular-nums" title="Match ranks relevance to your brief. It is not a likelihood of purchase.">
                Match {formatScore(lead.verifierScore)}
              </span>
            ) : null}
          </p>
        </div>
        <LeadStatusBadge lead={lead} />
      </div>

      <ReviewOnlyNotice lead={lead} />

      <ScreenedMatchOutcome lead={lead} />

      <figure className={cn("border-l-2 pl-3", exactEvidence ? "border-primary" : "border-rule-dark")}>
        <figcaption className="text-xs font-medium text-subtle">
          {exactEvidence ? "Verified quote" : "From the post"}
        </figcaption>
        <blockquote className="mt-1 line-clamp-4 text-sm leading-6 text-navy-soft">
          {exactEvidence ?? sourceText ?? "No text was kept for this post. Open the source to read it."}
        </blockquote>
      </figure>

      <div>
        <div className="flex gap-5 border-b border-border" role="tablist" aria-label="Prospect details">
          {hasReply ? (
            <DetailTabButton active={activeTab === "reply"} tab="reply" onClick={() => setDetailTab("reply")} onKeyDown={handleTabKeyDown}>
              Reply
            </DetailTabButton>
          ) : null}
          <DetailTabButton active={activeTab === "match"} tab="match" onClick={() => setDetailTab("match")} onKeyDown={handleTabKeyDown}>
            {isScreened ? "Why it was screened out" : "Why it matched"}
          </DetailTabButton>
          <DetailTabButton active={activeTab === "evidence"} tab="evidence" onClick={() => setDetailTab("evidence")} onKeyDown={handleTabKeyDown}>
            Original post
          </DetailTabButton>
        </div>

        <div
          id={`signal-detail-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`signal-detail-tab-${activeTab}`}
          tabIndex={0}
          className="mt-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {activeTab === "reply" ? <LeadOutreach key={`outreach-${lead.id}`} lead={lead} /> : null}
          {activeTab === "match" ? <MatchDetails lead={lead} /> : null}
          {activeTab === "evidence" ? (
            <p className="max-h-72 overflow-y-auto text-sm leading-6 break-words whitespace-pre-wrap text-navy-soft">
              {sourceText ?? "No text was kept for this post. Open the source to read it."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-auto space-y-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <LeadOutreachActions
            lead={lead}
            reviewOnly={reviewOnly}
            sourceIsPrimary={!hasReply}
            qualificationPending={qualificationPending}
            onQualify={onQualify}
          />
          {!isScreened ? (
            <Button type="button" variant="outline" className="sm:ml-auto" onClick={() => onSetHandled(lead.id, !isHandled)}>
              {isHandled ? <Inbox aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
              {isHandled ? "Move to inbox" : "Done"}
            </Button>
          ) : null}
        </div>
        {qualificationNotice ? <ActionMessage notice={qualificationNotice} /> : null}

        <div>
          <p id="prospect-feedback-label" className="text-xs font-medium text-muted-foreground">
            Was this a good match? Your answer tunes future scans.
          </p>
          <div role="group" aria-labelledby="prospect-feedback-label" className="mt-2 flex flex-wrap gap-2">
            {FEEDBACK_ACTIONS.map((action) => (
              <Button
                key={action.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onFeedback(lead.id, action.value)}
                disabled={feedbackPending}
              >
                {action.label}
              </Button>
            ))}
          </div>
          {feedbackPending ? (
            <p className="mt-2 text-xs text-subtle" role="status">Saving feedback…</p>
          ) : feedbackNotice ? (
            <div className="mt-2"><ActionMessage notice={feedbackNotice} /></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionMessage({ notice }: { notice: ProspectActionResult }) {
  const Icon = notice.ok ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={notice.ok ? "status" : "alert"}
      className={cn("flex items-start gap-1.5 text-xs leading-5", notice.ok ? "text-success" : "text-danger")}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {notice.message}
    </p>
  );
}
