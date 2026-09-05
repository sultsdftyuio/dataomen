"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  ListFilter,
  MessageSquareText,
  Radar,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { markLeadAsQualified } from "@/app/actions/leads";
import { shouldContinueActionQueuePolling } from "@/lib/buyer-demand-report";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { StartingDiscoveryScreen } from "@/components/discovery/starting-discovery-screen";
import { ProspectLeadDesk } from "@/components/prospects/prospect-lead-desk";
import { retryServiceProfileEmbedding, submitLeadFeedback } from "./actions";
import {
  FEEDBACK_OPTIONS,
  type BuyerLanguageResearchRequestAction,
  type BuyerLanguageResearchView,
  type BuyerDemandReportView,
  type BuyerGroupActivationAction,
  type CrawlJobView,
  type LeadFeedbackValue,
  type QualifiedLeadView,
  type ServiceProfileView,
  type WebsiteDemandScanAction,
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
  startWebsiteDemandScan: WebsiteDemandScanAction;
  verificationThreshold: number;
  isWarmingUp: boolean;
};

type FeedbackNotice = {
  message: string;
  ok: boolean;
};

type QueueFilter = "all" | "leads" | "potential" | "screened";
type QueueSort = "priority" | "newest" | "confidence";
type QueueConfidenceFilter = "all" | "high" | "sixty_plus";
type DashboardView = "overview" | "focus" | "queue";

const STALE_EMBEDDING_MS = 10 * 60 * 1000;

// Keep the legacy focused-review branches type-safe while the overview is
// rendered by the dedicated lead-desk component below.
function shouldRenderLeadDesk(view: DashboardView): boolean {
  return view === "overview";
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
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

function formatTime(value: Date | null) {
  if (!value) return "just now";

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function timestampAgeMs(value: string | null | undefined) {
  if (!value) return null;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

function leadTimestamp(lead: QualifiedLeadView) {
  const timestamp = Date.parse(lead.sourcePost.publishedAt ?? lead.matchedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isPotentialBuyer(lead: QualifiedLeadView) {
  return lead.matchStatus === "discovery_candidate";
}

function isScreenedMatch(lead: QualifiedLeadView) {
  return lead.matchStatus === "rejected";
}

function isVerifiedLead(lead: QualifiedLeadView) {
  return lead.matchStatus === "ready_for_review" || lead.matchStatus === "qualified";
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
      (lead.urgencyReason ? 2 : 0) +
      (lead.matchStatus === "qualified" ? 1 : 0);
    const priorityDifference = priority(b) - priority(a);

    return priorityDifference || b.verifierScore - a.verifierScore || leadTimestamp(b) - leadTimestamp(a);
  });
}

function pipelineStatus({
  crawlJob,
  serviceProfile,
  isWarmingUp,
}: {
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  isWarmingUp: boolean;
}) {
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const crawlPhase = normalizedStatus(crawlJob?.phase);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);
  const embeddingAge = timestampAgeMs(serviceProfile.updatedAt);

  if (crawlStatus === "failed" || crawlStatus === "dead_lettered") {
    return {
      label: "Needs attention",
      title: "The website crawl needs attention.",
      detail:
        crawlJob?.errorMessage ??
        crawlJob?.failureReason ??
        "Retry the crawl from workspace setup or settings.",
    };
  }

  if (!crawlJob && !serviceProfile.hasProfile) {
    return {
      label: "Needs attention",
      title: "Your first scan did not start.",
      detail:
        "We could not find a scan for this website. Use Check new leads above to try again, or review the website address in settings.",
    };
  }

  if (!serviceProfile.hasProfile) {
    return {
      label: crawlPhase?.replace(/_/g, " ") ?? "Crawling",
      title: "Building your service profile.",
      detail:
        "Arcli is crawling the website and extracting the matching brief. This page refreshes automatically.",
    };
  }

  if (embeddingStatus && embeddingStatus !== "completed") {
    if (["failed", "error", "dead_lettered"].includes(embeddingStatus)) {
      if (normalizedStatus(serviceProfile.embeddingFailureReason) === "profile_content_missing") {
        return {
          label: "Profile details needed",
          title: "Add a website URL or matching details.",
          detail:
            "We could not find a website URL to analyze. Add one, or include a problem, value proposition, target audience, pain point, or buying trigger.",
        };
      }

      return {
        label: "Needs attention",
        title: "The embedding job failed.",
        detail:
          "The profile is ready, but matching cannot start until its embedding is generated. Retry the job after confirming the worker configuration.",
        canRetry: true,
      };
    }

    if (
      ["pending", "queued", "processing", "generating"].includes(embeddingStatus) &&
      embeddingAge !== null &&
      embeddingAge > STALE_EMBEDDING_MS
    ) {
      return {
        label: "Needs attention",
        title: "The embedding job has not reported progress.",
        detail:
          "Retry the preparation step after confirming your matching brief. If it continues, contact your workspace administrator with the time this status first appeared.",
        canRetry: true,
      };
    }

    return {
      label: embeddingStatus.replace(/_/g, " "),
      title: "Preparing matching embeddings.",
      detail:
        "The profile is saved. Arcli is regenerating embeddings before public-source matching starts.",
    };
  }

  if (isWarmingUp) {
    return {
      label: "Warming up",
      title: "Checking public conversations.",
      detail:
        "Sources are checked in parallel. New matches appear as each source finishes, and this scan completes after the last source reports back.",
    };
  }

  return {
    label: "Latest scan complete",
    title: "Your latest scan is complete.",
    detail:
      "Clear buyer-problem leads and potential buyers stay separate, so you can judge each one with confidence.",
  };
}

function sourceDomain(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

const FIRST_SCAN_STEPS = [
  "Website connected",
  "Reading key pages",
  "Building your matching brief",
  "Preparing the search",
  "Scanning conversations",
  "Reviewing buyer signals",
] as const;

function firstScanStepIndex({
  crawlJob,
  serviceProfile,
  isWarmingUp,
}: {
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  isWarmingUp: boolean;
}) {
  const crawlPhase = normalizedStatus(crawlJob?.phase);
  if (!serviceProfile.hasProfile) {
    if (["crawl_persisted", "extracting_profile", "persisting_profile"].includes(crawlPhase ?? "")) {
      return 2;
    }
    return crawlPhase === "queued" || crawlPhase === "starting" ? 0 : 1;
  }

  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);
  if (embeddingStatus && embeddingStatus !== "completed") return 3;
  return isWarmingUp ? 4 : 5;
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

function LeadOutreach({
  lead,
  disabled,
  qualificationMessage,
  onQualify,
  reviewOnly,
  compact = false,
  showQualification = true,
}: {
  lead: QualifiedLeadView;
  disabled: boolean;
  qualificationMessage: string | null;
  onQualify: (leadId: string) => void;
  reviewOnly: boolean;
  compact?: boolean;
  showQualification?: boolean;
}) {
  const [draft, setDraft] = useState(lead.suggestedReply);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [restoredLocalDraft, setRestoredLocalDraft] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "empty" | "error">(
    "idle",
  );
  const isQualified = lead.matchStatus === "qualified";
  const draftStorageKey = `arcli:reply-draft:${lead.id}`;
  const sourceName = sourceDisplayName(lead.sourcePost.source);
  // Potential and screened matches are useful evidence to inspect, but only a
  // verifier-confirmed lead can be promoted. The server and RLS policy enforce
  // the same boundary; keeping it explicit prevents a misleading CRM action.
  const isReviewOnly = reviewOnly || !isVerifiedLead(lead);
  const hasSuggestedReply = Boolean(lead.suggestedReply.trim());
  const draftId = `suggested-reply-${lead.id}`;

  useEffect(() => {
    setIsDraftReady(false);
    setRestoredLocalDraft(false);

    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      const shouldRestore = Boolean(savedDraft && savedDraft !== lead.suggestedReply);
      setDraft(savedDraft ?? lead.suggestedReply);
      setRestoredLocalDraft(shouldRestore);
    } catch {
      setDraft(lead.suggestedReply);
    } finally {
      setIsDraftReady(true);
    }
  }, [draftStorageKey, lead.suggestedReply]);

  useEffect(() => {
    if (!isDraftReady) return;

    try {
      if (draft.trim() && draft !== lead.suggestedReply) {
        window.localStorage.setItem(draftStorageKey, draft);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // Draft persistence is a quality-of-life enhancement, so a restrictive
      // browser privacy setting should never block outreach work.
    }
  }, [draft, draftStorageKey, isDraftReady, lead.suggestedReply]);

  useEffect(() => {
    if (copyState !== "copied") return;

    const timeoutId = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const copyDraft = async () => {
    if (!draft.trim()) {
      setCopyState("empty");
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const copyMessage =
    copyState === "copied"
      ? "Draft copied."
      : copyState === "empty"
        ? "Add a draft before copying."
        : copyState === "error"
          ? "Could not copy the draft."
          : null;

  const resetDraft = () => {
    setDraft(lead.suggestedReply);
    setRestoredLocalDraft(false);
  };

  const sourceAction = lead.sourcePost.url ? (
    <Button asChild size="sm" style={{ backgroundColor: C.blue, color: C.white }}>
      <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" />
        <span className="hidden sm:inline">Open on {sourceName}</span>
        <span className="sm:hidden">Open source</span>
      </a>
    </Button>
  ) : (
    <Button type="button" size="sm" disabled>
      <ExternalLink className="size-4" />
      Source unavailable
    </Button>
  );

  const qualificationAction = showQualification && !isReviewOnly ? (
    <Button
      type="button"
      size="sm"
      disabled={disabled || isQualified}
      onClick={() => onQualify(lead.id)}
      style={{ backgroundColor: C.green, color: C.white }}
    >
      {disabled ? (
        <Radar className="size-4 animate-spin" />
      ) : isQualified ? (
        <Check className="size-4" />
      ) : (
        <ShieldCheck className="size-4" />
      )}
      {disabled ? "Qualifying..." : isQualified ? "Qualified" : "Mark as Qualified"}
    </Button>
  ) : null;

  const reviewOnlyNotice = isReviewOnly ? (
    <p className="text-xs font-medium" style={{ color: isScreenedMatch(lead) ? C.red : C.amber }}>
      {isScreenedMatch(lead)
        ? "Screened out by verification — inspect the evidence, but do not use it for outreach or CRM export."
        : "Potential buyer — review the evidence before outreach. It cannot be qualified or exported to your CRM yet."}
    </p>
  ) : null;

  if (!hasSuggestedReply) {
    return (
      <section
        aria-label="Lead actions"
        className={cn("rounded-md border", compact ? "p-3" : "p-4")}
        style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {sourceAction}
          {qualificationAction}
          {isQualified ? (
            <Badge
              variant="outline"
              className="rounded-md"
              style={{
                borderColor: C.green,
                backgroundColor: C.greenPale,
                color: C.green,
              }}
            >
              <Check className="size-3" />
              Qualified
            </Badge>
          ) : null}
        </div>
        {reviewOnlyNotice ? <div className="mt-2">{reviewOnlyNotice}</div> : null}
        {qualificationMessage ? (
          <p className="mt-2 text-xs font-medium" aria-live="polite" style={{ color: C.navySoft }}>
            {qualificationMessage}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`${draftId}-label`}
      className={cn("rounded-md border", compact ? "p-3" : "p-4")}
      style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <label
            htmlFor={draftId}
            id={`${draftId}-label`}
            className="flex items-center gap-2 text-xs font-bold uppercase"
            style={{ color: C.blue }}
          >
            <MessageSquareText className="size-3.5" />
            Suggested reply
          </label>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>
            Edit this draft to match your voice. Changes are saved privately in this browser.
          </p>
        </div>
        {isQualified ? (
          <Badge
            variant="outline"
            className="rounded-md"
            style={{
              borderColor: C.green,
              backgroundColor: C.greenPale,
              color: C.green,
            }}
          >
            <Check className="size-3" />
            Qualified
          </Badge>
        ) : null}
      </div>

      <Textarea
        id={draftId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="A suggested public reply will appear here after verification."
        className={cn(
          compact ? "min-h-20" : "min-h-28",
          "resize-y bg-white text-sm leading-6",
        )}
        style={{ borderColor: C.blueLight, color: C.navy }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: C.muted }} aria-live="polite">
          {restoredLocalDraft
            ? "Restored your saved local draft."
            : isDraftReady && draft !== lead.suggestedReply
              ? "Saved in this browser."
              : "Using the generated draft."}
        </p>
        {draft !== lead.suggestedReply ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={resetDraft}
            style={{ color: C.navySoft }}
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copyDraft}
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.white,
            color: C.blue,
          }}
        >
          {copyState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copyState === "copied" ? "Copied" : "Copy Draft to Clipboard"}
        </Button>
        {sourceAction}
        {qualificationAction}
      </div>

      {reviewOnlyNotice ? <div className="mt-2">{reviewOnlyNotice}</div> : null}

      {copyMessage || qualificationMessage ? (
        <p className="mt-2 text-xs font-medium" aria-live="polite" style={{ color: C.navySoft }}>
          {[copyMessage, qualificationMessage].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </section>
  );
}

function LeadCard({
  lead,
  kind,
  feedbackPending,
  qualificationPending,
  feedbackMessage,
  qualificationMessage,
  onFeedback,
  onQualify,
}: {
  lead: QualifiedLeadView;
  kind: "ready" | "watch";
  feedbackPending: boolean;
  qualificationPending: boolean;
  feedbackMessage: FeedbackNotice | null;
  qualificationMessage: string | null;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
  onQualify: (leadId: string) => void;
}) {
  const isWatch = kind === "watch";
  const matchedAt = formatDate(lead.matchedAt);
  const postedAt = formatDate(lead.sourcePost.publishedAt);
  const labelStyle = isWatch
    ? {
        borderColor: C.amber,
        backgroundColor: C.amberPale,
        color: C.amber,
      }
    : {
        borderColor: C.green,
        backgroundColor: C.greenPale,
        color: C.green,
      };

  return (
    <Card
      className="overflow-hidden rounded-lg bg-white"
      style={{
        borderColor: "rgba(10, 22, 40, 0.08)",
        boxShadow: "0 1px 3px rgba(10, 22, 40, 0.08)",
      }}
    >
      <CardHeader className="gap-3 border-b pb-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-md" style={labelStyle}>
                {isWatch ? (
                  <Radar className="size-3" />
                ) : (
                  <ShieldCheck className="size-3" />
                )}
                {isWatch ? "Watch" : "Ready to act"}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-md"
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navySoft,
                }}
              >
                Verifier {formatScore(lead.verifierScore)}
              </Badge>
              {lead.similarityScore !== null ? (
                <Badge
                  variant="outline"
                  className="rounded-md"
                  style={{
                    borderColor: C.ruleDark,
                    backgroundColor: C.white,
                    color: C.navySoft,
                  }}
                >
                  Semantic {formatScore(lead.similarityScore)}
                </Badge>
              ) : null}
              <span className="text-xs" style={{ color: C.muted }}>
                {lead.sourcePost.source}
                {lead.sourcePost.community ? ` / ${lead.sourcePost.community}` : ""}
                {matchedAt ? ` / matched ${matchedAt}` : ""}
              </span>
            </div>
            <CardTitle className="break-words text-base leading-snug" style={{ color: C.navy }}>
              {lead.sourcePost.title}
            </CardTitle>
            {isWatch ? (
              <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                The verifier found plausible evidence, but it did not meet the
                automatic action threshold. Keep it under review rather than
                treating it as ready to act.
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div
            className="rounded-md border border-l-[3px] bg-white p-4"
            style={{ borderColor: C.rule, borderLeftColor: C.amber }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
              <MessageSquareText className="size-3.5" />
              <span style={{ color: C.amber }}>
                {isWatch ? "Evidence found" : "Buyer pain"}
              </span>
            </div>
            <p className="text-sm leading-6" style={{ color: C.navy }}>
              {lead.painDetected}
            </p>
          </div>
          <div
            className="rounded-md border border-l-[3px] bg-white p-4"
            style={{ borderColor: C.rule, borderLeftColor: C.blue }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
              <Target className="size-3.5" />
              <span style={{ color: C.blue }}>
                {isWatch ? "Why it may fit" : "Fit evidence"}
              </span>
            </div>
            <p className="text-sm leading-6" style={{ color: C.navy }}>
              {lead.matchReason}
            </p>
          </div>
        </div>

        {lead.urgencyReason ? (
          <div
            className="rounded-md border border-l-[3px] bg-white p-4"
            style={{ borderColor: C.rule, borderLeftColor: C.red }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
              <Clock3 className="size-3.5" />
              <span style={{ color: C.red }}>
                {lead.urgencyLevel
                  ? `Urgency: ${lead.urgencyLevel}`
                  : "Explicit urgency"}
              </span>
            </div>
            <p className="text-sm leading-6" style={{ color: C.navy }}>
              “{lead.urgencyReason}”
            </p>
          </div>
        ) : null}

        <div
          className="rounded-md border p-3"
          style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
            <span className="font-bold uppercase" style={{ color: C.navySoft }}>
              Raw source evidence
            </span>
            {lead.sourcePost.author ? <span>Author {lead.sourcePost.author}</span> : null}
            {postedAt ? <span>Posted {postedAt}</span> : null}
          </div>
          {lead.evidenceExcerpt ? (
            <blockquote
              className="mb-3 border-l-2 pl-3 text-sm italic leading-6"
              style={{ borderColor: C.blueLight, color: C.navy }}
            >
              “{lead.evidenceExcerpt}”
            </blockquote>
          ) : null}
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-sm leading-6",
              "max-h-56 overflow-auto",
            )}
            style={{ color: C.navySoft }}
          >
            {lead.sourcePost.text}
          </p>
        </div>

        <LeadOutreach
          key={`outreach-${lead.id}`}
          lead={lead}
          disabled={qualificationPending}
          qualificationMessage={qualificationMessage}
          onQualify={onQualify}
          reviewOnly={isWatch}
        />

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: C.rule }}
        >
          <LeadFeedbackButtons
            leadId={lead.id}
            disabled={feedbackPending}
            onFeedback={onFeedback}
          />
          {feedbackMessage ? (
            <span
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
              role={feedbackMessage.ok ? "status" : "alert"}
              style={{
                borderColor: feedbackMessage.ok ? C.green : C.red,
                backgroundColor: feedbackMessage.ok ? C.greenPale : C.redPale,
                color: feedbackMessage.ok ? C.green : C.red,
              }}
            >
              {feedbackMessage.ok ? (
                <Check className="size-3" />
              ) : (
                <AlertCircle className="size-3" />
              )}
              {feedbackMessage.message}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DenseQueueRow({
  lead,
  selected,
  onSelect,
}: {
  lead: QualifiedLeadView;
  selected: boolean;
  onSelect: (leadId: string) => void;
}) {
  const isWatch = lead.matchStatus === "discovery_candidate";
  const source = sourceDisplayName(lead.sourcePost.source);

  return (
    <button
      type="button"
      onClick={() => onSelect(lead.id)}
      aria-pressed={selected}
      className="w-full border-b border-l-[3px] px-5 py-4 text-left transition-colors hover:bg-[#F7FBFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]"
      style={{
        borderColor: C.rule,
        borderLeftColor: selected ? C.blue : "transparent",
        backgroundColor: selected ? C.blueTint : C.white,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold" style={{ color: C.navySoft }}>
          {source}
          {lead.sourcePost.community ? ` · ${lead.sourcePost.community}` : ""}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor: isWatch ? C.amberPale : C.greenPale,
            color: isWatch ? C.amber : C.green,
          }}
        >
          {isWatch ? "Potential buyer" : "Lead"}
        </span>
      </div>
      <p className="pfd mt-2 truncate text-base leading-5" style={{ color: C.navy }}>
        {lead.sourcePost.title}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs" style={{ color: C.muted }}>
          {lead.painDetected || lead.matchReason}
        </p>
        {lead.urgencyReason ? (
          <span className="shrink-0 text-[10px] font-semibold" style={{ color: C.red }}>
            Time-sensitive
          </span>
        ) : null}
      </div>
    </button>
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
          <Badge
            variant="outline"
            className="h-5 rounded px-1.5 text-[10px]"
            style={{
              borderColor: isWatch ? C.amber : C.green,
              backgroundColor: isWatch ? C.amberPale : C.greenPale,
              color: isWatch ? C.amber : C.green,
            }}
          >
            {isWatch ? "Potential buyer" : "Clear buyer problem"}
          </Badge>
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
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.amber }}>
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            Why this matters
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: C.navy }}>
            {lead.painDetected}
          </p>
          <p className="mt-3 border-t pt-3 text-xs leading-5" style={{ borderColor: C.rule, color: C.navySoft }}>
            <span className="font-semibold" style={{ color: C.navy }}>Why it fits: </span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.navySoft }}>
                Source evidence
              </p>
              <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
                The public text behind this match.
              </p>
            </div>
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

        <section aria-label="Conversation actions" className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <p className="pfd text-base leading-none" style={{ color: C.navy }}>
            Choose a path
          </p>
          <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
            Open only the detail you need right now.
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Conversation actions">
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

        {openDetail === "reply" ? (
          <LeadOutreach
            key={`outreach-${lead.id}`}
            lead={lead}
            disabled={qualificationPending}
            qualificationMessage={qualificationMessage}
            onQualify={onQualify}
            reviewOnly={isWatch}
            compact
            showQualification={false}
          />
        ) : null}

        {openDetail === "outcome" ? (
          <div className="border-t pt-3" style={{ borderColor: C.rule }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            Record outcome
          </p>
          {!isWatch ? (
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
                {qualificationPending ? "Qualifying..." : isQualified ? "Qualified" : "Mark as qualified"}
              </Button>
              {qualificationMessage ? (
                <p className="text-[11px] font-medium" aria-live="polite" style={{ color: C.navySoft }}>
                  {qualificationMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5" style={{ color: C.amber }}>
              This item is evidence to review, not a lead to qualify.
            </p>
          )}
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            Your view
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

function humanizeRunValue(value: string) {
  return value.trim().replace(/[_-]+/g, " ");
}

function sourceDisplayName(source: string) {
  const normalized = source.trim().toLowerCase();
  const knownNames: Record<string, string> = {
    hn: "Hacker News",
    hackernews: "Hacker News",
    hacker_news: "Hacker News",
    reddit: "Reddit",
    lemmy: "Lemmy",
    github: "GitHub",
    stackexchange: "Stack Exchange",
    stack_exchange: "Stack Exchange",
    stackoverflow: "Stack Overflow",
    stack_overflow: "Stack Overflow",
    bluesky: "Bluesky",
    x: "Public conversation",
  };

  return knownNames[normalized] ?? humanizeRunValue(source);
}

function sourceProgressCopy(source: BuyerDemandReportView["sourceProgress"][number]) {
  const count = source.itemCount;
  const postLabel = count === 1 ? "post" : "posts";

  if (source.state === "checking") {
    return count && count > 0
      ? `${count} ${postLabel} found so far`
      : "Checking this source";
  }
  if (source.state === "found") return `${count ?? 0} ${postLabel} collected`;
  if (source.state === "partial") return `${count ?? 0} ${postLabel} found · partial coverage`;
  if (source.state === "no_results") return "No relevant posts this scan";
  return "This source was unavailable";
}

function sourceProgressTone(source: BuyerDemandReportView["sourceProgress"][number]) {
  if (source.state === "found") {
    return { border: C.greenPale, background: C.greenPale, color: C.green };
  }
  if (source.state === "checking") {
    return { border: C.blueLight, background: C.blueTint, color: C.blue };
  }
  if (source.state === "partial") {
    return { border: C.amberPale, background: C.amberPale, color: C.amber };
  }
  if (source.state === "unavailable") {
    return { border: C.redPale, background: C.redPale, color: C.red };
  }
  return { border: C.rule, background: C.offWhite, color: C.muted };
}

function DiscoveryScanReport({ report }: { report: BuyerDemandReportView }) {
  const summary = report.summary;
  const isRunning = !report.isTerminal;
  const isPartial = report.status === "partial";
  const isFailed = report.status === "failed";
  // The terminal summary is authoritative. Source-list events can contain a
  // fallback source that never ran, which must not remain shown as “Checking”.
  const displayedSourceProgress = report.isTerminal
    ? report.sourceProgress.filter((source) => source.state !== "checking")
    : report.sourceProgress;
  const statusLabel = isRunning ? "Scanning" : isPartial ? "Partial" : isFailed ? "Needs attention" : "Complete";
  const title = isRunning
    ? "Checking public conversations"
    : isPartial
      ? "Partially completed discovery scan"
      : isFailed
        ? "Discovery scan needs attention"
        : "What this scan found";
  const sourceFailureCount = summary.sourceFailures ?? 0;
  const sourcesWithCandidates = displayedSourceProgress
    .filter(
      (source) =>
        (source.state === "found" || source.state === "partial") &&
        (source.plausibleCount ?? 0) > 0,
    )
    .sort((a, b) => (b.plausibleCount ?? 0) - (a.plausibleCount ?? 0));
  const candidateConversationCount = sourcesWithCandidates.reduce(
    (total, source) => total + (source.plausibleCount ?? 0),
    0,
  );
  const unavailableSourceNames = displayedSourceProgress
    .filter((source) => source.state === "unavailable")
    .map((source) => sourceDisplayName(source.source));
  const formatSourceList = (sources: string[]) => {
    if (sources.length < 2) return sources[0] ?? "available sources";
    if (sources.length === 2) return `${sources[0]} and ${sources[1]}`;
    return `${sources.slice(0, -1).join(", ")}, and ${sources.at(-1)}`;
  };
  const candidateSourceNames = sourcesWithCandidates.map((source) =>
    sourceDisplayName(source.source),
  );
  const discoveryFinding =
    candidateConversationCount > 0
      ? `${candidateConversationCount} candidate conversation${candidateConversationCount === 1 ? "" : "s"} came from ${formatSourceList(candidateSourceNames)}.`
      : "The completed sources did not surface any candidate conversations for this brief.";
  const coverageNote =
    unavailableSourceNames.length > 0
      ? `${formatSourceList(unavailableSourceNames)} ${unavailableSourceNames.length === 1 ? "was" : "were"} unavailable.`
      : sourceFailureCount > 0
        ? `${sourceFailureCount} source${sourceFailureCount === 1 ? " was" : "s were"} unavailable.`
        : null;
  const compactStats = [
    candidateSourceNames.length > 0
      ? `${candidateSourceNames.length} source${candidateSourceNames.length === 1 ? "" : "s"} with candidates`
      : null,
    coverageNote,
  ].filter((value): value is string => Boolean(value));
  const detail = isRunning
    ? "Each source reports here as it finishes. New posts are checked before they appear as potential buyers or leads."
    : isPartial
      ? `${discoveryFinding} ${coverageNote ?? "Completed sources still produced usable discovery results."}`
      : isFailed
        ? "This discovery scan could not complete. Check the source details below before trying again."
        : summary.verifierPending
          ? "Source collection is complete. The posts below are still being checked for real buyer problems."
          : `${discoveryFinding} These are discovery candidates, not lead counts.`;

  return (
    <Card
      className="shrink-0 gap-0 overflow-hidden rounded-xl py-0 shadow-sm"
      style={{ borderColor: isPartial ? C.amber : isFailed ? C.red : C.blueLight }}
    >
      <CardContent className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 marker:hidden sm:flex-row sm:items-start sm:justify-between sm:px-5 lg:px-6 [&::-webkit-details-marker]:hidden" style={{ backgroundColor: C.offWhite }}>
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: isFailed ? C.redPale : isPartial ? C.amberPale : isRunning ? C.blueTint : C.greenPale,
                color: isFailed ? C.red : isPartial ? C.amber : isRunning ? C.blue : C.green,
              }}
              aria-hidden="true"
            >
              {isFailed || isPartial ? <AlertCircle className="size-4" /> : isRunning ? <Radar className="size-4 animate-pulse" /> : <Check className="size-4" />}
            </span>
            <div className="min-w-0">
              <h2 className="pfd text-lg leading-5 lg:text-xl lg:leading-6" style={{ color: C.navy }}>{title}</h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-5" style={{ color: C.navySoft }}>{detail}</p>
              {compactStats.length > 0 ? (
                <p className="mt-2 text-[11px]" style={{ color: C.muted }}>{compactStats.join(" Â· ")}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <Badge
              variant="outline"
              className="rounded-full px-2.5 py-0.5 text-[10px]"
              style={{
                borderColor: isFailed ? C.red : isPartial ? C.amber : C.blueLight,
                backgroundColor: isFailed ? C.redPale : isPartial ? C.amberPale : C.blueTint,
                color: isFailed ? C.red : isPartial ? C.amber : C.blue,
              }}
            >
              {statusLabel}
            </Badge>
            <span className="text-[11px] font-semibold" style={{ color: C.blue }}>
              <span className="group-open:hidden">View report</span>
              <span className="hidden group-open:inline">Hide report</span>
            </span>
          </div>
          </summary>

          <div className="hidden border-t group-open:block" style={{ borderColor: C.rule }}>
          <div className="px-4 py-4 sm:px-5 lg:px-6">
          {isPartial ? (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-5"
              role="status"
              style={{ borderColor: C.amber, backgroundColor: C.amberPale, color: C.navySoft }}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: C.amber }} />
              <div>
                <p className="font-semibold" style={{ color: C.navy }}>Coverage note</p>
                <p className="mt-0.5">
                  {coverageNote ?? "Coverage was partial. The available source results are shown below."}
                </p>
              </div>
            </div>
          ) : null}
          {displayedSourceProgress.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Source-by-source scan results">
              {displayedSourceProgress.map((source) => {
                const tone = sourceProgressTone(source);
                const isChecking = source.state === "checking";
                const isFound = source.state === "found" || source.state === "partial";
                return (
                  <li key={source.source} className="rounded-lg border px-3 py-2.5" style={{ borderColor: tone.border, backgroundColor: tone.background }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold" style={{ color: C.navy }}>{sourceDisplayName(source.source)}</p>
                      <span className="shrink-0" style={{ color: tone.color }} aria-hidden="true">
                        {isChecking ? <Radar className="size-3.5 animate-pulse" /> : source.state === "unavailable" || source.state === "partial" ? <AlertCircle className="size-3.5" /> : isFound ? <Check className="size-3.5" /> : <Search className="size-3.5" />}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium" style={{ color: tone.color }}>{sourceProgressCopy(source)}</p>
                    {isFound && source.plausibleCount !== null ? (
                      <p className="mt-1 text-[10px] leading-4" style={{ color: C.navySoft }}>
                        {source.plausibleCount} candidate conversation{source.plausibleCount === 1 ? "" : "s"}
                        {source.newPostCount !== null && source.newPostCount > 0 ? ` · ${source.newPostCount} new` : ""}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed px-3 py-3 text-xs leading-5" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
              Preparing source checks. Each source will appear here as soon as it starts responding.
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3" style={{ borderColor: C.rule }}>
            <p className="text-[11px]" style={{ color: C.muted }}>
              {compactStats.length > 0 ? compactStats.join(" · ") : "Post results update as sources finish."}
            </p>
            <Button asChild size="xs" variant="outline" className="h-7 px-2 text-[10px]" style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}>
              <Link href="/dashboard/brief">Improve brief</Link>
            </Button>
          </div>
          {summary.caveat ? <p className="mt-2 text-[10px] leading-4" style={{ color: C.muted }}>{summary.caveat}</p> : null}
          </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function CompletedDiscoveryReport({ report }: { report: BuyerDemandReportView }) {
  const completedAt = formatDate(report.completedAt);
  const summary = report.summary;
  const sourcesWithSignalOrFailure = summary.sources.filter(
    (source) => source.failed || (source.itemCount ?? 0) > 0,
  );
  const zeroResultSourceCount = summary.sources.length - sourcesWithSignalOrFailure.length;
  const isPartial = report.status === "partial";
  const isSkipped = report.status === "skipped";
  const isFailed = report.status === "failed";
  const title = isPartial
    ? "Partially completed discovery scan"
    : isSkipped
      ? "Discovery scan skipped"
      : isFailed
        ? "Discovery scan needs attention"
        : "Completed discovery scan";
  const detail = summary.verifierPending
    ? "Source collection is complete; remaining evidence is still being verified."
    : isPartial
      ? "Some source coverage was unavailable. No conversations reached Ready to act in the available results."
      : isSkipped
        ? "This scan did not run. Review the matching brief and source configuration before trying again."
        : isFailed
          ? "The scan could not complete. Review the matching brief and source configuration before trying again."
        : "No conversations reached Ready to act in this completed scan.";
  const statusLabel = isPartial
    ? "Partial"
    : isSkipped
      ? "Skipped"
      : isFailed
        ? "Needs attention"
        : "Complete";
  const compactStats = [
    summary.totalHits !== null ? `${summary.totalHits} collected` : null,
    summary.plausibleHits !== null ? `${summary.plausibleHits} reviewed` : null,
    summary.sourceFailures && summary.sourceFailures > 0
      ? `${summary.sourceFailures} unavailable`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <Card className="rounded-lg shadow-sm" style={{ borderColor: C.blueLight }}>
      <CardContent className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: isFailed ? C.redPale : isPartial ? C.amberPale : C.greenPale,
                color: isFailed ? C.red : isPartial ? C.amber : C.green,
              }}
              aria-hidden="true"
            >
              {isFailed || isPartial ? <AlertCircle className="size-3.5" /> : <Check className="size-3.5" />}
            </span>
            <p className="truncate text-xs font-semibold" style={{ color: C.navy }}>
              {title}
            </p>
          </div>
          {compactStats.length > 0 ? (
            <p className="hidden text-[11px] sm:block" style={{ color: C.navySoft }}>
              {compactStats.join(" · ")}
            </p>
          ) : null}
          <Badge
            variant="outline"
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{
              borderColor: isFailed ? C.red : isPartial ? C.amber : C.blueLight,
              backgroundColor: isFailed ? C.redPale : isPartial ? C.amberPale : C.blueTint,
              color: isFailed ? C.red : isPartial ? C.amber : C.blue,
            }}
          >
            {statusLabel}{completedAt ? ` · ${completedAt}` : ""}
          </Badge>
        </div>

        <details className="group mt-1.5">
          <summary
            className="cursor-pointer select-none text-[11px] font-semibold marker:hidden"
            style={{ color: C.blue }}
          >
            <span className="group-open:hidden">View scan details</span>
            <span className="hidden group-open:inline">Hide scan details</span>
          </summary>
          <div className="mt-2 space-y-2 border-t pt-2" style={{ borderColor: C.rule }}>
            <p className="text-xs leading-5" style={{ color: C.navySoft }}>
              {detail}
            </p>

            {summary.totalHits === 0 ? (
              <p className="text-xs leading-5" style={{ color: C.navySoft }}>
                No public items matched this brief and time window. Refine the buyer-language phrases before the next daily scan.
              </p>
            ) : null}

            {sourcesWithSignalOrFailure.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {sourcesWithSignalOrFailure.map((source) => (
                  <Badge
                    key={source.source}
                    variant="outline"
                    className="rounded-md px-1.5 py-0 text-[10px]"
                    style={{
                      borderColor: source.failed ? C.red : C.ruleDark,
                      backgroundColor: source.failed ? C.redPale : C.white,
                      color: source.failed ? C.red : C.navySoft,
                    }}
                  >
                    {sourceDisplayName(source.source)}
                    {source.itemCount !== null ? ` ${source.itemCount}` : ""}
                    {source.failed ? " unavailable" : ""}
                  </Badge>
                ))}
                {zeroResultSourceCount > 0 ? (
                  <span className="text-[10px]" style={{ color: C.muted }}>
                    +{zeroResultSourceCount} with no relevant results
                  </span>
                ) : null}
              </div>
            ) : null}

            {summary.xFallback ? (
              <p className="text-[11px]" style={{ color: C.muted }}>
                Additional coverage
                {summary.xFallback.outcome
                  ? `: ${humanizeRunValue(summary.xFallback.outcome)}`
                  : ""}
                {summary.xFallback.reason
                  ? ` (${humanizeRunValue(summary.xFallback.reason)})`
                  : ""}
              </p>
            ) : null}

            {summary.caveat ? (
              <p className="text-[10px] leading-4" style={{ color: C.muted }}>
                {summary.caveat}
              </p>
            ) : null}

            <Button
              asChild
              size="xs"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
            >
              <Link href="/dashboard/brief">Improve brief</Link>
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function BuyerDemandPatterns({
  report,
}: {
  report: BuyerDemandReportView;
}) {
  if (report.marketPatterns.length === 0) return null;

  return (
    <section aria-labelledby="buyer-demand-patterns" className="space-y-2">
      <div>
        <h2
          id="buyer-demand-patterns"
          className="font-serif text-xl leading-none"
          style={{ color: C.navy }}
        >
          What repeats
        </h2>
        <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
          Themes appear only when the same verifier-confirmed need shows up in
          at least two ready-to-act matches.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {report.marketPatterns.map((pattern) => (
          <Card
            key={pattern.label}
            className="rounded-md shadow-none"
            style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
          >
            <CardContent className="space-y-1.5 p-3">
              <p className="font-serif text-base leading-5" style={{ color: C.navy }}>
                {pattern.label}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>
                {pattern.matchCount} ready-to-act match{pattern.matchCount === 1 ? "" : "es"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * This is intentionally a read-only research surface. Unlike Ready to act or
 * Watch, it has no qualification, reply, feedback, or CRM affordances. Every
 * displayed phrase has already passed a literal source-text grounding check
 * on the server.
 */
export function BuyerLanguageResearch({
  research,
  requestBuyerLanguageResearch,
  layout = "widget",
}: {
  research: BuyerLanguageResearchView;
  requestBuyerLanguageResearch?: BuyerLanguageResearchRequestAction;
  layout?: "widget" | "library";
}) {
  const router = useRouter();
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [hasRequested, setHasRequested] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [isRequestPending, startRequestTransition] = useTransition();
  const sources = useMemo(
    () => [...new Set(research.evidence.map((item) => item.source))].sort(),
    [research.evidence],
  );
  const visibleEvidence = useMemo(
    () =>
      sourceFilter === "all"
        ? research.evidence
        : research.evidence.filter((item) => item.source === sourceFilter),
    [research.evidence, sourceFilter],
  );

  const requestResearch = () => {
    if (!requestBuyerLanguageResearch || hasRequested) return;

    setRequestMessage(null);
    startRequestTransition(async () => {
      try {
        const result = await requestBuyerLanguageResearch();
        setRequestMessage(result.message);
        if (result.ok) {
          // Avoid repeated paid scans from a double-click or a stale browser
          // view. The server action remains the authoritative rate-limit and
          // authorization boundary.
          setHasRequested(true);
          router.refresh();
        }
      } catch {
        setRequestMessage("Could not start buyer-language research. Please try again.");
      }
    });
  };

  if (layout === "library") {
    const canRequestMore =
      research.availability === "available" &&
      Boolean(requestBuyerLanguageResearch) &&
      !hasRequested;

    return (
      <section id="buyer-language-research" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>
              Evidence
            </p>
            <h2 className="mt-1 font-serif text-2xl leading-none" style={{ color: C.navy }}>
              Language worth keeping
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5" style={{ color: C.muted }}>
              Exact phrases from accepted public evidence. Use them to sharpen
              your matching brief, not to qualify prospects.
            </p>
          </div>
          <Badge
            variant="outline"
            className="h-6 rounded px-1.5 text-[10px]"
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.blueTint,
              color: C.blue,
            }}
          >
            <MessageSquareText className="size-3" />
            Research only
          </Badge>
        </div>

        <div
          className="rounded-md border p-4"
          style={{
            borderColor: C.rule,
            backgroundColor:
              research.evidence.length > 0 ? C.white : C.offWhite,
          }}
        >
          {research.evidence.length > 0 ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-serif text-xl leading-none" style={{ color: C.navy }}>
                    {research.evidence.length} phrase
                    {research.evidence.length === 1 ? "" : "s"} in the library
                  </p>
                  <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
                    Drawn from {sources.length} source{sources.length === 1 ? "" : "s"}. Exact,
                    source-grounded phrases only.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEvidence((current) => !current)}
                    className="h-8 px-2.5 text-xs"
                    style={{
                      borderColor: C.ruleDark,
                      backgroundColor: C.white,
                      color: C.navySoft,
                    }}
                  >
                    {showEvidence ? "Close evidence" : "Browse evidence"}
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs"
                    style={{
                      borderColor: C.blueLight,
                      backgroundColor: C.white,
                      color: C.blue,
                    }}
                  >
                    <Link href="/dashboard/brief">Open matching brief</Link>
                  </Button>
                </div>
              </div>

              {showEvidence ? (
                <div className="mt-5 border-t pt-4" style={{ borderColor: C.rule }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold" style={{ color: C.navy }}>
                      Browse the original wording
                    </p>
                    {sources.length > 1 ? (
                      <label className="flex items-center gap-2 text-xs" style={{ color: C.navySoft }}>
                        Source
                        <select
                          value={sourceFilter}
                          onChange={(event) => {
                            setSourceFilter(event.target.value);
                            setSelectedEvidenceId(null);
                          }}
                          className="h-8 rounded border bg-white px-2 text-xs outline-none"
                          style={{ borderColor: C.ruleDark, color: C.navy }}
                        >
                          <option value="all">All sources</option>
                          {sources.map((source) => (
                            <option key={source} value={source}>
                              {sourceDisplayName(source)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {visibleEvidence.map((item) => {
                      const capturedAt = formatDate(item.capturedAt);
                      const isSelected = selectedEvidenceId === item.id;

                      return (
                        <div key={item.id} className="rounded-md border" style={{ borderColor: C.rule }}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedEvidenceId((current) =>
                                current === item.id ? null : item.id,
                              )
                            }
                            className="flex w-full items-start justify-between gap-4 p-3 text-left"
                            style={{ backgroundColor: isSelected ? C.offWhite : C.white }}
                            aria-expanded={isSelected}
                          >
                            <span className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.navySoft }}>
                                {sourceDisplayName(item.source)}
                                {capturedAt ? ` · Captured ${capturedAt}` : ""}
                              </span>
                              <span
                                className="mt-1 block line-clamp-2 text-xs leading-5"
                                style={{ color: C.navy }}
                              >
                                {item.excerpt}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px]" style={{ color: C.blue }}>
                              {isSelected ? "Less" : "Read"}
                            </span>
                          </button>

                          {isSelected ? (
                            <div className="border-t px-3 py-3" style={{ borderColor: C.rule }}>
                              <blockquote
                                className="border-l-2 pl-3 text-sm italic leading-6"
                                style={{ borderColor: C.blueLight, color: C.navy }}
                              >
                                “{item.excerpt}”
                              </blockquote>
                              {item.sourceUrl ? (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 h-7 px-2 text-[11px]"
                                  style={{
                                    borderColor: C.blueLight,
                                    backgroundColor: C.white,
                                    color: C.blue,
                                  }}
                                >
                                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="size-3.5" />
                                    View original source
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="max-w-xl">
              <p className="font-serif text-2xl leading-none" style={{ color: C.navy }}>
                Your language library is still growing.
              </p>
              <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
                {research.availability === "available"
                  ? "No accepted buyer-language evidence has been collected yet. Start a scan when you are ready."
                  : "Accepted buyer-language evidence will appear here once the optional research store is enabled."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canRequestMore ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isRequestPending}
                    onClick={requestResearch}
                    className="h-8 px-2.5 text-xs"
                    style={{ backgroundColor: C.blue, color: C.white }}
                  >
                    {isRequestPending ? "Starting…" : "Find more words"}
                  </Button>
                ) : null}
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  style={{
                    borderColor: C.blueLight,
                    backgroundColor: C.white,
                    color: C.blue,
                  }}
                >
                  <Link href="/dashboard/brief">Review matching brief</Link>
                </Button>
              </div>
            </div>
          )}

          {research.evidence.length > 0 && canRequestMore ? (
            <details className="mt-4 border-t pt-3" style={{ borderColor: C.rule }}>
              <summary className="cursor-pointer text-xs font-medium" style={{ color: C.navySoft }}>
                Find more buyer language
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="max-w-lg text-xs leading-5" style={{ color: C.muted }}>
                  Start an optional scan for more source-grounded wording. New evidence appears here after review.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRequestPending}
                  onClick={requestResearch}
                  className="h-7 px-2 text-[11px]"
                  style={{
                    borderColor: C.blueLight,
                    backgroundColor: C.white,
                    color: C.blue,
                  }}
                >
                  {isRequestPending ? "Starting…" : "Start scan"}
                </Button>
              </div>
            </details>
          ) : null}

          {requestMessage ? (
            <p
              className="mt-3 text-xs leading-5"
              role="status"
              aria-live="polite"
              style={{ color: C.navySoft }}
            >
              {requestMessage}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section id="buyer-language-research" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold" style={{ color: C.navy }}>
            Buyer words
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
            Exact phrases from accepted, source-grounded public evidence in this
            workspace. This is research for refining your matching brief — not
            an opportunity queue, and it cannot be qualified or sent to your CRM.
          </p>
        </div>
        <Badge
          variant="outline"
          className="h-6 rounded px-1.5 text-[10px]"
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.blueTint,
            color: C.blue,
          }}
        >
          <MessageSquareText className="size-3" />
          Research only
        </Badge>
      </div>

      {research.evidence.length > 0 ? (
        <div className="grid max-h-[360px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {research.evidence.map((item) => {
            const capturedAt = formatDate(item.capturedAt);

            return (
              <Card
                key={item.id}
                className="rounded-md shadow-sm"
                style={{ borderColor: C.rule }}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase" style={{ color: C.navySoft }}>
                      {sourceDisplayName(item.source)}
                    </span>
                    {capturedAt ? (
                      <span className="text-xs" style={{ color: C.muted }}>
                        Captured {capturedAt}
                      </span>
                    ) : null}
                  </div>
                  <blockquote
                    className="border-l-2 pl-2 text-xs italic leading-5"
                    style={{ borderColor: C.blueLight, color: C.navy }}
                  >
                    “{item.excerpt}”
                  </blockquote>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs leading-5" style={{ color: C.muted }}>
                      Exact excerpt preserved from the original source.
                    </p>
                    {item.sourceUrl ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        style={{
                          borderColor: C.blueLight,
                          backgroundColor: C.white,
                          color: C.blue,
                        }}
                      >
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="size-3.5" />
                          View source
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-md shadow-sm" style={{ borderColor: C.rule }}>
          <CardContent className="space-y-2 p-3">
            <p className="text-xs leading-5" style={{ color: C.navySoft }}>
              {research.availability === "available"
                ? "No accepted, source-grounded buyer-language evidence has been collected yet."
                : "Buyer-language research will appear after the optional evidence store is enabled and accepted evidence is recorded."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {research.availability === "available" &&
              requestBuyerLanguageResearch &&
              !hasRequested ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRequestPending}
                  onClick={requestResearch}
                  className="h-7 px-2 text-[11px]"
                  style={{
                    borderColor: C.blueLight,
                    backgroundColor: C.white,
                    color: C.blue,
                  }}
                >
                  {isRequestPending ? "Starting…" : "Find more words"}
                </Button>
              ) : null}
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navySoft,
                }}
              >
                <a href="/settings">Edit brief</a>
              </Button>
            </div>
            {requestMessage ? (
              <p
                className="text-xs leading-5"
                role="status"
                aria-live="polite"
                style={{ color: C.navySoft }}
              >
                {requestMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function WarmUpState({
  crawlJob,
  serviceProfile,
  isWarmingUp,
}: {
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  isWarmingUp: boolean;
}) {
  const status = pipelineStatus({ crawlJob, serviceProfile, isWarmingUp });
  const activeStepIndex = firstScanStepIndex({ crawlJob, serviceProfile, isWarmingUp });
  const router = useRouter();
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isRetryPending, startRetryTransition] = useTransition();
  const canRetry = "canRetry" in status && status.canRetry;

  const retryEmbedding = () => {
    setRetryMessage(null);
    startRetryTransition(async () => {
      const result = await retryServiceProfileEmbedding(serviceProfile.id);
      setRetryMessage(result.message);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl border p-8 text-center"
      style={{ borderColor: C.rule, backgroundColor: C.white }}
    >
      <div
        className="pointer-events-none absolute -left-12 -top-16 size-44 rounded-full"
        style={{ backgroundColor: C.blueTint }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-10 size-60 rounded-full border"
        style={{ borderColor: C.blueLight }}
        aria-hidden="true"
      />
      <div className="relative">
      <div
        className="mx-auto flex size-11 items-center justify-center rounded-md"
        style={{ backgroundColor: C.bluePale, color: C.blue }}
      >
        <Radar className="size-5 animate-pulse" />
      </div>
      <Badge
        variant="outline"
        className="mt-4 rounded-md"
        style={{
          borderColor: C.blueLight,
          backgroundColor: C.blueTint,
          color: C.blue,
        }}
      >
        {status.label}
      </Badge>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
        Your Prospect Desk
      </p>
      <h3 className="pfd mt-2 text-2xl leading-none" style={{ color: C.navy }}>
        Building your first view
      </h3>
      {serviceProfile.websiteUrl ? (
        <p className="mx-auto mt-3 max-w-md truncate text-xs font-medium" style={{ color: C.navySoft }}>
          Website connected: {serviceProfile.websiteUrl}
        </p>
      ) : null}
      <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: C.muted }}>
        {status.detail} We will add conversations to your radar as soon as they meet the evidence bar.
      </p>
      <ol className="mx-auto mt-6 grid max-w-lg gap-2 text-left">
        {FIRST_SCAN_STEPS.map((step, index) => {
          const isComplete = index < activeStepIndex;
          const isActive = index === activeStepIndex;
          return (
            <li
              key={step}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              style={{
                borderColor: isActive ? C.blueLight : C.rule,
                backgroundColor: isActive ? C.blueTint : C.white,
              }}
            >
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                style={{
                  borderColor: isComplete || isActive ? C.blue : C.ruleDark,
                  backgroundColor: isComplete ? C.blue : C.white,
                  color: isComplete ? C.white : isActive ? C.blue : C.muted,
                }}
              >
                {isComplete ? <Check className="size-3" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: isComplete || isActive ? C.navy : C.muted }}
              >
                {step}
              </span>
              {isActive ? (
                <span className="ml-auto text-[10px] font-semibold" style={{ color: C.blue }}>
                  In progress
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {canRetry ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRetryPending}
            onClick={retryEmbedding}
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.white,
              color: C.blue,
            }}
          >
            {isRetryPending ? "Retrying embedding…" : "Retry embedding"}
          </Button>
          {retryMessage ? (
            <p className="max-w-md text-xs leading-5" style={{ color: C.muted }}>
              {retryMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mx-auto mt-2 max-w-md text-xs leading-5" style={{ color: C.muted }}>
        This dashboard refreshes while the first pass is running. You can leave
        it open; there is nothing else to set up right now.
      </p>
      </div>
    </div>
  );
}

function ArcliSignalMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-4 shrink-0", className)} aria-hidden="true">
      <span className="absolute inset-0 rounded-full border-[1.5px]" style={{ borderColor: C.blue }} />
      <span className="absolute inset-[22%] rounded-full border" style={{ borderColor: C.blue }} />
      <span className="absolute inset-[43%] rounded-full" style={{ backgroundColor: C.blue }} />
      <span className="absolute right-0 top-[4%] size-[22%] rounded-full border-2" style={{ borderColor: C.white, backgroundColor: C.blue }} />
    </span>
  );
}

function ArcliQueueMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-4 shrink-0 flex-col justify-center gap-[3px]", className)} aria-hidden="true">
      <span className="flex items-center gap-[3px]">
        <span className="size-[3px] rounded-full" style={{ backgroundColor: C.blue }} />
        <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: C.blue }} />
      </span>
      <span className="flex items-center gap-[3px]">
        <span className="size-[3px] rounded-full" style={{ backgroundColor: C.blue }} />
        <span className="h-[2px] w-3/4 rounded-full" style={{ backgroundColor: C.blue }} />
      </span>
      <span className="flex items-center gap-[3px]">
        <span className="size-[3px] rounded-full" style={{ backgroundColor: C.blue }} />
        <span className="h-[2px] w-1/2 rounded-full" style={{ backgroundColor: C.blue }} />
      </span>
    </span>
  );
}

function DiscoverySourceBar({
  serviceProfile,
  status,
  discoveryStatus,
}: {
  serviceProfile: ServiceProfileView;
  status: ReturnType<typeof pipelineStatus>;
  discoveryStatus: BuyerDemandReportView["status"];
}) {
  const domain = sourceDomain(serviceProfile.websiteUrl);
  const normalizedDiscoveryStatus = normalizedStatus(discoveryStatus);
  const latestDiscoveryWasPartial = normalizedDiscoveryStatus === "partial";
  const discoveryNeedsAttention = ["failed", "skipped"].includes(
    normalizedDiscoveryStatus ?? "",
  );
  const discoveryIsRunning = ["queued", "pending", "running"].includes(
    normalizedDiscoveryStatus ?? "",
  );
  const discoveryIsComplete = normalizedDiscoveryStatus === "completed";
  const websiteSetupNeedsAttention = ["Needs attention", "Profile details needed"].includes(
    status.label,
  );
  const displayStatus = latestDiscoveryWasPartial
    ? "Discovery partial"
    : discoveryNeedsAttention
      ? "Discovery needs attention"
      : discoveryIsRunning
        ? "Discovery in progress"
        : discoveryIsComplete
          ? "Latest discovery complete"
          : websiteSetupNeedsAttention
            ? status.label
          : status.label === "Latest scan complete"
            ? "Website setup complete"
            : status.label;
  const isReady = discoveryIsComplete || status.label === "Latest scan complete";
  const scanTone = isReady
    ? { border: C.green, background: C.greenPale, foreground: C.green }
    : latestDiscoveryWasPartial
      ? { border: C.amber, background: C.amberPale, foreground: C.amber }
      : discoveryNeedsAttention || websiteSetupNeedsAttention
        ? { border: C.red, background: C.redPale, foreground: C.red }
      : { border: C.blueLight, background: C.bluePale, foreground: C.blue };
  const scanInsight = latestDiscoveryWasPartial
    ? "Some sources were unavailable. Results from the sources that completed are still included below."
    : discoveryNeedsAttention
      ? "Open the discovery report for source details, then tune your brief before the next run."
      : discoveryIsRunning
        ? "Arcli is checking public conversations against your matching brief."
        : discoveryIsComplete
          ? "Your source report is ready. New matches appear here only after they pass your brief."
          : websiteSetupNeedsAttention
            ? status.detail
          : isReady
            ? "Website setup is complete. Your first public-source discovery run will appear here."
            : "Arcli is preparing your website and matching brief for public-source discovery.";
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState(serviceProfile.websiteUrl ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  useEffect(() => {
    setWebsiteUrl(serviceProfile.websiteUrl ?? "");
  }, [serviceProfile.websiteUrl]);

  const submitWebsite = () => {
    let normalizedWebsiteUrl: string;
    try {
      const candidate = /^https?:\/\//i.test(websiteUrl.trim())
        ? websiteUrl.trim()
        : `https://${websiteUrl.trim()}`;
      const parsed = new URL(candidate);
      if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Enter a valid website URL.");
      }
      parsed.hash = "";
      normalizedWebsiteUrl = parsed.toString();
    } catch {
      setMessage({ ok: false, text: "Enter a valid HTTP(S) website URL." });
      return;
    }

    setMessage(null);
    startSubmitting(async () => {
      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: normalizedWebsiteUrl }),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          scanStarted?: boolean;
          error?: string;
          message?: string;
        } | null;
        const wasAccepted =
          response.ok && payload?.success === true && payload?.scanStarted !== false;

        if (!wasAccepted) {
          setMessage({
            ok: false,
            text:
              payload?.error ??
              payload?.message ??
              "We could not queue a fresh website scan. Please try again later.",
          });
          return;
        }

        router.replace("/dashboard/discovery?scan=1");
      } catch {
        setMessage({
          ok: false,
          text: "We could not reach workspace settings. Please try again.",
        });
      }
    });
  };

  return (
    <section
      className="grid shrink-0 grid-cols-1 overflow-hidden rounded-xl border bg-white shadow-sm lg:grid-cols-[15rem_minmax(22rem,1fr)_23rem]"
      style={{ borderColor: C.rule }}
      aria-label="Active discovery source"
    >
      {isSubmitting ? <StartingDiscoveryScreen /> : null}
      <div
        className="relative flex min-w-0 items-center gap-2.5 overflow-hidden p-3"
        style={{ backgroundColor: C.bluePale }}
      >
        <div
          className="absolute -right-8 -top-10 hidden size-28 rounded-full xl:block"
          style={{ backgroundColor: "rgba(59,154,232,0.17)" }}
          aria-hidden="true"
        />
        <div
          className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white"
          style={{ borderColor: C.blueLight, color: C.blue }}
        >
          <ArcliSignalMark />
        </div>
        <div className="relative min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Prospect discovery
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: C.navy }} title={serviceProfile.websiteUrl ?? undefined}>
            {domain ?? "Website needed"}
          </p>
          <p className="mt-0.5 hidden max-w-[18rem] text-[10px] leading-4 xl:block" style={{ color: C.navySoft }}>
            Your source for public buying signals.
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t p-3 lg:border-l lg:border-t-0" style={{ borderColor: C.rule }}>
        <label htmlFor="dashboard-website-url" className="sr-only" style={{ color: C.muted }}>
          Website to scan
        </label>
        <input
          id="dashboard-website-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          value={websiteUrl}
          disabled={isSubmitting}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-white px-3 text-xs outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#1B6EBF] disabled:cursor-not-allowed disabled:opacity-70"
          style={{ borderColor: C.ruleDark, color: C.navy }}
          placeholder="https://yourcompany.com"
        />
        <Button
          type="button"
          size="xs"
          disabled={isSubmitting}
          onClick={submitWebsite}
          className="h-9 shrink-0 rounded-lg px-3 text-xs"
          style={{ backgroundColor: C.blue, color: C.white }}
        >
          {isSubmitting
            ? "Queueing…"
            : serviceProfile.websiteUrl
              ? "Find new leads"
              : "Save & scan"}
        </Button>
        <p className="hidden w-full text-[10px] leading-4 2xl:block" style={{ color: C.muted }}>
          Arcli filters fresh conversations through your matching brief.
        </p>
      </div>
      <div className="min-w-0 border-t p-3 lg:border-l lg:border-t-0" style={{ backgroundColor: latestDiscoveryWasPartial ? "#FFFCF3" : C.offWhite, borderColor: C.rule }}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>
            Discovery health
          </p>
        <span
          className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{
            borderColor: scanTone.border,
            backgroundColor: scanTone.background,
            color: scanTone.foreground,
          }}
        >
          {displayStatus}
        </span>
          <Button
            asChild
            type="button"
            size="xs"
            variant="outline"
            className="h-7 px-2.5 text-[10px]"
            style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
          >
            <Link href="/dashboard/brief">Tune matching brief</Link>
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-4" style={{ color: C.navySoft }}>
          {scanInsight}
        </p>
      </div>
      {message ? (
        <div className="col-span-full flex items-start gap-2 border-t px-3 py-2" style={{ borderColor: C.rule }}>
          <ArcliSignalMark className="mt-0.5 size-3.5" />
          <p
            className="text-[11px] leading-4"
            role={message.ok ? "status" : "alert"}
            style={{ color: message.ok ? C.green : C.red }}
          >
            {message.text}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ScanOverview({
  status,
  leadCount,
  potentialCount,
  feedCount,
  discoveryStatus,
  lastUpdatedAt,
  isRefreshing,
  onRefresh,
}: {
  status: ReturnType<typeof pipelineStatus>;
  leadCount: number;
  potentialCount: number;
  feedCount: number;
  discoveryStatus: BuyerDemandReportView["status"];
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const normalizedDiscoveryStatus = normalizedStatus(discoveryStatus);
  const isPartial = normalizedDiscoveryStatus === "partial";
  const isReportFailed = normalizedDiscoveryStatus === "failed";
  const isDiscoveryRunning = ["queued", "pending", "running"].includes(
    normalizedDiscoveryStatus ?? "",
  );
  const discoveryIsComplete = normalizedDiscoveryStatus === "completed";
  const websiteSetupIsComplete = status.label === "Latest scan complete";
  const websiteSetupNeedsAttention = ["Needs attention", "Profile details needed"].includes(
    status.label,
  );
  const displayLabel = isPartial
    ? "Discovery partial"
    : isReportFailed
      ? "Discovery needs attention"
      : isDiscoveryRunning
        ? "Discovery in progress"
        : discoveryIsComplete
          ? "Latest discovery complete"
          : websiteSetupNeedsAttention
            ? status.label
          : websiteSetupIsComplete
            ? "Website setup complete"
            : "Website setup";
  const title = isPartial
    ? "Your latest discovery run is partially complete."
    : isReportFailed
      ? "Your latest discovery run needs attention."
      : isDiscoveryRunning
        ? "Searching for buyer conversations."
        : discoveryIsComplete
          ? "Your latest discovery results are ready."
          : websiteSetupNeedsAttention
            ? status.title
          : websiteSetupIsComplete
            ? "Your website and matching brief are ready."
            : status.title;
  const detail = isPartial
    ? "Some sources were unavailable, but results from the sources that completed are still ready to review."
    : isReportFailed
      ? "Review the discovery report for source details, then refine the brief or try another scan."
      : isDiscoveryRunning
        ? "Arcli is checking public conversations and filtering them against your matching brief."
        : discoveryIsComplete
          ? "Review the buyer-problem leads, potential buyers, and source report from this run."
          : websiteSetupNeedsAttention
            ? status.detail
          : websiteSetupIsComplete
            ? "A discovery run checks public conversations separately and puts verified buyer signals on this desk."
            : status.detail;
  const isComplete = discoveryIsComplete || websiteSetupIsComplete;
  const tone = isPartial
    ? { border: C.amber, background: C.amberPale, color: C.amber }
    : isComplete
    ? { border: C.green, background: C.greenPale, color: C.green }
    : isReportFailed || websiteSetupNeedsAttention
      ? { border: C.red, background: C.redPale, color: C.red }
      : { border: C.blueLight, background: C.blueTint, color: C.blue };
  const metrics = [
    { label: "Leads", value: leadCount, color: C.green },
    { label: "Potential", value: potentialCount, color: C.amber },
    { label: "Feed", value: feedCount, color: C.blue },
  ];

  return (
    <section
      aria-labelledby="scan-overview-title"
      className="relative shrink-0 overflow-hidden rounded-xl border bg-white px-5 py-5 shadow-sm sm:px-6"
      style={{ borderColor: tone.border }}
    >
      <div className="absolute -right-10 -top-14 size-40 rounded-full" style={{ backgroundColor: `${tone.color}12` }} aria-hidden="true" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.7fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
              Discovery status
            </span>
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: tone.border, backgroundColor: tone.background, color: tone.color }}>
              {displayLabel}
            </span>
          </div>
          <h2 id="scan-overview-title" className="pfd mt-2 text-2xl leading-none" style={{ color: C.navy }}>
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
            {detail}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-[11px]" style={{ color: C.muted }}>Updated {formatTime(lastUpdatedAt)}</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isRefreshing}
              onClick={onRefresh}
              style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
            >
              <RefreshCw className={cn("size-3", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <section aria-labelledby="desk-pulse-heading" className="rounded-lg border bg-white/80 p-3" style={{ borderColor: C.rule }}>
          <p id="desk-pulse-heading" className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
            Your pulse
          </p>
          <div className="mt-2 grid grid-cols-3 divide-x rounded-md border" style={{ borderColor: C.rule }}>
            {metrics.map((metric) => (
              <div key={metric.label} className="p-3 text-center" style={{ borderColor: C.rule }}>
                <p className="text-xl font-semibold leading-none" style={{ color: C.navy }}>{metric.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: metric.color }}>{metric.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3" style={{ borderColor: C.rule }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>Next moves</span>
        <Link href="/dashboard/brief" className="rounded-sm text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2" style={{ color: C.blue }}>
          Refine matching brief
        </Link>
        <Link href="/dashboard/watchlists" className="rounded-sm text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2" style={{ color: C.blue }}>
          Create a buyer group
        </Link>
      </div>
    </section>
  );
}

export default function ProspectDashboardClient({
  serviceProfile,
  crawlJob,
  leads,
  discoveryCandidates,
  screenedMatches,
  buyerDemandReport,
  buyerGroupSuggestions,
  activateBuyerGroup,
  startWebsiteDemandScan,
  verificationThreshold,
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
  const [isQueueControlsOpen, setIsQueueControlsOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const [dashboardView, setDashboardView] = useState<DashboardView>("overview");
  const [isScanActivityOpen, setIsScanActivityOpen] = useState(false);
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

  const queueItems = useMemo(
    () => [...leads, ...discoveryCandidates, ...screenedMatches],
    [discoveryCandidates, leads, screenedMatches],
  );
  const queueSources = useMemo(
    () => Array.from(new Set(queueItems.map((lead) => lead.sourcePost.source)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    [queueItems],
  );
  const filteredQueueItems = useMemo(() => {
    const filtered = queueItems.filter((lead) => {
      if (queueFilter === "leads" && !isVerifiedLead(lead)) return false;
      if (queueFilter === "potential" && !isPotentialBuyer(lead)) return false;
      if (queueFilter === "screened" && !isScreenedMatch(lead)) return false;
      if (queueConfidence === "high" && lead.verifierScore < 0.8) return false;
      if (queueConfidence === "sixty_plus" && lead.verifierScore < 0.6) return false;
      if (queueSource !== "all" && lead.sourcePost.source !== queueSource) return false;
      return matchesQueueSearch(lead, queueQuery);
    });

    return sortQueueItems(filtered, queueSort);
  }, [queueConfidence, queueFilter, queueItems, queueQuery, queueSort, queueSource]);
  const visibleLeads = useMemo(
    () => filteredQueueItems.filter(isVerifiedLead),
    [filteredQueueItems],
  );
  const visiblePotentialBuyers = useMemo(
    () => filteredQueueItems.filter(isPotentialBuyer),
    [filteredQueueItems],
  );
  const visibleScreenedMatches = useMemo(
    () => filteredQueueItems.filter(isScreenedMatch),
    [filteredQueueItems],
  );
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(() =>
    sortQueueItems(queueItems, "priority")[0]?.id ?? null,
  );

  const selectLead = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    setDashboardView("focus");
  }, []);

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
  const status = pipelineStatus({ crawlJob, serviceProfile, isWarmingUp });
  const activeQueueControlCount =
    Number(queueFilter !== "all") +
    Number(queueSort !== "priority") +
    Number(queueConfidence !== "all") +
    Number(queueSource !== "all");
  const isFirstDeskPass =
    queueItems.length === 0 && (!serviceProfile.hasProfile || isWarmingUp);
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
        startWebsiteDemandScan={startWebsiteDemandScan}
        verificationThreshold={verificationThreshold}
        reviewedConversationCount={queueItems.length}
        screenedMatches={screenedMatches}
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
        lastUpdatedAt={lastUpdatedAt}
        feedbackNotice={selectedLead ? feedbackMessages[selectedLead.id] ?? null : null}
        feedbackPending={isFeedbackPending && pendingFeedbackLeadId === selectedLead?.id}
        qualificationPending={isQualificationPending && pendingQualificationLeadId === selectedLead?.id}
        qualificationMessage={selectedLead ? qualificationMessages[selectedLead.id] ?? null : null}
        onRefresh={refreshDashboard}
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
    <div className="flex w-full flex-col gap-2.5 sm:gap-3" style={{ color: C.text }}>
      <header className="mx-auto flex min-h-11 w-full max-w-[1800px] shrink-0 items-center justify-between gap-4 border-b pb-3" style={{ borderColor: C.rule }}>
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border"
            style={{ borderColor: C.blueLight, backgroundColor: C.blueTint, color: C.blue }}
            aria-hidden="true"
          >
            <ArcliQueueMark />
          </span>
          <div className="min-w-0">
            <h1 className="pfd text-xl leading-none sm:text-2xl" style={{ color: C.navy }}>
              {dashboardView === "focus" ? "Focus" : dashboardView === "queue" ? "All signals" : "Leads"}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: C.navySoft }}>
              {dashboardView === "focus"
                ? "One signal at a time."
                : dashboardView === "queue"
                  ? "Choose the signal you want to review."
                  : "Your next move, without the noise."}
            </p>
          </div>
        </div>
        {dashboardView === "queue" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setDashboardView("overview")}
            style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Overview
          </Button>
        ) : null}
      </header>

      {dashboardView === "overview" ? (
        <section aria-label="Prospect discovery controls" className="mx-auto w-full max-w-[1800px]">
          <DiscoverySourceBar
            serviceProfile={serviceProfile}
            status={status}
            discoveryStatus={buyerDemandReport?.status ?? null}
          />
        </section>
      ) : null}

      {dashboardView === "overview" ? (
        <>
          <section
            aria-labelledby="focus-heading"
            className="mx-auto w-full max-w-[1800px]"
          >
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(26rem,0.8fr)] sm:gap-4">
              <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: C.rule }}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
                    Today
                  </p>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: C.blueTint, color: C.blue }}>
                    {queueItems.length} {queueItems.length === 1 ? "signal" : "signals"} to review
                  </span>
                </div>
                <h2 id="focus-heading" className="pfd mt-3 max-w-4xl text-xl leading-tight sm:text-[1.75rem]" style={{ color: C.navy }}>
                  {selectedLead ? selectedLead.sourcePost.title : status.title}
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-5" style={{ color: C.navySoft }}>
                  {selectedLead
                    ? selectedLead.painDetected || selectedLead.matchReason
                    : status.detail}
                </p>
                {selectedLead ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: C.muted }}>
                    <span>{sourceDisplayName(selectedLead.sourcePost.source)}</span>
                    {selectedLead.sourcePost.community ? <span>{selectedLead.sourcePost.community}</span> : null}
                    <span style={{ color: isPotentialBuyer(selectedLead) ? C.amber : C.green }}>
                      {isPotentialBuyer(selectedLead) ? "Potential buyer" : "Clear buyer problem"}
                    </span>
                  </div>
                ) : null}
                {selectedLead ? (
                  <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: C.rule }}>
                    <div className="rounded-lg border p-3" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                        Buyer evidence
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm leading-5" style={{ color: C.navy }}>
                        {selectedLead.evidenceExcerpt || selectedLead.sourcePost.text}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.rule }}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>
                        Why it fits
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm leading-5" style={{ color: C.navySoft }}>
                        {selectedLead.matchReason}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {selectedLead ? (
                    <Button
                      type="button"
                      onClick={() => setDashboardView("focus")}
                      style={{ backgroundColor: C.blue, color: C.white }}
                    >
                      Review signal
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsScanActivityOpen(true)}
                      style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
                    >
                      View scan activity
                    </Button>
                  )}
                  <p className="text-xs" role="status" style={{ color: C.muted }}>
                    {status.label} · Updated {formatTime(lastUpdatedAt)}
                  </p>
                </div>
              </article>

              <aside className="self-start rounded-xl border bg-white p-3.5 shadow-sm sm:p-4" style={{ borderColor: C.rule }}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold" style={{ color: C.navy }}>Signal inbox</h3>
                  {queueItems.length > 3 ? (
                    <Button type="button" size="xs" variant="ghost" onClick={() => setDashboardView("queue")} style={{ color: C.blue }}>
                      View all
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1.5">
                  {filteredQueueItems.slice(0, 4).map((lead) => {
                    const isSelected = lead.id === selectedLeadId;

                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => previewLead(lead.id)}
                        aria-pressed={isSelected}
                        className="w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                        style={{
                          borderColor: isSelected ? C.blueLight : C.rule,
                          backgroundColor: isSelected ? C.white : "transparent",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-semibold" style={{ color: C.navySoft }}>
                            {sourceDisplayName(lead.sourcePost.source)}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold" style={{ color: isPotentialBuyer(lead) ? C.amber : C.green }}>
                            {isPotentialBuyer(lead) ? "Potential" : "Lead"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5" style={{ color: C.navy }}>
                          {lead.sourcePost.title}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-auto border-t pt-4" style={{ borderColor: C.rule }}>
                  <p className="text-xs leading-5" style={{ color: C.navySoft }}>
                    Better matching starts with a sharper buyer problem.
                  </p>
                  <Link href="/dashboard/brief" className="mt-2 inline-flex rounded-sm text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2" style={{ color: C.blue }}>
                    Refine matching brief
                  </Link>
                </div>
              </aside>
            </div>
          </section>

          <section aria-labelledby="discovery-summary-heading" className="mx-auto w-full max-w-[1800px] rounded-xl border bg-white shadow-sm" style={{ borderColor: C.rule }}>
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                  Discovery snapshot
                </p>
                <h2 id="discovery-summary-heading" className="pfd mt-2 text-xl leading-none" style={{ color: C.navy }}>
                  Latest scan
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  {status.label} · Updated {formatTime(lastUpdatedAt)}
                </p>
              </div>
              <dl className="grid grid-cols-3 divide-x rounded-xl border" style={{ borderColor: C.rule }}>
                <div className="p-3.5 text-center">
                  <dt className="text-[11px] font-semibold" style={{ color: C.muted }}>Clear leads</dt>
                  <dd className="mt-1 text-2xl font-semibold leading-none" style={{ color: C.navy }}>{leads.length}</dd>
                </div>
                <div className="p-3.5 text-center">
                  <dt className="text-[11px] font-semibold" style={{ color: C.muted }}>Potential</dt>
                  <dd className="mt-1 text-2xl font-semibold leading-none" style={{ color: C.navy }}>{discoveryCandidates.length}</dd>
                </div>
                <div className="p-3.5 text-center">
                  <dt className="text-[11px] font-semibold" style={{ color: C.muted }}>Sources</dt>
                  <dd className="mt-1 text-2xl font-semibold leading-none" style={{ color: C.navy }}>{buyerDemandReport?.sourceProgress.length ?? 0}</dd>
                </div>
              </dl>
            </div>
            <details
              open={isScanActivityOpen}
              onToggle={(event) => setIsScanActivityOpen(event.currentTarget.open)}
              className="border-t"
              style={{ borderColor: C.rule }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF] sm:px-6" style={{ color: C.navy }}>
                <span>View scan activity</span>
                <span className="text-xs font-medium" style={{ color: C.muted }}>
                  {status.label}
                </span>
              </summary>
              <div className="space-y-3 border-t p-4 sm:p-6" style={{ borderColor: C.rule }}>
                <ScanOverview
                  status={status}
                  leadCount={leads.length}
                  potentialCount={discoveryCandidates.length}
                  feedCount={queueItems.length}
                  discoveryStatus={buyerDemandReport?.status ?? null}
                  lastUpdatedAt={lastUpdatedAt}
                  isRefreshing={isRefreshPending}
                  onRefresh={refreshDashboard}
                />
                {buyerDemandReport ? <DiscoveryScanReport report={buyerDemandReport} /> : null}
              </div>
            </details>
          </section>
        </>
      ) : null}

      {dashboardView !== "overview" && !buyerDemandReport && queueItems.length === 0 && !isFirstDeskPass ? (
        <Card className="rounded-lg shadow-sm" style={{ borderColor: C.blueLight }}>
          <CardHeader className="gap-1">
            <CardTitle className="text-base" style={{ color: C.navy }}>
              Discovery outcome is not available yet
            </CardTitle>
            <p className="text-sm leading-6" style={{ color: C.navySoft }}>
              No lead evidence has been recorded for this brief. The scan may still be preparing, or its worker and telemetry configuration need attention.
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline" style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}>
              <a href="/settings">Review matching brief</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {dashboardView !== "overview" && isFirstDeskPass ? (
        <WarmUpState
          crawlJob={crawlJob}
          serviceProfile={serviceProfile}
          isWarmingUp={isWarmingUp}
        />
      ) : dashboardView !== "overview" ? (
      <div className="grid min-h-[640px] max-w-5xl gap-5 xl:min-h-[760px]">
        <section
          aria-labelledby="matches-heading"
          className={cn("flex min-h-[640px] max-h-[640px] flex-col overflow-hidden rounded-xl border bg-white xl:min-h-0 xl:max-h-none", dashboardView === "focus" && "hidden")}
          style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.05)" }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
            <h2 id="matches-heading" className="pfd text-xl leading-none" style={{ color: C.navy }}>
              All signals
            </h2>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ color: C.green, backgroundColor: C.greenPale }}>
              {leads.length} clear buyer problems
            </span>
          </div>
          <div className="border-b px-5 py-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
                  style={{ color: C.muted }}
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={queueQuery}
                  onChange={(event) => setQueueQuery(event.target.value)}
                  placeholder="Search leads and potential buyers"
                  aria-label="Search leads and potential buyers"
                  className="h-8 w-full rounded-full border bg-white pl-8 pr-3 text-xs outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                  style={{ borderColor: C.ruleDark, color: C.navy }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={isQueueControlsOpen}
                aria-controls="lead-queue-controls"
                onClick={() => setIsQueueControlsOpen((open) => !open)}
                className="h-8 shrink-0 px-2 text-[11px]"
                style={{ borderColor: C.ruleDark, backgroundColor: C.white, color: C.navySoft }}
              >
                <ListFilter className="size-3.5" />
                {activeQueueControlCount ? `Filters (${activeQueueControlCount})` : "Filter & sort"}
              </Button>
            </div>
            {isQueueControlsOpen ? (
              <div id="lead-queue-controls" className="mt-3 flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: C.rule }}>
                <div className="flex items-center gap-1" role="group" aria-label="Lead type filter">
                  {(["all", "leads", "potential", "screened"] as const).map((filter) => {
                    const label = filter === "all"
                      ? "All"
                      : filter === "leads"
                        ? "Leads"
                        : filter === "potential"
                          ? "Potential buyers"
                          : "Screened out";
                    const active = queueFilter === filter;

                    return (
                      <Button
                        key={filter}
                        type="button"
                        size="xs"
                        variant="outline"
                        aria-pressed={active}
                        onClick={() => setQueueFilter(filter)}
                        style={{
                          borderColor: active ? C.blueLight : C.ruleDark,
                          backgroundColor: active ? C.blueTint : C.white,
                          color: active ? C.blue : C.navySoft,
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1 text-[10px]" style={{ color: C.muted }}>
                  <ArrowDownUp className="size-3" aria-hidden="true" />
                  <span className="sr-only">Sort matches</span>
                  <select
                    value={queueSort}
                    onChange={(event) => setQueueSort(event.target.value as QueueSort)}
                    className="h-7 max-w-24 rounded border bg-white px-1 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                    style={{ borderColor: C.ruleDark, color: C.navySoft }}
                  >
                    <option value="priority">Best fit</option>
                    <option value="newest">Newest</option>
                    <option value="confidence">Strongest</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <p className="sr-only" role="status">
            {filteredQueueItems.length > 0
              ? `${filteredQueueItems.length} ${filteredQueueItems.length === 1 ? "match" : "matches"} shown`
              : queueItems.length > 0
                ? "No matches shown"
                : "No matches available yet"}
          </p>
          <div id="lead-queue" className="min-h-0 flex-1 overflow-y-auto">
            {filteredQueueItems.length > 0 ? (
              <>
                {visibleLeads.length > 0 ? (
                  <section aria-labelledby="clear-leads-heading">
                    <div
                      className="sticky top-0 z-10 border-b px-5 py-3"
                      style={{ borderColor: C.rule, backgroundColor: C.greenPale }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 id="clear-leads-heading" className="text-xs font-bold" style={{ color: C.green }}>
                            Leads
                          </h3>
                          <p className="mt-0.5 text-[11px]" style={{ color: C.navySoft }}>
                            Each one shows a clear, real buyer problem.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold" style={{ color: C.green }}>
                          {visibleLeads.length}
                        </span>
                      </div>
                    </div>
                    {visibleLeads.map((lead) => (
                      <DenseQueueRow
                        key={lead.id}
                        lead={lead}
                        selected={lead.id === selectedLeadId}
                        onSelect={selectLead}
                      />
                    ))}
                  </section>
                ) : null}

                {visiblePotentialBuyers.length > 0 ? (
                  <section aria-labelledby="potential-buyers-heading">
                    <div
                      className="sticky top-0 z-10 border-y px-5 py-3"
                      style={{ borderColor: C.rule, backgroundColor: C.amberPale }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 id="potential-buyers-heading" className="text-xs font-bold" style={{ color: C.amber }}>
                            Potential buyers
                          </h3>
                          <p className="mt-0.5 text-[11px]" style={{ color: C.navySoft }}>
                            Relevant early signals that need a closer check.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold" style={{ color: C.amber }}>
                          {visiblePotentialBuyers.length}
                        </span>
                      </div>
                    </div>
                    {visiblePotentialBuyers.map((lead) => (
                      <DenseQueueRow
                        key={lead.id}
                        lead={lead}
                        selected={lead.id === selectedLeadId}
                        onSelect={selectLead}
                      />
                    ))}
                  </section>
                ) : null}
              </>
            ) : queueItems.length > 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                <ListFilter className="size-4" style={{ color: C.blue }} aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold" style={{ color: C.navy }}>
                  No matches fit these filters
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="mt-1"
                  onClick={() => {
                    setQueueFilter("all");
                    setQueueQuery("");
                  }}
                  style={{ color: C.blue }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                <Radar className="size-4" style={{ color: C.blue }} aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold" style={{ color: C.navy }}>{status.title}</p>
                <p className="mt-1 max-w-xs text-[11px] leading-5" style={{ color: C.muted }}>{status.detail}</p>
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="details-heading"
          className={cn("flex min-h-[640px] flex-col overflow-hidden rounded-xl border bg-[#F6FAFE] xl:min-h-0", dashboardView === "queue" && "hidden")}
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
                Overview
              </Button>
              <h2 id="details-heading" className="pfd truncate text-xl leading-none" style={{ color: C.navy }}>
                {selectedLead?.matchStatus === "discovery_candidate"
                  ? "Potential buyer brief"
                  : "Lead brief"}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedLead ? (
                <span className="hidden rounded-full border px-2 py-1 text-[11px] font-semibold sm:inline-flex" style={{ borderColor: C.blueLight, color: C.blue, backgroundColor: C.white }}>
                  {selectedLead.matchStatus === "discovery_candidate"
                    ? "Potential buyer"
                    : "Clear buyer problem"}
                </span>
              ) : null}
              {filteredQueueItems.length > 1 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={showNextLead}
                  style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
                >
                  Next signal
                </Button>
              ) : null}
            </div>
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
            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 text-center" style={{ backgroundColor: C.blueTint }}>
              <div className="absolute -left-16 -top-12 size-48 rounded-full" style={{ backgroundColor: "rgba(59, 154, 232, 0.12)" }} aria-hidden="true" />
              <div className="absolute -bottom-20 -right-10 size-56 rounded-full border" style={{ borderColor: "rgba(27, 110, 191, 0.14)" }} aria-hidden="true" />
              <div className="relative max-w-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
                  Leads
                </p>
                <h3 className="pfd mt-3 text-2xl leading-tight" style={{ color: C.navy }}>
                  Pick a prospect to begin
                </h3>
                <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
                  Start with a signal on your radar. Evidence, reply drafts, and outcomes stay tucked away until you choose them.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden" aria-hidden="true">
          <section className="shrink-0 overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.07)" }}>
            <div className="relative overflow-hidden border-b px-4 py-4" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
              <div className="absolute -right-8 -top-10 size-32 rounded-full" style={{ backgroundColor: "rgba(59, 154, 232, 0.12)" }} aria-hidden="true" />
              <div className="absolute right-10 top-7 size-12 rounded-full border" style={{ borderColor: "rgba(27, 110, 191, 0.16)" }} aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
                    Your pulse
                  </p>
                  <h2 className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>The conversations to focus on</h2>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Refresh dashboard"
                  title="Refresh dashboard"
                  disabled={isRefreshPending}
                  onClick={refreshDashboard}
                  className="border hover:bg-white"
                  style={{ borderColor: C.blueLight, color: C.blue }}
                >
                  <RefreshCw className={cn("size-3", isRefreshPending && "animate-spin")} />
                </Button>
              </div>
              <div className="relative mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                    Clear buyer problems
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight" style={{ color: C.navy }}>{leads.length}</p>
                </div>
                <p className="max-w-32 text-right text-xs leading-5" style={{ color: C.navySoft }}>
                  Buyer conversations that deserve your voice.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2" style={{ backgroundColor: C.white }}>
              <div className="p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: C.amber }}>Worth a closer look</p>
                <p className="mt-1 text-xl font-semibold tracking-tight" style={{ color: C.navy }}>{discoveryCandidates.length}</p>
              </div>
              <div className="border-l p-3.5" style={{ borderColor: C.rule }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue }}>In your feed</p>
                <p className="mt-1 text-xl font-semibold tracking-tight" style={{ color: C.navy }}>{queueItems.length}</p>
              </div>
            </div>
            <p className="border-t px-4 py-2 text-[10px]" role="status" aria-live="polite" style={{ borderColor: C.rule, color: C.muted }}>
              Updated {formatTime(lastUpdatedAt)}
            </p>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.05)" }}>
            <div className="flex min-h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>Keep the momentum</p>
                <h2 className="mt-0.5 text-sm font-semibold" style={{ color: C.navy }}>Helpful next moves</h2>
              </div>
              <Target className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {leads.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQueueFilter("leads");
                    setQueueQuery("");
                  }}
                  className="block w-full rounded-md border p-3 text-left transition-colors hover:bg-[#F0F7FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                  style={{ borderColor: C.green, backgroundColor: C.greenPale }}
                >
                  <p className="text-sm font-semibold" style={{ color: C.green }}>
                    Review {leads.length} ready {leads.length === 1 ? "match" : "matches"}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                    Start with the strongest conversations and move them toward outreach.
                  </p>
                </button>
              ) : discoveryCandidates.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQueueFilter("potential");
                    setQueueQuery("");
                  }}
                  className="block w-full rounded-md border p-3 text-left transition-colors hover:bg-[#F0F7FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                  style={{ borderColor: C.amber, backgroundColor: C.amberPale }}
                >
                  <p className="text-sm font-semibold" style={{ color: C.amber }}>
                    Review {discoveryCandidates.length} plausible {discoveryCandidates.length === 1 ? "match" : "matches"}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                    Confirm whether the evidence is useful before refining the brief.
                  </p>
                </button>
              ) : (
                <Link href="/dashboard/brief" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
                  <p className="text-sm font-semibold" style={{ color: C.blue }}>Improve the next scan</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>Refine the buyer problem and phrases that should trigger a match.</p>
                </Link>
              )}
              <Link href="/dashboard/watchlists" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, backgroundColor: C.white }}>
                <p className="text-sm font-semibold" style={{ color: C.navy }}>Buyer groups</p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Focus the next scan on one audience and one real problem.</p>
              </Link>
              <Link href="/dashboard/brief" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, backgroundColor: C.white }}>
                <p className="text-sm font-semibold" style={{ color: C.navy }}>Refine your brief</p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Use the phrases buyers use when they need help.</p>
              </Link>
              {buyerDemandReport?.marketPatterns.length ? (
                <div className="rounded-md border p-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>What repeats</p>
                  {buyerDemandReport.marketPatterns.slice(0, 3).map((pattern) => (
                    <p key={pattern.label} className="mt-1 text-[11px] leading-5" style={{ color: C.navySoft }}>
                      {pattern.label} · {pattern.matchCount}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
      ) : null}
    </div>
  );
}
