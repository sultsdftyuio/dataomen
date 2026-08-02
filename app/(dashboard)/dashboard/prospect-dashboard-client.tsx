"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  Check,
  Clock3,
  Copy,
  ExternalLink,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { markLeadAsQualified } from "@/app/actions/leads";
import { shouldContinueActionQueuePolling } from "@/lib/buyer-demand-report";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { retryServiceProfileEmbedding, submitLeadFeedback } from "./actions";
import {
  FEEDBACK_OPTIONS,
  type BuyerLanguageResearchRequestAction,
  type BuyerLanguageResearchView,
  type BuyerDemandReportView,
  type CrawlJobView,
  type LeadFeedbackValue,
  type QualifiedLeadView,
  type ServiceProfileView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  leads: QualifiedLeadView[];
  discoveryCandidates: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  isWarmingUp: boolean;
};

type FeedbackNotice = {
  message: string;
  ok: boolean;
};

type QueueFilter = "all" | "ready" | "review";
type QueueSort = "priority" | "newest" | "confidence";

const STALE_EMBEDDING_MS = 10 * 60 * 1000;

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
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

function isReviewLead(lead: QualifiedLeadView) {
  return lead.matchStatus === "discovery_candidate";
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
      (isReviewLead(lead) ? 0 : 4) +
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
      title: "Starting public-source matching.",
      detail:
        "Arcli is moving from profile preparation into public-conversation discovery and verification.",
    };
  }

  return {
    label: "Continuing to scan",
    title: "No verifier-confirmed conversations yet.",
    detail:
      "No public conversation has met the relevance and confidence bar yet. Sources keep scanning, and plausible conversations will appear separately for your judgment.",
  };
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
  // A discovery candidate is useful evidence to inspect, not a lead that a
  // browser user can promote. The server and RLS policy enforce the same
  // boundary; keeping it explicit here prevents a misleading CRM action.
  const isReviewOnly = reviewOnly || lead.matchStatus === "discovery_candidate";
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
    <p className="text-xs font-medium" style={{ color: C.amber }}>
      Review only — this item did not meet the action threshold and cannot be
      qualified or exported to your CRM.
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
      className="w-full border-b border-l-[3px] px-4 py-3.5 text-left transition-colors hover:bg-[#F7FBFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]"
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
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: isWatch ? C.amberPale : C.greenPale,
            color: isWatch ? C.amber : C.green,
          }}
        >
          {isWatch ? "Worth a look" : "Ready"}
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold leading-5" style={{ color: C.navy }}>
        {lead.sourcePost.title}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
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
  const [openDetail, setOpenDetail] = useState<"evidence" | "reply" | "outcome" | null>(null);
  const isQualified = lead.matchStatus === "qualified";

  useEffect(() => {
    setOpenDetail(null);
  }, [lead.id]);

  const toggleDetail = (detail: "evidence" | "reply" | "outcome") => {
    setOpenDetail((current) => (current === detail ? null : detail));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3.5" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
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
            {isWatch ? "Worth a look" : "Ready to reply"}
          </Badge>
        </div>
        <h3 className="mt-1.5 text-base font-semibold leading-6" style={{ color: C.navy }}>
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-l-[3px] bg-white p-3.5" style={{ borderColor: C.rule, borderLeftColor: C.amber }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.amber }}>
              What they need
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-5" style={{ color: C.navy }}>
              {lead.painDetected}
            </p>
          </div>
          <div className="rounded-lg border border-l-[3px] bg-white p-3.5" style={{ borderColor: C.rule, borderLeftColor: C.blue }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.blue }}>
              Your opening
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-5" style={{ color: C.navy }}>
              {lead.matchReason}
            </p>
          </div>
        </div>

        {lead.urgencyReason ? (
          <div className="rounded-lg border border-l-[3px] bg-white p-3" style={{ borderColor: C.rule, borderLeftColor: C.red }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.red }}>
              Why this matters now
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: C.navy }}>
              “{lead.urgencyReason}”
            </p>
          </div>
        ) : null}

        <section aria-label="Conversation actions" className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            What would you like to do?
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Conversation actions">
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-pressed={openDetail === "evidence"}
              onClick={() => toggleDetail("evidence")}
              style={{
                borderColor: openDetail === "evidence" ? C.blueLight : C.ruleDark,
                backgroundColor: openDetail === "evidence" ? C.blueTint : C.white,
                color: openDetail === "evidence" ? C.blue : C.navySoft,
              }}
            >
              Read evidence
            </Button>
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

        {openDetail === "evidence" ? (
        <div className="rounded-lg border p-3.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.navySoft }}>
              In their own words
            </p>
            {lead.sourcePost.author ? (
              <span className="text-[10px]" style={{ color: C.muted }}>{lead.sourcePost.author}</span>
            ) : null}
          </div>
          {lead.evidenceExcerpt ? (
            <blockquote className="mt-2 border-l-2 pl-3 text-sm italic leading-6" style={{ borderColor: C.blueLight, color: C.navy }}>
              “{lead.evidenceExcerpt}”
            </blockquote>
          ) : null}
          <p className="mt-3 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-5" style={{ color: C.navySoft }}>
            {lead.sourcePost.text}
          </p>
          {lead.sourcePost.url ? (
            <Button asChild size="xs" variant="outline" className="mt-3" style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}>
              <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3" />
                Open original
              </a>
            </Button>
          ) : null}
        </div>
        ) : null}

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
    x: "X",
  };

  return knownNames[normalized] ?? humanizeRunValue(source);
}

function CompletedDiscoveryReport({ report }: { report: BuyerDemandReportView }) {
  const completedAt = formatDate(report.completedAt);
  const summary = report.summary;
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

  return (
    <Card className="rounded-lg shadow-sm" style={{ borderColor: C.blueLight }}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base" style={{ color: C.navy }}>
              {title}
            </CardTitle>
            <p className="mt-1 text-sm leading-6" style={{ color: C.navySoft }}>
              {detail}
            </p>
          </div>
          {completedAt ? (
            <Badge
              variant="outline"
              className="rounded-md"
              style={{
                borderColor: C.blueLight,
                backgroundColor: C.blueTint,
                color: C.blue,
              }}
            >
              {isPartial
                ? "Partial"
                : isSkipped
                  ? "Skipped"
                  : isFailed
                    ? "Failed"
                    : "Completed"} {completedAt}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.sources.length > 0 ? (
          <div>
            <p className="text-xs font-bold uppercase" style={{ color: C.muted }}>
              Sources checked
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.sources.map((source) => (
                <Badge
                  key={source.source}
                  variant="outline"
                  className="rounded-md"
                  style={{
                    borderColor: source.failed ? C.red : C.ruleDark,
                    backgroundColor: source.failed ? C.redPale : C.white,
                    color: source.failed ? C.red : C.navySoft,
                  }}
                >
                  {sourceDisplayName(source.source)}
                  {source.itemCount !== null ? `: ${source.itemCount} items` : ""}
                  {source.failed ? " unavailable" : ""}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {summary.totalHits !== null ||
        summary.plausibleHits !== null ||
        summary.sourceFailures !== null ? (
          <div className="flex flex-wrap gap-2 text-sm" style={{ color: C.navySoft }}>
            {summary.totalHits !== null ? (
              <span>{summary.totalHits} items returned</span>
            ) : null}
            {summary.plausibleHits !== null ? (
              <span>{summary.plausibleHits} plausible signals reviewed</span>
            ) : null}
            {summary.sourceFailures !== null && summary.sourceFailures > 0 ? (
              <span>{summary.sourceFailures} source{summary.sourceFailures === 1 ? "" : "s"} unavailable</span>
            ) : null}
          </div>
        ) : null}

        {summary.xFallback ? (
          <p className="text-sm leading-6" style={{ color: C.navySoft }}>
            X fallback
            {summary.xFallback.outcome
              ? `: ${humanizeRunValue(summary.xFallback.outcome)}`
              : ""}
            {summary.xFallback.reason
              ? ` (${humanizeRunValue(summary.xFallback.reason)})`
              : ""}
          </p>
        ) : null}

        {summary.caveat ? (
          <p className="text-xs leading-5" style={{ color: C.muted }}>
            {summary.caveat}
          </p>
        ) : null}

        <div className="border-t pt-3" style={{ borderColor: C.rule }}>
          <Button
            asChild
            size="sm"
            variant="outline"
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.white,
              color: C.blue,
            }}
          >
            <a href="/settings">Review matching brief</a>
          </Button>
        </div>
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
        <h2 id="buyer-demand-patterns" className="text-xs font-semibold" style={{ color: C.navy }}>
          Buyer themes
        </h2>
        <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
          Shown only when the same verifier-confirmed theme appears in at least
          two ready-to-act matches in this workspace.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {report.marketPatterns.map((pattern) => (
          <Card key={pattern.label} className="rounded-md shadow-sm" style={{ borderColor: C.rule }}>
            <CardContent className="space-y-1.5 p-3">
              <p className="text-xs font-medium leading-5" style={{ color: C.navy }}>
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
}: {
  research: BuyerLanguageResearchView;
  requestBuyerLanguageResearch?: BuyerLanguageResearchRequestAction;
}) {
  const router = useRouter();
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [hasRequested, setHasRequested] = useState(false);
  const [isRequestPending, startRequestTransition] = useTransition();

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
      className="rounded-lg border p-8 text-center"
      style={{ borderColor: C.rule, backgroundColor: C.white }}
    >
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
      <h3 className="mt-3 text-base font-semibold" style={{ color: C.navy }}>
        {status.title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: C.muted }}>
        {status.detail}
      </p>
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
        This dashboard refreshes while the first pass is running, so Ready to act
        items appear as soon as they are written.
      </p>
    </div>
  );
}

export default function ProspectDashboardClient({
  serviceProfile,
  crawlJob,
  leads,
  discoveryCandidates,
  buyerDemandReport,
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
  const [queueQuery, setQueueQuery] = useState("");
  const [isQueueControlsOpen, setIsQueueControlsOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const shouldRefreshForLeads = shouldContinueActionQueuePolling({
    isWarmingUp,
    readyToActCount: leads.length,
    hasTerminalReport: buyerDemandReport?.isTerminal ?? false,
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
  }, [buyerDemandReport?.updatedAt, discoveryCandidates, leads]);

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
    () => [...leads, ...discoveryCandidates],
    [discoveryCandidates, leads],
  );
  const filteredQueueItems = useMemo(() => {
    const filtered = queueItems.filter((lead) => {
      if (queueFilter === "ready" && isReviewLead(lead)) return false;
      if (queueFilter === "review" && !isReviewLead(lead)) return false;
      return matchesQueueSearch(lead, queueQuery);
    });

    return sortQueueItems(filtered, queueSort);
  }, [queueFilter, queueItems, queueQuery, queueSort]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    queueItems[0]?.id ?? null,
  );

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
  }, [filteredQueueItems, selectedLeadId]);

  const selectedLead =
    filteredQueueItems.find((lead) => lead.id === selectedLeadId) ?? null;
  const status = pipelineStatus({ crawlJob, serviceProfile, isWarmingUp });
  const activeQueueControlCount =
    Number(queueFilter !== "all") + Number(queueSort !== "priority");

  return (
    <div className="flex w-full flex-col gap-3 xl:h-full xl:min-h-0" style={{ color: C.text }}>
      <header className="flex min-h-8 shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="pfd text-base font-semibold tracking-tight" style={{ color: C.navy }}>
            Prospect desk
          </h1>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-3 text-[11px]"
              style={{ borderColor: C.ruleDark, color: C.navySoft, backgroundColor: C.white }}
            >
              <Radar className="size-3.5" />
              Scan &amp; guidance
            </Button>
          </SheetTrigger>
          <SheetContent
            className="gap-0 overflow-y-auto p-0 sm:max-w-md"
            style={{ backgroundColor: C.white, borderColor: C.rule }}
          >
            <SheetHeader className="border-b" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
              <SheetTitle style={{ color: C.navy }}>Scan &amp; guidance</SheetTitle>
              <SheetDescription style={{ color: C.muted }}>
                Context and next steps are kept here so the prospect desk stays focused.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-4">
              <section className="rounded-lg border p-4" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
                  {status.label}
                </p>
                <h2 className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>{status.title}</h2>
                <p className="mt-2 text-xs leading-5" style={{ color: C.navySoft }}>{status.detail}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11px]" style={{ color: C.muted }}>Updated {formatTime(lastUpdatedAt)}</p>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isRefreshPending}
                    onClick={refreshDashboard}
                    style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
                  >
                    <RefreshCw className={cn("size-3", isRefreshPending && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </section>

              <section aria-labelledby="desk-pulse-heading">
                <p id="desk-pulse-heading" className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
                  Your pulse
                </p>
                <div className="mt-2 grid grid-cols-3 divide-x rounded-lg border bg-white" style={{ borderColor: C.rule }}>
                  {[
                    { label: "Ready", value: leads.length, color: C.green },
                    { label: "Review", value: discoveryCandidates.length, color: C.amber },
                    { label: "Feed", value: queueItems.length, color: C.blue },
                  ].map((metric) => (
                    <div key={metric.label} className="p-3 text-center" style={{ borderColor: C.rule }}>
                      <p className="text-lg font-semibold" style={{ color: C.navy }}>{metric.value}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: metric.color }}>{metric.label}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="next-moves-heading">
                <div className="flex items-center gap-2">
                  <Target className="size-3.5" style={{ color: C.blue }} aria-hidden="true" />
                  <p id="next-moves-heading" className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
                    Helpful next moves
                  </p>
                </div>
                <div className="mt-2 space-y-2">
                  <Link href="/dashboard/brief" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, color: C.navy }}>
                    <p className="text-sm font-semibold">Refine your brief</p>
                    <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Improve what the next scan should look for.</p>
                  </Link>
                  <Link href="/dashboard/watchlists" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, color: C.navy }}>
                    <p className="text-sm font-semibold">Buyer groups</p>
                    <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Focus future scans on a specific audience.</p>
                  </Link>
                  <Link href="/dashboard/research" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, color: C.navy }}>
                    <p className="text-sm font-semibold">Buyer words</p>
                    <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Study recurring language without leaving the desk cluttered.</p>
                  </Link>
                </div>
              </section>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(300px,0.72fr)_minmax(560px,1.65fr)]">
        <section
          aria-labelledby="matches-heading"
          className="flex min-h-0 max-h-[420px] flex-col overflow-hidden rounded-xl border bg-white xl:max-h-none"
          style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.05)" }}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
            <div>
              <h2 id="matches-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
                Conversations
              </h2>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ color: C.green, backgroundColor: C.greenPale }}>
              {leads.length} ready to reply
            </span>
          </div>
          <div className="border-b p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
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
                  placeholder="Search matches"
                  aria-label="Search matches"
                  className="h-8 w-full rounded-full border bg-white pl-8 pr-3 text-xs outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                  style={{ borderColor: C.ruleDark, color: C.navy }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={isQueueControlsOpen}
                onClick={() => setIsQueueControlsOpen((open) => !open)}
                className="h-8 shrink-0 px-2 text-[11px]"
                style={{ borderColor: C.ruleDark, backgroundColor: C.white, color: C.navySoft }}
              >
                <ListFilter className="size-3.5" />
                {activeQueueControlCount ? `Filters (${activeQueueControlCount})` : "Filter & sort"}
              </Button>
            </div>
            {isQueueControlsOpen ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: C.rule }}>
                <div className="flex items-center gap-1" role="group" aria-label="Match status filter">
                  {(["all", "ready", "review"] as const).map((filter) => {
                    const label = filter === "all" ? "All" : filter === "ready" ? "Ready" : "Worth a look";
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredQueueItems.length > 0 ? (
              filteredQueueItems.map((lead) => (
                <DenseQueueRow
                  key={lead.id}
                  lead={lead}
                  selected={lead.id === selectedLeadId}
                  onSelect={setSelectedLeadId}
                />
              ))
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
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white"
          style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.06)" }}
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
            <div>
              <h2 id="details-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
                Conversation
              </h2>
            </div>
            {selectedLead ? (
              <span className="rounded-full border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: C.blueLight, color: C.blue, backgroundColor: C.white }}>
                {selectedLead.matchStatus === "discovery_candidate" ? "Worth a look" : "Ready to reply"}
              </span>
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
            <div className="flex flex-1 items-center justify-center px-5 text-center text-xs" style={{ color: C.muted }}>
              Select a conversation to see the original words and your next step.
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
                    Ready to reply
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
                    setQueueFilter("ready");
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
                    setQueueFilter("review");
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
              <Link href="/dashboard/research" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, backgroundColor: C.white }}>
                <p className="text-sm font-semibold" style={{ color: C.navy }}>Buyer words</p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Learn from accepted evidence without treating it as a lead.</p>
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
    </div>
  );
}
