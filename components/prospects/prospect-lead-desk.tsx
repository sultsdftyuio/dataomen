"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

import { ContextLayout } from "@/components/dashboard/ContextLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import { EmptyQueue } from "@/components/prospects/empty-queue";
import { HandledNoticeBar } from "@/components/prospects/handled-notice";
import { LeadDetail } from "@/components/prospects/lead-detail";
import { QueueSortSelect, QueueToolbar, type QueueCounts } from "@/components/prospects/queue-toolbar";
import { ScanActivityDialog, type ManualScanControl } from "@/components/prospects/scan-activity-dialog";
import { ProfileHealthBanner } from "@/components/prospects/profile-health-banner";
import { SignalsPanel } from "@/components/prospects/signals-panel";
import { profileHealthIssue } from "@/app/(dashboard)/dashboard/profile-health";
import { DETAIL_TABS, LeadRow, freshnessLabel, metricValue } from "@/components/prospects/lead-desk-presentation";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import {
  isHandledLead,
  isPotentialBuyer,
  isScreenedMatch,
  type LeadQueueConfidence,
  type LeadQueueFilter,
  type LeadQueueSort,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type {
  BuyerGroupActivationAction,
  BuyerDemandReportView,
  CrawlJobView,
  HandledNotice,
  LeadFeedbackValue,
  ProspectActionResult,
  QualifiedLeadView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

const VIEW_TITLES: Record<LeadQueueFilter, string> = {
  all: "Inbox",
  leads: "Signals",
  potential: "Maybes",
  done: "Done",
  screened: "Screened out",
};

type ProspectLeadDeskProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  leads: QualifiedLeadView[];
  potentialBuyers: QualifiedLeadView[];
  buyerGroupSuggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: BuyerGroupActivationAction;
  /** Every stored record, including done and screened out. */
  queueItemCount: number;
  screenedMatches: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  filteredQueueItems: QualifiedLeadView[];
  selectedLead: QualifiedLeadView | null;
  selectedLeadId: string | null;
  queueQuery: string;
  queueFilter: LeadQueueFilter;
  queueSort: LeadQueueSort;
  queueConfidence: LeadQueueConfidence;
  queueSource: string;
  queueSources: string[];
  isRefreshing: boolean;
  isProfileRebuildPending: boolean;
  lastUpdatedAt: Date | null;
  profileRebuildResult: ProspectActionResult | null;
  feedbackNotice: ProspectActionResult | null;
  feedbackPending: boolean;
  qualificationPending: boolean;
  qualificationNotice: ProspectActionResult | null;
  handledNotice: HandledNotice | null;
  /** Operator-only on-demand scan; null for customers. */
  manualScan: ManualScanControl | null;
  onRefresh: () => void;
  onRebuildProfile: () => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: LeadQueueFilter) => void;
  onSortChange: (value: LeadQueueSort) => void;
  onConfidenceChange: (value: LeadQueueConfidence) => void;
  onSourceChange: (value: string) => void;
  onSelectLead: (leadId: string) => void;
  /** A deliberate click on a lead, as opposed to automatic selection. */
  onLeadOpened: (leadId: string) => void;
  onSetHandled: (leadId: string, handled: boolean) => void;
  onDismissHandledNotice: () => void;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onQualify: (leadId: string) => void;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ProspectLeadDesk({
  serviceProfile,
  crawlJob,
  leads,
  potentialBuyers,
  buyerGroupSuggestions,
  activateBuyerGroup,
  queueItemCount,
  screenedMatches,
  buyerDemandReport,
  filteredQueueItems,
  selectedLead,
  selectedLeadId,
  queueQuery,
  queueFilter,
  queueSort,
  queueConfidence,
  queueSource,
  queueSources,
  isRefreshing,
  isProfileRebuildPending,
  lastUpdatedAt,
  profileRebuildResult,
  feedbackNotice,
  feedbackPending,
  qualificationPending,
  qualificationNotice,
  handledNotice,
  manualScan,
  onRefresh,
  onRebuildProfile,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onConfidenceChange,
  onSourceChange,
  onSelectLead,
  onLeadOpened,
  onSetHandled,
  onDismissHandledNotice,
  onFeedback,
  onQualify,
}: ProspectLeadDeskProps) {
  const [scanActivityOpen, setScanActivityOpen] = useState(false);
  const signalDetailRef = useRef<HTMLElement>(null);
  const profileDomain = serviceProfile.websiteUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "") ?? null;
  const healthIssue = profileHealthIssue(crawlJob, serviceProfile);
  const isScreenedAudit = queueFilter === "screened";
  const openLeads = leads.filter((lead) => !isHandledLead(lead)).length;
  const openMaybes = potentialBuyers.filter((lead) => !isHandledLead(lead)).length;
  const doneCount = [...leads, ...potentialBuyers].filter(isHandledLead).length;
  const counts: QueueCounts = {
    all: openLeads + openMaybes,
    leads: openLeads,
    potential: openMaybes,
    done: doneCount,
    screened: screenedMatches.length,
  };
  // Sort only reorders, so it never counts as a filter or blocks "caught up".
  const activeFilterCount =
    Number(queueQuery.trim().length > 0) +
    Number(queueConfidence !== "all") +
    Number(queueSource !== "all");
  const hasActiveFilters = activeFilterCount > 0;
  const hasItems = filteredQueueItems.length > 0;
  // Screened records and Maybes have no reply to draft, so their detail opens
  // on the evidence instead of an empty Reply tab.
  const selectedIsScreened = selectedLead ? isScreenedMatch(selectedLead) : false;
  const selectedHasReply = Boolean(selectedLead?.suggestedReply.trim());
  const detailTabs = DETAIL_TABS
    .filter((tab) => tab !== "reply" || !selectedIsScreened)
    .filter((tab) => tab !== "reply" || selectedHasReply);
  const resultSummary = `${metricValue(filteredQueueItems.length)} ${
    filteredQueueItems.length === 1 ? "signal" : "signals"
  } shown`;

  const clearFilters = () => {
    onQueryChange("");
    onConfidenceChange("all");
    onSourceChange("all");
    if (queueFilter === "screened") onFilterChange("all");
  };
  const showQueueCategory = (category: LeadQueueFilter) => {
    onQueryChange("");
    onConfidenceChange("all");
    onSourceChange("all");
    onFilterChange(category);
  };

  // When the selection moves on its own (after Done, or a refresh), keep the
  // new row in view inside the desktop list. Below xl the list is part of the
  // page, so scrolling there would pull people away from the detail.
  useEffect(() => {
    if (!selectedLeadId || !window.matchMedia("(min-width: 1280px)").matches) return;
    document
      .querySelector(`#prospect-signal-list [data-lead-id="${CSS.escape(selectedLeadId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedLeadId]);

  const selectLead = (leadId: string) => {
    onSelectLead(leadId);
    onLeadOpened(leadId);

    // The detail panel follows the queue below xl. Moving there after an
    // explicit selection keeps the mobile review workflow contiguous.
    if (!window.matchMedia("(max-width: 1279px)").matches) return;

    window.requestAnimationFrame(() => {
      signalDetailRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  // Return to the row just reviewed, not the top of the list, so working
  // down a long queue on a phone doesn't mean scrolling back each time.
  const backToList = () => {
    const row = selectedLeadId
      ? document.querySelector<HTMLButtonElement>(
          `#prospect-signal-list [data-lead-id="${CSS.escape(selectedLeadId)}"]`,
        )
      : null;
    const target = row ?? document.getElementById("prospect-signal-list");
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    row?.focus({ preventScroll: true });
  };

  return (
    // fill: the list and the detail scroll separately, so the desk holds the
    // window's height. Phones keep the toolbar's view tabs instead of the panel.
    <ContextLayout
      label="Signals overview"
      fill
      hidePanelOnPhone
      panel={<SignalsPanel view={queueFilter} counts={counts} report={buyerDemandReport} onShowView={onFilterChange} />}
      header={
        <PageHeader
          title="Signals"
          description="Public conversations where someone asks for a tool like yours or describes the problem you solve."
          meta={
            <span className="flex flex-wrap gap-x-3">
              {profileDomain ? <span>Targeting {profileDomain}</span> : null}
              <span aria-live="polite">{isRefreshing ? "Updating…" : freshnessLabel(lastUpdatedAt)}</span>
            </span>
          }
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setScanActivityOpen(true)}>
                Scan activity
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/brief">Edit targeting</Link>
              </Button>
            </>
          }
        />
      }
    >
      <div className="arc-pro-lead-desk flex min-h-0 w-full flex-1 flex-col gap-4">

        {healthIssue ? (
          <ProfileHealthBanner
            issue={healthIssue}
            serviceProfileId={serviceProfile.id}
            isRebuildPending={isProfileRebuildPending}
            onRebuildProfile={onRebuildProfile}
            onRetried={onRefresh}
          />
        ) : null}

        {profileRebuildResult && !scanActivityOpen ? (
          <p
            role={profileRebuildResult.ok ? "status" : "alert"}
            className={cn(
              "flex shrink-0 items-start gap-1.5 text-sm",
              profileRebuildResult.ok ? "text-success" : "text-danger",
            )}
          >
            {profileRebuildResult.ok
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            {profileRebuildResult.message}
          </p>
        ) : null}

        <section
          aria-label="Signal review"
          // Only a populated desk stretches to the viewport; an empty one stays
          // its natural height so the buyer groups below remain in view.
          className={cn(
            "relative flex shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
            hasItems && "xl:min-h-[520px] xl:flex-1 xl:shrink",
          )}
        >
          <QueueToolbar
            view={queueFilter}
            counts={counts}
            query={queueQuery}
            confidence={queueConfidence}
            source={queueSource}
            sources={queueSources}
            activeFilterCount={activeFilterCount + Number(isScreenedAudit)}
            onViewChange={onFilterChange}
            onQueryChange={onQueryChange}
            onConfidenceChange={onConfidenceChange}
            onSourceChange={onSourceChange}
            onClearFilters={clearFilters}
          />

          {handledNotice ? (
            <HandledNoticeBar notice={handledNotice} onSetHandled={onSetHandled} onDismiss={onDismissHandledNotice} />
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {resultSummary}
          </p>

          {hasItems ? (
            <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(320px,.85fr)_minmax(440px,1.15fr)]">
              <div className="relative flex min-h-0 min-w-0 flex-col border-b border-border xl:border-r xl:border-b-0">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 md:px-5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{VIEW_TITLES[queueFilter]}</h2>
                    <span className="text-xs tabular-nums text-subtle" aria-hidden="true">
                      {metricValue(filteredQueueItems.length)} shown
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <QueueSortSelect value={queueSort} onChange={onSortChange} />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label="Reload signals"
                      title="Reload signals"
                      onClick={onRefresh}
                      disabled={isRefreshing}
                    >
                      <RefreshCw className={cn("size-4", isRefreshing && "motion-safe:animate-spin")} aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <p id="prospect-list-help" className="sr-only">Use the arrow keys, Home or End to move through signals.</p>
                <div
                  id="prospect-signal-list"
                  aria-describedby="prospect-list-help"
                  className="min-h-0 flex-1 divide-y divide-border xl:overflow-y-auto"
                  onKeyDown={(event) => {
                    if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.leadId) return;
                    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-lead-id]"));
                    const currentIndex = rows.indexOf(event.target);
                    const nextIndex = event.key === "Home" ? 0
                      : event.key === "End" ? rows.length - 1
                      : Math.max(0, Math.min(rows.length - 1, currentIndex + (event.key === "ArrowDown" ? 1 : -1)));
                    const nextRow = rows[nextIndex];
                    if (!nextRow?.dataset.leadId) return;
                    event.preventDefault();
                    nextRow.focus();
                    onSelectLead(nextRow.dataset.leadId);
                  }}
                >
                  {filteredQueueItems.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      selected={lead.id === selectedLeadId}
                      onSelect={() => selectLead(lead.id)}
                    />
                  ))}
                </div>
              </div>

              <aside
                ref={signalDetailRef}
                className="relative flex min-h-0 min-w-0 scroll-mt-4 flex-col xl:overflow-y-auto"
                aria-label="Signal details"
              >
                {selectedLead ? (
                  <LeadDetail
                    lead={selectedLead}
                    tabs={detailTabs}
                    reviewOnly={isPotentialBuyer(selectedLead)}
                    feedbackNotice={feedbackNotice}
                    feedbackPending={feedbackPending}
                    qualificationNotice={qualificationNotice}
                    qualificationPending={qualificationPending}
                    onSetHandled={onSetHandled}
                    onFeedback={onFeedback}
                    onQualify={onQualify}
                    onBackToList={backToList}
                  />
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">
                    Select a signal to see the evidence and a suggested reply.
                  </p>
                )}
              </aside>
            </div>
          ) : (
            <EmptyQueue
              hasProfile={serviceProfile.hasProfile}
              hasActiveFilters={hasActiveFilters}
              query={queueQuery}
              view={queueFilter}
              inboxCount={counts.all}
              screenedMatchCount={screenedMatches.length}
              doneCount={doneCount}
              report={buyerDemandReport}
              onOpenDone={() => showQueueCategory("done")}
              onShowInbox={() => showQueueCategory("all")}
              onClearFilters={clearFilters}
              onOpenScanActivity={() => setScanActivityOpen(true)}
              onOpenScreenedAudit={() => showQueueCategory("screened")}
            />
          )}
        </section>

        <WebsiteDemandMap
          suggestions={buyerGroupSuggestions}
          activateBuyerGroup={activateBuyerGroup}
          collapsible
          defaultExpanded={queueItemCount === 0}
        />

        <ScanActivityDialog
          open={scanActivityOpen}
          onOpenChange={setScanActivityOpen}
          report={buyerDemandReport}
          onRefresh={onRefresh}
          manualScan={manualScan}
          profileRebuild={{
            pending: isProfileRebuildPending,
            available: Boolean(serviceProfile.websiteUrl),
            result: profileRebuildResult,
            onStart: onRebuildProfile,
          }}
        />
      </div>
    </ContextLayout>
  );
}
