"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Clock3,
  ExternalLink,
  MessageSquareText,
  Radar,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markLeadAsQualified } from "@/app/actions/leads";
import { shouldContinueActionQueuePolling } from "@/lib/buyer-demand-report";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import { C } from "@/lib/tokens";
import { sourceDisplayName } from "@/components/prospects/lead-desk-presentation";
import { ProspectLeadDesk } from "@/components/prospects/prospect-lead-desk";
import { LeadOutreach } from "./lead-outreach";
import {
  rebuildCurrentWebsiteProfile,
  submitLeadFeedback,
} from "./actions";
import {
  isPotentialBuyer,
  isScreenedMatch,
  matchesLeadQueueFilter,
  type LeadQueueFilter,
} from "./lead-queue-filter";
import {
  FEEDBACK_OPTIONS,
  type BuyerDemandReportView,
  type BuyerGroupActivationAction,
  type LeadFeedbackValue,
  type ProspectActionResult,
  type QualifiedLeadView,
  type ServiceProfileView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  serviceProfile: ServiceProfileView;
  leads: QualifiedLeadView[];
  discoveryCandidates: QualifiedLeadView[];
  screenedMatches: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  buyerGroupSuggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: BuyerGroupActivationAction;
  isWarmingUp: boolean;
};

type FeedbackNotice = {
  message: string;
  ok: boolean;
};

type QueueFilter = LeadQueueFilter;
type QueueSort = "priority" | "newest" | "confidence";
type QueueConfidenceFilter = "all" | "high" | "sixty_plus";
type DashboardView = "overview" | "focus";

// The overview is rendered by the dedicated lead-desk component; this file
// only owns the focused single-lead review.
function shouldRenderLeadDesk(view: DashboardView): boolean {
  return view === "overview";
}


function purchaseStageLabel(stage: string | null) {
  switch (stage) {
    case "problem_aware":
      return "Problem aware";
    case "solution_seeking":
      return "Exploring solutions";
    case "evaluating_options":
      return "Comparing options";
    case "ready_to_act":
      return "Ready to act";
    default:
      return null;
  }
}

function SupportingSignals({ lead }: { lead: QualifiedLeadView }) {
  const stage = purchaseStageLabel(lead.purchaseStage);

  if (!stage && !lead.competitorMention) return null;

  return (
    <section
      aria-label="Additional buying context"
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2.5"
      style={{ borderColor: C.rule }}
    >
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        Context
      </span>
      {stage ? (
        <span className="rounded-full border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint, color: C.blue }}>
          Stage: {stage}
        </span>
      ) : null}
      {lead.competitorMention ? (
        <span className="rounded-full border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: C.ruleDark, backgroundColor: C.offWhite, color: C.navySoft }}>
          Also mentioned: {lead.competitorMention}
        </span>
      ) : null}
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}




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

function denseStatusPresentation(lead: QualifiedLeadView) {
  if (isScreenedMatch(lead)) {
    return { label: "Screened out", background: C.offWhite, color: C.muted };
  }

  if (lead.matchStatus !== "qualified" && lead.intentTier === "high") {
    return { label: "High intent", background: C.greenPale, color: C.green };
  }

  if (lead.intentTier === "warm") {
    return { label: "Warm", background: C.amberPale, color: C.amber };
  }

  if (lead.intentTier === "exploratory") {
    return { label: "Exploratory", background: C.bluePale, color: C.blue };
  }

  return { label: leadCategoryLabel(lead), ...(isPotentialBuyer(lead)
    ? { background: C.amberPale, color: C.amber }
    : { background: C.greenPale, color: C.green }) };
}

// The three user-facing buckets. Keep these words identical everywhere so
// people learn one vocabulary instead of decoding synonyms.
function leadCategoryLabel(lead: QualifiedLeadView) {
  if (isScreenedMatch(lead)) return "Screened out";
  return isPotentialBuyer(lead) ? "Maybe" : "Lead";
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




function LeadFeedbackButtons({
  leadId,
  disabled,
  onFeedback,
}: {
  leadId: string;
  disabled: boolean;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FEEDBACK_OPTIONS.map((option) => (
        (() => {
          const isGoodFit = option.value === "good_fit";
          const isUsefulLater = option.value === "useful_pain_not_now";

          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onFeedback(leadId, option.value)}
              className="h-7 px-2 text-[11px]"
              style={{
                borderColor: isGoodFit
                  ? C.green
                  : isUsefulLater
                    ? C.amber
                    : C.ruleDark,
                color: isGoodFit ? C.green : isUsefulLater ? C.amber : C.navySoft,
                backgroundColor: C.white,
              }}
            >
              {option.label}
            </Button>
          );
        })()
      ))}
    </div>
  );
}

function DenseLeadDetails({
  lead,
  feedbackPending,
  qualificationPending,
  feedbackMessage,
  qualificationMessage,
  onFeedback,
  onQualify,
}: {
  lead: QualifiedLeadView;
  feedbackPending: boolean;
  qualificationPending: boolean;
  feedbackMessage: FeedbackNotice | null;
  qualificationMessage: string | null;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onQualify: (leadId: string) => void;
}) {
  const isWatch = lead.matchStatus === "discovery_candidate";
  const isScreened = isScreenedMatch(lead);
  const isReviewOnly = isWatch || isScreened;
  const status = denseStatusPresentation(lead);
  const postedAt = formatDate(lead.sourcePost.publishedAt);
  const [openDetail, setOpenDetail] = useState<"reply" | "outcome" | null>(null);
  const isQualified = lead.matchStatus === "qualified";

  useEffect(() => {
    setOpenDetail(null);
  }, [lead.id]);

  const toggleDetail = (detail: "reply" | "outcome") => {
    setOpenDetail((current) => (current === detail ? null : detail));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.navySoft }}>
            {sourceDisplayName(lead.sourcePost.source)}
            {lead.sourcePost.community ? ` · ${lead.sourcePost.community}` : ""}
          </span>
          {/* The panel heading already names the bucket; only add intent. */}
          {status.label !== leadCategoryLabel(lead) ? (
            <Badge
              variant="outline"
              className="h-5 rounded px-1.5 text-[10px]"
              style={{
                borderColor: status.color,
                backgroundColor: status.background,
                color: status.color,
              }}
            >
              {status.label}
            </Badge>
          ) : null}
        </div>
        <h3 className="pfd mt-2 text-xl leading-7" style={{ color: C.navy }}>
          {lead.sourcePost.title}
        </h3>
        {(postedAt || lead.sourcePost.author) ? (
          <p className="mt-1.5 text-[11px]" style={{ color: C.muted }}>
            {[lead.sourcePost.author, postedAt ? `Posted ${postedAt}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
        style={{ backgroundColor: C.offWhite }}
      >
        <section className="rounded-lg border bg-white p-4" style={{ borderColor: C.rule }}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: isScreened ? C.muted : C.amber }}>
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            {isScreened ? "Verification outcome" : "Why this matters"}
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: C.navy }}>
            {lead.painDetected}
          </p>
          <p className="mt-3 border-t pt-3 text-xs leading-5" style={{ borderColor: C.rule, color: C.navySoft }}>
            <span className="font-semibold" style={{ color: C.navy }}>
              {isScreened ? "Why it was screened out: " : "Why it fits: "}
            </span>
            {lead.matchReason}
          </p>
        </section>

        <details className="rounded-lg border bg-white" style={{ borderColor: C.rule }}>
          <summary className="cursor-pointer list-none px-3.5 py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]" style={{ color: C.navy }}>
            More context
          </summary>
          <div className="space-y-3 border-t p-3.5" style={{ borderColor: C.rule }}>
            <SupportingSignals lead={lead} />

        {lead.urgencyReason ? (
          <div className="rounded-lg border bg-white p-3.5" style={{ borderColor: C.rule }}>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.red }}>
              <Clock3 className="size-3.5" aria-hidden="true" />
              {lead.urgencyLevel ? `Urgency: ${lead.urgencyLevel}` : "Why this matters now"}
            </div>
            <p className="mt-2 text-xs leading-5" style={{ color: C.navy }}>
              “{lead.urgencyReason}”
            </p>
          </div>
        ) : null}

          </div>
        </details>

        <details
          aria-label="Original public post or comment"
          className="rounded-lg border bg-white"
          style={{ borderColor: C.rule }}
        >
          <summary className="cursor-pointer list-none px-3.5 py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]" style={{ color: C.navy }}>
            Evidence
          </summary>
          <div className="border-t p-3.5" style={{ borderColor: C.rule }}>
          <div className="flex justify-end">
            {lead.sourcePost.url ? (
              <Button
                asChild
                size="xs"
                variant="outline"
                style={{ borderColor: C.blueLight, color: C.blue }}
              >
                <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" />
                  Open original
                </a>
              </Button>
            ) : null}
          </div>
          {lead.evidenceExcerpt ? (
            <div className="mt-3 rounded-md border px-3 py-2.5" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.blue }}>Key quote</p>
              <blockquote className="mt-1 text-sm italic leading-6" style={{ color: C.navy }}>
              “{lead.evidenceExcerpt}”
              </blockquote>
            </div>
          ) : null}
          <p
            className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-6"
            style={{ color: C.navySoft }}
          >
            {lead.sourcePost.text}
          </p>
          </div>
        </details>

        <section aria-label="Conversation actions">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Conversation actions">
            {!isScreened ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                aria-pressed={openDetail === "reply"}
                onClick={() => toggleDetail("reply")}
                style={{
                  borderColor: openDetail === "reply" ? C.blueLight : C.ruleDark,
                  backgroundColor: openDetail === "reply" ? C.blueTint : C.white,
                  color: openDetail === "reply" ? C.blue : C.navySoft,
                }}
              >
                Draft reply
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-pressed={openDetail === "outcome"}
              onClick={() => toggleDetail("outcome")}
              style={{
                borderColor: openDetail === "outcome" ? C.blueLight : C.ruleDark,
                backgroundColor: openDetail === "outcome" ? C.blueTint : C.white,
                color: openDetail === "outcome" ? C.blue : C.navySoft,
              }}
            >
              Record outcome
            </Button>
          </div>
        </section>

        {openDetail === "reply" && !isScreened ? (
          <LeadOutreach
            key={`outreach-${lead.id}`}
            lead={lead}
            disabled={qualificationPending}
            qualificationMessage={qualificationMessage}
            onQualify={onQualify}
            reviewOnly={isReviewOnly}
            compact
            showQualification={false}
          />
        ) : null}

        {openDetail === "outcome" ? (
          <div className="border-t pt-3" style={{ borderColor: C.rule }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            Record outcome
          </p>
          {!isReviewOnly ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={qualificationPending || isQualified}
                onClick={() => onQualify(lead.id)}
                style={{ backgroundColor: C.green, color: C.white }}
              >
                {qualificationPending ? (
                  <Radar className="size-4 animate-spin" />
                ) : isQualified ? (
                  <Check className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {qualificationPending ? "Qualifying..." : isQualified ? "Qualified" : "Mark qualified"}
              </Button>
              {qualificationMessage ? (
                <p className="text-[11px] font-medium" aria-live="polite" style={{ color: C.navySoft }}>
                  {qualificationMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5" style={{ color: isScreened ? C.muted : C.amber }}>
              {isScreened
                ? "Screened out — for inspection only."
                : "Maybes can't be qualified yet."}
            </p>
          )}
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            Your feedback
          </p>
          <LeadFeedbackButtons
            leadId={lead.id}
            disabled={feedbackPending}
            onFeedback={onFeedback}
          />
          {feedbackMessage ? (
            <p
              className="mt-2 text-[11px] font-medium"
              role={feedbackMessage.ok ? "status" : "alert"}
              style={{ color: feedbackMessage.ok ? C.green : C.red }}
            >
              {feedbackMessage.message}
            </p>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}




export default function ProspectDashboardClient({
  serviceProfile,
  leads,
  discoveryCandidates,
  screenedMatches,
  buyerDemandReport,
  buyerGroupSuggestions,
  activateBuyerGroup,
  isWarmingUp,
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
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
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
  const [dashboardView, setDashboardView] = useState<DashboardView>("overview");
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
    discoveryCandidates,
    leads,
    screenedMatches,
  ]);

  useEffect(() => {
    if (!shouldRefreshForLeads) return;

    const intervalId = window.setInterval(() => {
      refreshDashboard();
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [refreshDashboard, refreshMs, shouldRefreshForLeads]);

  const handleFeedback = (leadId: string, value: LeadFeedbackValue) => {
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

  const queueItems = useMemo(
    () => [...leads, ...discoveryCandidates, ...screenedMatches],
    [discoveryCandidates, leads, screenedMatches],
  );
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

  const previewLead = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
  }, []);

  useEffect(() => {
    if (filteredQueueItems.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!filteredQueueItems.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(filteredQueueItems[0].id);
    }
  }, [filteredQueueItems, selectedLeadId]);

  useEffect(() => {
    const selectAdjacentLead = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        dashboardView !== "focus" ||
        target?.closest(
          'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
        ) ||
        !["ArrowDown", "ArrowUp"].includes(event.key) ||
        filteredQueueItems.length === 0
      ) {
        return;
      }

      event.preventDefault();
      const currentIndex = filteredQueueItems.findIndex((lead) => lead.id === selectedLeadId);
      const movement = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.min(
        Math.max(currentIndex + movement, 0),
        filteredQueueItems.length - 1,
      );
      setSelectedLeadId(filteredQueueItems[nextIndex]?.id ?? null);
    };

    window.addEventListener("keydown", selectAdjacentLead);
    return () => window.removeEventListener("keydown", selectAdjacentLead);
  }, [dashboardView, filteredQueueItems, selectedLeadId]);

  const selectedLead =
    filteredQueueItems.find((lead) => lead.id === selectedLeadId) ?? null;
  const showNextLead = () => {
    if (filteredQueueItems.length < 2) return;

    const currentIndex = filteredQueueItems.findIndex((lead) => lead.id === selectedLeadId);
    const nextIndex = currentIndex < 0 || currentIndex === filteredQueueItems.length - 1
      ? 0
      : currentIndex + 1;
    setSelectedLeadId(filteredQueueItems[nextIndex].id);
  };

  if (shouldRenderLeadDesk(dashboardView)) {
    return (
      <ProspectLeadDesk
        serviceProfile={serviceProfile}
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
        onRefresh={refreshDashboard}
        onRebuildProfile={handleProfileRebuild}
        onQueryChange={setQueueQuery}
        onFilterChange={setQueueFilter}
        onSortChange={setQueueSort}
        onConfidenceChange={setQueueConfidence}
        onSourceChange={setQueueSource}
        onSelectLead={previewLead}
        onOpenFocusedReview={() => setDashboardView("focus")}
        onFeedback={handleFeedback}
        onQualify={handleQualification}
      />
    );
  }

  return (
    <section
      aria-labelledby="details-heading"
      className="flex min-h-[640px] w-full flex-col overflow-hidden rounded-xl border xl:min-h-[760px]"
      style={{ borderColor: C.rule, backgroundColor: C.offWhite, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.06)" }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setDashboardView("overview")}
            style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Inbox
          </Button>
          <h1 id="details-heading" className="pfd truncate text-xl leading-none" style={{ color: C.navy }}>
            {selectedLead ? leadCategoryLabel(selectedLead) : "Review"}
          </h1>
        </div>
        {filteredQueueItems.length > 1 ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={showNextLead}
            style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
          >
            Next
          </Button>
        ) : null}
      </div>
      {selectedLead ? (
        <DenseLeadDetails
          lead={selectedLead}
          feedbackPending={isFeedbackPending && pendingFeedbackLeadId === selectedLead.id}
          qualificationPending={isQualificationPending && pendingQualificationLeadId === selectedLead.id}
          feedbackMessage={feedbackMessages[selectedLead.id] ?? null}
          qualificationMessage={qualificationMessages[selectedLead.id] ?? null}
          onFeedback={handleFeedback}
          onQualify={handleQualification}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <h2 className="pfd text-2xl leading-tight" style={{ color: C.navy }}>
            Nothing left to review
          </h2>
        </div>
      )}
    </section>
  );
}
