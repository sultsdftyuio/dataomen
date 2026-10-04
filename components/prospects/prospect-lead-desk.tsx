"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  Check,
  CircleCheckBig,
  ChevronRight,
  SlidersHorizontal,
  ExternalLink,
  Globe2,
  Network,
  RefreshCw,
  Radar,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import { EmptyQueue } from "@/components/prospects/empty-queue";
import { ScanActivityDialog } from "@/components/prospects/scan-activity-dialog";
import {
  DETAIL_TABS, DetailSection, DetailStat, DetailTabButton, InsightCard, LeadControlSelect,
  LeadRow, Metric, ScreenedMatchOutcome, SignalPoint, SourceContextItem, SourcePlatformBadge,
  SourcePlatformMark, exactDateTime, formatScore, freshnessLabel, leadStatus, metricValue,
  relativeTime, signalLabel, sourceConversationType, sourceDisplayName,
  type DetailTab,
} from "@/components/prospects/lead-desk-presentation";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import {
  isScreenedMatch,
  type LeadQueueFilter,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type {
  BuyerGroupActivationAction,
  BuyerDemandReportView,
  LeadFeedbackValue,
  ProspectActionResult,
  QualifiedLeadView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

type QueueFilter = LeadQueueFilter;
type QueueSort = "priority" | "newest" | "confidence";
type QueueConfidenceFilter = "all" | "high" | "sixty_plus";
type ProspectLeadDeskProps = {
  serviceProfile: ServiceProfileView;
  leads: QualifiedLeadView[];
  potentialBuyers: QualifiedLeadView[];
  buyerGroupSuggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: BuyerGroupActivationAction;
  reviewedConversationCount: number;
  screenedMatches: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  filteredQueueItems: QualifiedLeadView[];
  selectedLead: QualifiedLeadView | null;
  selectedLeadId: string | null;
  queueQuery: string;
  queueFilter: QueueFilter;
  queueSort: QueueSort;
  queueConfidence: QueueConfidenceFilter;
  queueSource: string;
  queueSources: string[];
  isRefreshing: boolean;
  isProfileRebuildPending: boolean;
  lastUpdatedAt: Date | null;
  profileRebuildResult: ProspectActionResult | null;
  feedbackNotice: { message: string; ok: boolean } | null;
  feedbackPending: boolean;
  qualificationPending: boolean;
  qualificationMessage: string | null;
  onRefresh: () => void;
  onRebuildProfile: () => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: QueueFilter) => void;
  onSortChange: (value: QueueSort) => void;
  onConfidenceChange: (value: QueueConfidenceFilter) => void;
  onSourceChange: (value: string) => void;
  onSelectLead: (leadId: string) => void;
  onOpenFocusedReview: () => void;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onQualify: (leadId: string) => void;
};

const FEEDBACK_ACTIONS: Array<{
  value: LeadFeedbackValue;
  label: string;
}> = [
  { value: "good_fit", label: "Good fit" },
  { value: "wrong_buyer", label: "Wrong buyer" },
  { value: "not_relevant", label: "Not relevant" },
];

export function ProspectLeadDesk({
  serviceProfile,
  leads,
  potentialBuyers,
  buyerGroupSuggestions,
  activateBuyerGroup,
  reviewedConversationCount,
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
  qualificationMessage,
  onRefresh,
  onRebuildProfile,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onConfidenceChange,
  onSourceChange,
  onSelectLead,
  onOpenFocusedReview,
  onFeedback,
  onQualify,
}: ProspectLeadDeskProps) {
  const [detailTab, setDetailTab] = useState<DetailTab>("match");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanActivityOpen, setScanActivityOpen] = useState(false);
  const signalDetailRef = useRef<HTMLElement>(null);
  const profileDomain = serviceProfile.websiteUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "") ?? "Your matching brief";
  const selectedStatus = selectedLead ? leadStatus(selectedLead) : null;
  const exactEvidence = selectedLead?.evidenceExcerpt?.trim() || null;
  const sourceText = selectedLead?.sourcePost.text?.trim() || null;
  const isScreenedAudit = queueFilter === "screened";
  const hasActiveFilters =
    queueQuery.length > 0 ||
    queueFilter !== "all" ||
    queueConfidence !== "all" ||
    queueSource !== "all" ||
    queueSort !== "priority";
  const advancedFilterCount = Number(queueFilter !== "all") + Number(queueConfidence !== "all") +
    Number(queueSource !== "all") + Number(queueSort !== "priority");
  const resultSummary = `${filteredQueueItems.length} ${
    filteredQueueItems.length === 1 ? "signal" : "signals"
  } shown`;
  const metricActive = (category: QueueFilter) =>
    queueFilter === category && !queueQuery.trim() && queueConfidence === "all" && queueSource === "all";

  const clearFilters = () => {
    onQueryChange("");
    onFilterChange("all");
    onConfidenceChange("all");
    onSourceChange("all");
    onSortChange("priority");
  };
  const showQueueCategory = (category: QueueFilter) => {
    onQueryChange("");
    onConfidenceChange("all");
    onSourceChange("all");
    onFilterChange(category);
  };

  const selectLead = (leadId: string) => {
    onSelectLead(leadId);

    // The detail panel follows the queue below xl. Moving there after an
    // explicit selection keeps the mobile review workflow contiguous.
    if (!window.matchMedia("(max-width: 1279px)").matches) return;

    window.requestAnimationFrame(() => {
      signalDetailRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  };

  const handleDetailTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tab: DetailTab,
  ) => {
    const currentIndex = DETAIL_TABS.indexOf(tab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % DETAIL_TABS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = DETAIL_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = DETAIL_TABS[nextIndex];
    setDetailTab(nextTab);
    document.getElementById(`signal-detail-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="arc-pro-lead-desk flex w-full flex-col gap-2.5 sm:gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto" style={{ color: C.text }}>
      <header className="flex shrink-0 flex-col gap-2 border-b pb-2 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: C.rule }}>
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="pfd shrink-0 text-2xl leading-none sm:text-[28px]" style={{ color: C.navy }}>
            Prospects
          </h1>
          <p className="max-w-4xl text-[12px] leading-5" style={{ color: C.navySoft }}>
            Review source-linked signals from {metricValue(reviewedConversationCount)} assessed conversations. Match strength measures relevance, not purchase likelihood.
          </p>
        </div>

        <section
          aria-label="Matching brief"
          className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 lg:w-[280px]"
          style={{ borderColor: C.rule, backgroundColor: C.white }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: C.blueTint, color: C.blue }}>
            <Globe2 className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>Targeting</p>
            <p className="truncate text-[13px] font-semibold" style={{ color: C.navy }}>{profileDomain}</p>
          </div>
        </section>
      </header>

      <section aria-label="Find and filter signals" className="shrink-0 rounded-lg border bg-white p-2.5 sm:p-3" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Search public signals</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: C.faint }} aria-hidden="true" />
            <input
              type="search"
              value={queueQuery}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search topic, source, author, or problem"
              className="h-10 w-full rounded-md border bg-white py-2 pr-3 pl-9 text-sm outline-none transition focus-visible:ring-2"
              style={{ borderColor: C.ruleDark, color: C.text, outlineColor: C.blueLight }}
            />
          </label>
          <Button type="button" variant="outline" className="h-10 border-[#C8D9E8]" aria-expanded={filtersOpen} aria-controls="prospect-advanced-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
          </Button>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" className="h-10 px-2 text-xs" onClick={clearFilters} style={{ color: C.blue }}>
              Clear all
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-10 whitespace-nowrap border-[#C8D9E8] text-[#17324D] hover:bg-[#F4F8FC]">
            <Link href="/dashboard/brief">Edit matching brief</Link>
          </Button>
          <Button type="button" variant="ghost" className="h-10 px-2 text-xs" onClick={() => setScanActivityOpen(true)} style={{ color: C.blue }}>
            Scan activity
          </Button>
        </div>

        <div id="prospect-advanced-filters" hidden={!filtersOpen} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]" style={{ borderColor: C.rule, display: filtersOpen ? "grid" : "none" }}>
          <LeadControlSelect label="View" value={queueFilter} onChange={(value) => onFilterChange(value as QueueFilter)}>
            <option value="all">Opportunity inbox</option>
            <option value="leads">Strong signals</option>
            <option value="potential">Relevant signals</option>
            <option value="screened">Screened-out audit</option>
          </LeadControlSelect>
          <LeadControlSelect label="Match strength" value={queueConfidence} onChange={(value) => onConfidenceChange(value as QueueConfidenceFilter)}>
            <option value="all">All levels</option>
            <option value="high">High (80%+)</option>
            <option value="sixty_plus">60%+ strength</option>
          </LeadControlSelect>
          <LeadControlSelect label="Source" value={queueSource} onChange={onSourceChange}>
            <option value="all">All sources</option>
            {queueSources.map((source) => (
              <option key={source} value={source}>{sourceDisplayName(source)}</option>
            ))}
          </LeadControlSelect>
          <LeadControlSelect label="Sort" value={queueSort} onChange={(value) => onSortChange(value as QueueSort)}>
            <option value="priority">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="confidence">Match strength</option>
          </LeadControlSelect>
          <div className="sm:col-span-2 xl:col-span-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 whitespace-nowrap border-[#C8D9E8] text-[#17324D] hover:bg-[#F4F8FC]"
              disabled={isProfileRebuildPending || !serviceProfile.websiteUrl}
              onClick={onRebuildProfile}
              title="Re-crawl the current website and rebuild its AI profile"
            >
              <RefreshCw className={cn("size-3.5", isProfileRebuildPending && "animate-spin")} aria-hidden="true" />
              {isProfileRebuildPending ? "Rebuilding..." : "Rebuild AI profile"}
            </Button>
          </div>
        </div>
      </section>

      {profileRebuildResult ? (
        <p
          role="status"
          className="shrink-0 text-xs"
          style={{ color: profileRebuildResult.ok ? C.green : C.red }}
        >
          {profileRebuildResult.message}
        </p>
      ) : null}

      <section
        aria-label="Lead discovery summary"
        className="shrink-0 grid divide-y overflow-hidden rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        <Metric label="Inbox signals" value={metricValue(leads.length + potentialBuyers.length)} icon={<Radar className="size-5" />} active={metricActive("all")} onClick={() => showQueueCategory("all")} />
        <Metric label="Strong signals" value={metricValue(leads.length)} icon={<CircleCheckBig className="size-5" />} active={metricActive("leads")} onClick={() => showQueueCategory("leads")} />
        <Metric label="Relevant opportunities" value={metricValue(potentialBuyers.length)} icon={<UsersRound className="size-5" />} active={metricActive("potential")} onClick={() => showQueueCategory("potential")} />
        <Metric
          label="Screened out"
          value={metricValue(screenedMatches.length)}
          detail="Not a fit"
          icon={<Network className="size-5" />}
          tone="quiet"
          active={metricActive("screened")}
          onClick={() => showQueueCategory("screened")}
        />
      </section>

      <WebsiteDemandMap
        suggestions={buyerGroupSuggestions}
        activateBuyerGroup={activateBuyerGroup}
        collapsible
        defaultExpanded={reviewedConversationCount === 0}
      />

      <section
        aria-label="Lead review workspace"
        className="grid min-h-[420px] overflow-hidden rounded-xl border bg-white xl:flex-1 xl:grid-cols-[minmax(300px,.8fr)_minmax(420px,1.2fr)]"
        style={{ borderColor: C.rule }}
      >
        <div className="flex min-h-0 min-w-0 flex-col border-b xl:border-r xl:border-b-0" style={{ borderColor: C.rule }}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5" style={{ borderColor: C.rule }}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold" style={{ color: C.navy }}>
                {isScreenedAudit ? "Screened-out audit" : "Signals"}
              </h2>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                {filteredQueueItems.length}
              </span>
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {resultSummary}
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs" style={{ color: C.muted }}>
                {isScreenedAudit
                  ? "Inspection only"
                  : isRefreshing
                    ? "Updating results..."
                    : freshnessLabel(lastUpdatedAt)}
              </p>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Reload current results"
                title="Reload current results"
                onClick={onRefresh}
                disabled={isRefreshing}
                style={{ color: C.blue }}
              >
                <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {filteredQueueItems.length > 0 ? (
            <>
            <p id="prospect-list-help" className="sr-only">Use the arrow keys, Home, or End to move through signals.</p>
            <div
              id="prospect-signal-list"
              aria-describedby="prospect-list-help"
              className="min-h-0 flex-1 divide-y overflow-y-auto"
              style={{ borderColor: C.rule }}
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
            </>
          ) : (
            <EmptyQueue
              hasProfile={serviceProfile.hasProfile}
              hasActiveFilters={hasActiveFilters}
              screenedMatchCount={screenedMatches.length}
              showingScreenedAudit={isScreenedAudit}
              report={buyerDemandReport}
              onClearFilters={clearFilters}
              onOpenScanActivity={() => setScanActivityOpen(true)}
              onOpenScreenedAudit={() => {
                onQueryChange("");
                onConfidenceChange("all");
                onSourceChange("all");
                onFilterChange("screened");
              }}
            />
          )}
        </div>

        <aside
          ref={signalDetailRef}
          className="flex min-h-0 min-w-0 scroll-mt-4 flex-col overflow-y-auto"
          aria-label="Signal intelligence"
        >
          {selectedLead && selectedStatus ? (
            <>
              <button type="button" className="border-b px-4 py-2 text-left text-xs font-semibold xl:hidden" style={{ borderColor: C.rule, color: C.blue }} onClick={() => document.getElementById("prospect-signal-list")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}>
                Back to signals
              </button>
              <div className="flex shrink-0 items-start justify-between gap-3 border-b p-3 sm:p-3.5" style={{ borderColor: C.rule }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold" style={{ color: C.navy }}>Signal intelligence</h2>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      title={selectedStatus.description}
                      aria-label={`${selectedStatus.label}. ${selectedStatus.description}`}
                      style={{ backgroundColor: selectedStatus.background, color: selectedStatus.color }}
                    >
                      {selectedStatus.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: C.muted }}>
                    {isScreenedMatch(selectedLead)
                      ? "Semantically related, but not a reviewable opportunity."
                      : "Public-source evidence, not a confirmed customer."}
                  </p>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-3 sm:p-3.5">
                <div className="flex gap-3">
                  <SourcePlatformMark source={selectedLead.sourcePost.source} size="detail" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                      {sourceConversationType(selectedLead.sourcePost.source)}
                    </p>
                    <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>
                      {selectedLead.sourcePost.title || signalLabel(selectedLead)}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                      <SourcePlatformBadge source={selectedLead.sourcePost.source} />
                      {selectedLead.sourcePost.community ? <span className="truncate" title={selectedLead.sourcePost.community}>{selectedLead.sourcePost.community}</span> : null}
                      {selectedLead.sourcePost.author ? <span className="truncate" title={selectedLead.sourcePost.author}>by {selectedLead.sourcePost.author}</span> : null}
                    </div>
                  </div>
                </div>

                <blockquote className="rounded-lg border-l-[3px] px-3 py-2.5 text-xs leading-5" style={{ borderColor: exactEvidence ? C.blue : C.ruleDark, backgroundColor: C.offWhite, color: C.navySoft }}>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                    {exactEvidence ? "Verified source excerpt" : "Source preview"}
                  </span>
                  <span className="line-clamp-3">{exactEvidence ?? sourceText ?? "No source text is available for this signal."}</span>
                </blockquote>

                {isScreenedMatch(selectedLead) ? (
                  <ScreenedMatchOutcome lead={selectedLead} />
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  {isScreenedMatch(selectedLead) ? (
                    <>
                      <DetailStat label="Source type" value={sourceConversationType(selectedLead.sourcePost.source)} />
                      <DetailStat
                        label="Observed"
                        value={relativeTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)}
                        title={exactDateTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)}
                      />
                    </>
                  ) : (
                    <>
                      <DetailStat
                        label="Match strength"
                        value={formatScore(selectedLead.verifierScore)}
                        title="Ranks relevance to your website; it is not a likelihood of purchase."
                      />
                      <DetailStat
                        label="Observed"
                        value={relativeTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)}
                        title={exactDateTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)}
                      />
                    </>
                  )}
                </div>

                <div className="flex gap-4 border-b" role="tablist" aria-label="Signal details" style={{ borderColor: C.rule }}>
                  <DetailTabButton active={detailTab === "match"} tab="match" onClick={() => setDetailTab("match")} onKeyDown={handleDetailTabKeyDown}>Why it matched</DetailTabButton>
                  <DetailTabButton active={detailTab === "evidence"} tab="evidence" onClick={() => setDetailTab("evidence")} onKeyDown={handleDetailTabKeyDown}>Evidence</DetailTabButton>
                  <DetailTabButton active={detailTab === "context"} tab="context" onClick={() => setDetailTab("context")} onKeyDown={handleDetailTabKeyDown}>Source context</DetailTabButton>
                </div>

                <div
                  id={`signal-detail-panel-${detailTab}`}
                  role="tabpanel"
                  aria-labelledby={`signal-detail-tab-${detailTab}`}
                  tabIndex={0}
                  className="min-h-[142px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2"
                >
                  {detailTab === "match" ? (
                    <>
                      <DetailSection title="Why it matched">
                        <p className="text-sm leading-6" style={{ color: C.navySoft }}>{selectedLead.matchReason}</p>
                        <ul className="mt-3 grid gap-1.5 text-xs leading-5" style={{ color: C.navySoft }}>
                          <SignalPoint>{signalLabel(selectedLead)}</SignalPoint>
                          {selectedLead.urgencyReason ? <SignalPoint>{selectedLead.urgencyReason}</SignalPoint> : null}
                          {selectedLead.purchaseStage ? <SignalPoint>Conversation stage: {selectedLead.purchaseStage.replace(/_/g, " ")}</SignalPoint> : null}
                        </ul>
                      </DetailSection>
                      <div className="grid grid-cols-2 gap-3">
                        <InsightCard
                          title="Buying context"
                          value={selectedLead.purchaseStage?.replace(/_/g, " ") ?? "Early signal"}
                          detail={selectedLead.competitorMention ? `Also mentioned: ${selectedLead.competitorMention}` : "No company data is assumed from this post."}
                        />
                        <InsightCard
                          title="Source context"
                          value={sourceDisplayName(selectedLead.sourcePost.source)}
                          detail={selectedLead.sourcePost.community ?? selectedLead.sourcePost.author ?? "Public conversation"}
                        />
                      </div>
                      {selectedLead.suggestedReply ? (
                        <section className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
                          <p className="text-xs font-semibold" style={{ color: C.navy }}>Suggested next move</p>
                          <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>{selectedLead.suggestedReply}</p>
                        </section>
                      ) : null}
                    </>
                  ) : null}

                  {detailTab === "evidence" ? (
                    <DetailSection title={exactEvidence ? "Exact source excerpt" : "Original source text"}>
                      {exactEvidence ? (
                        <blockquote className="border-l-2 pl-3 text-sm leading-6" style={{ borderColor: C.blueLight, color: C.navySoft }}>
                          “{exactEvidence}”
                        </blockquote>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: C.navySoft }}>
                          {sourceText ?? "No source text was retained for this record."}
                        </p>
                      )}
                      <p className="mt-3 text-xs leading-5" style={{ color: C.muted }}>
                        {exactEvidence
                          ? "This quote was checked against the original public post."
                          : "No exact quote was captured. Read the original post before deciding whether to act."}
                      </p>
                    </DetailSection>
                  ) : null}

                  {detailTab === "context" ? (
                    <DetailSection title="Public-source context">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3 text-xs" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
                        <SourceContextItem label="Source" value={sourceDisplayName(selectedLead.sourcePost.source)} />
                        <SourceContextItem label="Author" value={selectedLead.sourcePost.author ?? "Not available"} />
                        <SourceContextItem label="Community" value={selectedLead.sourcePost.community ?? "Not available"} />
                        <SourceContextItem label="Signal type" value={selectedLead.signalType ?? "Public conversation"} />
                      </dl>
                    </DetailSection>
                  ) : null}
                </div>

                <div className="mt-auto space-y-3 border-t pt-4" style={{ borderColor: C.rule }}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" size="sm" className="bg-[#1B6EBF] text-white hover:bg-[#155a9f]" onClick={onOpenFocusedReview}>
                      {isScreenedMatch(selectedLead) ? "Inspect post" : "Review in detail"}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <div className="flex flex-wrap gap-2">
                    {selectedLead.sourcePost.url ? (
                      <Button asChild variant="outline" size="sm" className="border-[#C8D9E8]">
                        <a href={selectedLead.sourcePost.url} target="_blank" rel="noreferrer">
                          <ExternalLink aria-hidden="true" />
                          Open {sourceDisplayName(selectedLead.sourcePost.source)}
                        </a>
                      </Button>
                    ) : null}
                    {selectedLead.matchStatus === "ready_for_review" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-[7.75rem] border-[#6EE7B7] text-[#047857] hover:bg-[#ECFDF5]"
                        onClick={() => onQualify(selectedLead.id)}
                        disabled={qualificationPending}
                      >
                        <Check aria-hidden="true" />
                        {qualificationPending ? "Qualifying..." : "Mark qualified"}
                      </Button>
                    ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Your feedback</p>
                    <div className="flex flex-wrap gap-2">
                      {FEEDBACK_ACTIONS.map((action) => (
                        <Button
                          key={action.value}
                          type="button"
                          variant="outline"
                          size="xs"
                          className="border-[#DDE8F2]"
                          onClick={() => onFeedback(selectedLead.id, action.value)}
                          disabled={feedbackPending}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                    {feedbackPending ? (
                      <p className="mt-2 text-xs" role="status" aria-live="polite" style={{ color: C.muted }}>
                        Saving feedback...
                      </p>
                    ) : null}
                    {feedbackNotice ? (
                      <p className="mt-2 text-xs" role="status" aria-live="polite" style={{ color: feedbackNotice.ok ? C.green : C.red }}>{feedbackNotice.message}</p>
                    ) : null}
                    {qualificationMessage ? (
                      <p className="mt-2 text-xs" role="status" aria-live="polite" style={{ color: C.green }}>{qualificationMessage}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold" style={{ color: C.navy }}>Choose a signal to review</h2>
              <p className="mt-2 max-w-xs text-sm leading-6" style={{ color: C.muted }}>
                Evidence and next steps will appear here when a public-source signal is available.
              </p>
            </div>
          )}
        </aside>
      </section>
      <ScanActivityDialog open={scanActivityOpen} onOpenChange={setScanActivityOpen} report={buyerDemandReport} onRefresh={onRefresh} />
    </div>
  );
}
