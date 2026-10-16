"use client";

import { useState, type KeyboardEvent } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";

import type {
  LeadFeedbackValue,
  ProspectActionResult,
  QualifiedLeadView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { DecisionCards } from "@/components/prospects/decision-cards";
import { EvidenceChain } from "@/components/prospects/evidence-chain";
import {
  DetailTabButton,
  leadTitle,
  sourceDisplayName,
  type DetailTab,
} from "@/components/prospects/lead-desk-presentation";
import { LeadOutreach, ReviewOnlyNotice } from "@/components/prospects/lead-outreach";
import { LeadVerdict } from "@/components/prospects/lead-verdict";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
 * One prospect, in the order of the job: Arcli's verdict first, then the
 * checks behind it, the reply draft, and your call. The "why it matched"
 * tab is gone because the evidence chain shows that reasoning inline.
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
  const visibleTabs: readonly DetailTab[] = tabs.filter((tab) => tab !== "match");
  const hasReply = visibleTabs.includes("reply");
  const activeTab: DetailTab = visibleTabs.includes(detailTab) ? detailTab : visibleTabs[0] ?? "evidence";
  const sourceText = lead.sourcePost.text?.trim() || null;
  const title = leadTitle(lead);

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

  const fullPost = (
    <p className="max-h-72 overflow-y-auto text-sm leading-6 break-words whitespace-pre-wrap text-navy-soft">
      {sourceText ?? "No text was kept for this post. Open the source to read it."}
    </p>
  );

  return (
    <div className="relative flex flex-1 flex-col gap-5 p-4 md:p-6">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit text-primary xl:hidden" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        Back to list
      </Button>

      <div className="space-y-3">
        <LeadVerdict lead={lead} />
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em] text-foreground">
          {lead.sourcePost.url ? (
            <a
              href={lead.sourcePost.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {title}
              <ExternalLink className="ml-1.5 inline size-4 align-[-2px] text-subtle" aria-hidden="true" />
              <span className="sr-only"> (opens {sourceDisplayName(lead.sourcePost.source)} in a new tab)</span>
            </a>
          ) : title}
        </h2>
      </div>

      <ReviewOnlyNotice lead={lead} />

      <EvidenceChain lead={lead} />

      {hasReply ? (
        <div>
          <div className="flex gap-5 border-b border-border" role="tablist" aria-label="Prospect details">
            <DetailTabButton active={activeTab === "reply"} tab="reply" onClick={() => setDetailTab("reply")} onKeyDown={handleTabKeyDown}>
              Reply draft
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
            {activeTab === "reply" ? <LeadOutreach key={`outreach-${lead.id}`} lead={lead} /> : fullPost}
          </div>
        </div>
      ) : (
        // No reply to draft (a screened-out post): the whole post stays one
        // click away instead of sitting in a tab of its own.
        <details className="group rounded-md">
          <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Read the whole post
          </summary>
          <div className="mt-3">{fullPost}</div>
        </details>
      )}

      <div className="mt-auto space-y-3 border-t border-border pt-5">
        <DecisionCards
          lead={lead}
          reviewOnly={reviewOnly}
          feedbackPending={feedbackPending}
          qualificationPending={qualificationPending}
          onQualify={onQualify}
          onFeedback={onFeedback}
          onSetHandled={onSetHandled}
        />
        {qualificationNotice ? <ActionMessage notice={qualificationNotice} /> : null}
        {feedbackPending ? (
          <p className="text-xs text-subtle" role="status">Saving feedback…</p>
        ) : feedbackNotice ? (
          <ActionMessage notice={feedbackNotice} />
        ) : null}
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
