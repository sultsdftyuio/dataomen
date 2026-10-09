"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { markLeadAsQualified } from "@/app/actions/leads";
import { ProspectLeadDesk } from "@/components/prospects/prospect-lead-desk";
import { trackProductEvent, type ProductEvent } from "@/lib/analytics/product-events";
import { shouldContinueActionQueuePolling } from "@/lib/buyer-demand-report";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import {
  rebuildCurrentWebsiteProfile,
  submitLeadFeedback,
} from "./actions";
import { setLeadHandled } from "./lead-review-actions";
import { runManualDiscoveryScan } from "./manual-scan-actions";
import {
  isPotentialBuyer,
  isScreenedMatch,
  leadCategoryLabel,
  matchesLeadQueueFilter,
  type LeadQueueFilter,
} from "./lead-queue-filter";
import type {
  BuyerDemandReportView,
  BuyerGroupActivationAction,
  CrawlJobView,
  LeadFeedbackValue,
  ProspectActionResult,
  QualifiedLeadView,
  ServiceProfileView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  leads: QualifiedLeadView[];
  discoveryCandidates: QualifiedLeadView[];
  screenedMatches: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  buyerGroupSuggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: BuyerGroupActivationAction;
  isWarmingUp: boolean;
  /** Resolved on the server from the operator allowlist. */
  canRunManualScan: boolean;
};

type FeedbackNotice = {
  message: string;
  ok: boolean;
};

type QueueSort = "priority" | "newest" | "confidence";
type QueueConfidenceFilter = "all" | "high" | "sixty_plus";

function leadTimestamp(lead: QualifiedLeadView) {
  const timestamp = Date.parse(lead.sourcePost.publishedAt ?? lead.matchedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function matchesQueueSearch(lead: QualifiedLeadView, query: string) {
  if (!query.trim()) return true;

  const haystack = [
    lead.sourcePost.title,
    lead.sourcePost.text,
    lead.sourcePost.source,
    lead.sourcePost.community,
    lead.sourcePost.author,
    lead.painDetected,
    lead.matchReason,
    lead.urgencyReason,
    lead.purchaseStage,
    lead.competitorMention,
    lead.intentTier,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return haystack.includes(query.trim().toLocaleLowerCase());
}

function sortQueueItems(items: QualifiedLeadView[], sort: QueueSort) {
  return [...items].sort((a, b) => {
    if (sort === "newest") return leadTimestamp(b) - leadTimestamp(a);
    if (sort === "confidence") return b.verifierScore - a.verifierScore;

    const priority = (lead: QualifiedLeadView) =>
      (isScreenedMatch(lead) ? -2 : isPotentialBuyer(lead) ? 0 : 4) +
      (lead.intentTier === "high" ? 3 : lead.intentTier === "warm" ? 2 : lead.intentTier === "exploratory" ? 1 : 0) +
      (lead.urgencyReason ? 2 : 0) +
      (lead.matchStatus === "qualified" ? 1 : 0);
    const priorityDifference = priority(b) - priority(a);

    return priorityDifference || b.verifierScore - a.verifierScore || leadTimestamp(b) - leadTimestamp(a);
  });
}

/**
 * Data and state container for the prospect desk. All rendering lives in
 * ProspectLeadDesk; this component owns filters, server actions, polling,
 * and optimistic "done" state.
 */
export default function ProspectDashboardClient({
  serviceProfile,
  crawlJob,
  leads: serverLeads,
  discoveryCandidates: serverDiscoveryCandidates,
  screenedMatches,
  buyerDemandReport,
  buyerGroupSuggestions,
  activateBuyerGroup,
  isWarmingUp,
  canRunManualScan,
}: ProspectDashboardClientProps) {
  const router = useRouter();
  const [feedbackMessages, setFeedbackMessages] = useState<
    Record<string, FeedbackNotice>
  >({});
  const [pendingFeedbackLeadId, setPendingFeedbackLeadId] = useState<string | null>(null);
  const [isFeedbackPending, startFeedbackTransition] = useTransition();
  const [qualificationMessages, setQualificationMessages] = useState<
    Record<string, string>
  >({});
  const [pendingQualificationLeadId, setPendingQualificationLeadId] = useState<
    string | null
  >(null);
  const [isQualificationPending, startQualificationTransition] = useTransition();
  // Optimistic done/undone state so a lead leaves the inbox immediately; the
  // server refresh then confirms it (or the override is rolled back).
  const [handledOverrides, setHandledOverrides] = useState<Record<string, string | null>>({});
  const [queueFilter, setQueueFilter] = useState<LeadQueueFilter>("all");
  const [queueSort, setQueueSort] = useState<QueueSort>("priority");
  const [queueConfidence, setQueueConfidence] = useState<QueueConfidenceFilter>("all");
  const [queueSource, setQueueSource] = useState("all");
  const [queueQuery, setQueueQuery] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const [isProfileRebuildPending, startProfileRebuildTransition] = useTransition();
  const [profileRebuildResult, setProfileRebuildResult] = useState<
    ProspectActionResult | null
  >(null);
  const [isManualScanPending, startManualScanTransition] = useTransition();
  const [manualScanResult, setManualScanResult] = useState<
    ProspectActionResult | null
  >(null);

  const withHandledOverrides = useCallback(
    (items: QualifiedLeadView[]) =>
      items.map((lead) =>
        lead.id in handledOverrides ? { ...lead, handledAt: handledOverrides[lead.id] } : lead,
      ),
    [handledOverrides],
  );
  const leads = useMemo(() => withHandledOverrides(serverLeads), [serverLeads, withHandledOverrides]);
  const discoveryCandidates = useMemo(
    () => withHandledOverrides(serverDiscoveryCandidates),
    [serverDiscoveryCandidates, withHandledOverrides],
  );

  const shouldRefreshForLeads = shouldContinueActionQueuePolling({
    isWarmingUp,
    readyToActCount: leads.length,
    hasTerminalReport: buyerDemandReport?.isTerminal ?? false,
    verificationPending: buyerDemandReport?.summary.verifierPending ?? false,
    terminalReportAgeMs: buyerDemandReport?.updatedAt
      ? Math.max(0, Date.now() - new Date(buyerDemandReport.updatedAt).getTime())
      : null,
  });
  const refreshMs = useMemo(() => (isWarmingUp ? 5000 : 15000), [isWarmingUp]);

  const refreshDashboard = useCallback(() => {
    startRefreshTransition(() => {
      setLastUpdatedAt(new Date());
      router.refresh();
    });
  }, [router, startRefreshTransition]);

  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, [
    buyerDemandReport?.updatedAt,
    serverDiscoveryCandidates,
    serverLeads,
    screenedMatches,
  ]);

  useEffect(() => {
    if (!shouldRefreshForLeads) return;

    const intervalId = window.setInterval(() => {
      refreshDashboard();
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [refreshDashboard, refreshMs, shouldRefreshForLeads]);

  const queueItems = useMemo(
    () => [...leads, ...discoveryCandidates, ...screenedMatches],
    [discoveryCandidates, leads, screenedMatches],
  );

  // Segment funnel events by bucket and source only; never send post content.
  const trackLeadEvent = (
    name: ProductEvent,
    leadId: string | null,
    extra: Record<string, string> = {},
  ) => {
    const lead = queueItems.find((item) => item.id === leadId);
    if (!lead) return;
    trackProductEvent(name, {
      bucket: leadCategoryLabel(lead),
      source: lead.sourcePost.source,
      ...extra,
    });
  };

  const handleFeedback = (leadId: string, value: LeadFeedbackValue) => {
    trackLeadEvent("lead_feedback_given", leadId, { feedback: value });
    setPendingFeedbackLeadId(leadId);
    startFeedbackTransition(async () => {
      try {
        const result = await submitLeadFeedback(leadId, value);
        setFeedbackMessages((current) => ({
          ...current,
          [leadId]: result,
        }));
      } catch {
        setFeedbackMessages((current) => ({
          ...current,
          [leadId]: {
            ok: false,
            message: "Could not save feedback. Please try again.",
          },
        }));
      } finally {
        setPendingFeedbackLeadId(null);
      }
    });
  };

  const handleQualification = (leadId: string) => {
    setPendingQualificationLeadId(leadId);
    startQualificationTransition(async () => {
      try {
        const result = await markLeadAsQualified(leadId);
        setQualificationMessages((current) => ({
          ...current,
          [leadId]: result.message,
        }));

        if (result.ok) {
          trackLeadEvent("lead_qualified", leadId);
          router.refresh();
        }
      } catch {
        setQualificationMessages((current) => ({
          ...current,
          [leadId]: "Could not qualify this item. Please try again.",
        }));
      } finally {
        setPendingQualificationLeadId(null);
      }
    });
  };

  const handleSetHandled = (leadId: string, handled: boolean) => {
    const previous = queueItems.find((lead) => lead.id === leadId)?.handledAt ?? null;
    setHandledOverrides((current) => ({
      ...current,
      [leadId]: handled ? new Date().toISOString() : null,
    }));
    if (handled) trackLeadEvent("lead_marked_done", leadId);

    void setLeadHandled(leadId, handled)
      .then((result) => {
        if (!result.ok) throw new Error(result.message);
        router.refresh();
      })
      .catch(() => {
        setHandledOverrides((current) => ({ ...current, [leadId]: previous }));
        setFeedbackMessages((current) => ({
          ...current,
          [leadId]: { ok: false, message: "Could not update this lead. Please try again." },
        }));
      });
  };

  const handleProfileRebuild = () => {
    setProfileRebuildResult(null);
    startProfileRebuildTransition(async () => {
      try {
        const result = await rebuildCurrentWebsiteProfile();
        setProfileRebuildResult(result);
        if (result.ok) router.refresh();
      } catch {
        setProfileRebuildResult({
          ok: false,
          message: "Could not queue a profile rebuild. Please try again.",
        });
      }
    });
  };

  const handleManualScan = () => {
    setManualScanResult(null);
    startManualScanTransition(async () => {
      try {
        const result = await runManualDiscoveryScan();
        setManualScanResult(result);
        if (result.ok) router.refresh();
      } catch {
        setManualScanResult({
          ok: false,
          message: "Could not queue a scan. Please try again.",
        });
      }
    });
  };

  const inboxItems = useMemo(
    () => queueItems.filter((lead) => matchesLeadQueueFilter(lead, "all")),
    [queueItems],
  );
  const queueSources = useMemo(
    () => Array.from(new Set(queueItems.map((lead) => lead.sourcePost.source)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    [queueItems],
  );
  const filteredQueueItems = useMemo(() => {
    const filtered = queueItems.filter((lead) => {
      if (!matchesLeadQueueFilter(lead, queueFilter)) return false;
      if (queueConfidence === "high" && lead.verifierScore < 0.8) return false;
      if (queueConfidence === "sixty_plus" && lead.verifierScore < 0.6) return false;
      if (queueSource !== "all" && lead.sourcePost.source !== queueSource) return false;
      return matchesQueueSearch(lead, queueQuery);
    });

    return sortQueueItems(filtered, queueSort);
  }, [queueConfidence, queueFilter, queueItems, queueQuery, queueSort, queueSource]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(() =>
    sortQueueItems(inboxItems, "priority")[0]?.id ?? null,
  );

  // Keep a valid selection; after "Done" this advances to the next lead.
  useEffect(() => {
    if (filteredQueueItems.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!filteredQueueItems.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(filteredQueueItems[0].id);
    }
  }, [filteredQueueItems, selectedLeadId]);

  const selectedLead =
    filteredQueueItems.find((lead) => lead.id === selectedLeadId) ?? null;

  return (
    <ProspectLeadDesk
      serviceProfile={serviceProfile}
      crawlJob={crawlJob}
      leads={leads}
      potentialBuyers={discoveryCandidates}
      buyerGroupSuggestions={buyerGroupSuggestions}
      activateBuyerGroup={activateBuyerGroup}
      reviewedConversationCount={queueItems.length}
      screenedMatches={screenedMatches}
      buyerDemandReport={buyerDemandReport}
      filteredQueueItems={filteredQueueItems}
      selectedLead={selectedLead}
      selectedLeadId={selectedLeadId}
      queueQuery={queueQuery}
      queueFilter={queueFilter}
      queueSort={queueSort}
      queueConfidence={queueConfidence}
      queueSource={queueSource}
      queueSources={queueSources}
      isRefreshing={isRefreshPending}
      isProfileRebuildPending={isProfileRebuildPending}
      lastUpdatedAt={lastUpdatedAt}
      profileRebuildResult={profileRebuildResult}
      feedbackNotice={selectedLead ? feedbackMessages[selectedLead.id] ?? null : null}
      feedbackPending={isFeedbackPending && pendingFeedbackLeadId === selectedLead?.id}
      qualificationPending={isQualificationPending && pendingQualificationLeadId === selectedLead?.id}
      qualificationMessage={selectedLead ? qualificationMessages[selectedLead.id] ?? null : null}
      manualScan={
        canRunManualScan
          ? { pending: isManualScanPending, result: manualScanResult, onStart: handleManualScan }
          : null
      }
      onRefresh={refreshDashboard}
      onRebuildProfile={handleProfileRebuild}
      onQueryChange={setQueueQuery}
      onFilterChange={setQueueFilter}
      onSortChange={setQueueSort}
      onConfidenceChange={setQueueConfidence}
      onSourceChange={setQueueSource}
      onSelectLead={setSelectedLeadId}
      onLeadOpened={(leadId) => trackLeadEvent("lead_review_opened", leadId)}
      onSetHandled={handleSetHandled}
      onFeedback={handleFeedback}
      onQualify={handleQualification}
    />
  );
}
