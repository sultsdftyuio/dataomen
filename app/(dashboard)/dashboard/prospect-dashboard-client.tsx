"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  MessageSquareText,
  Radar,
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
  verifierThreshold: number;
  isWarmingUp: boolean;
};

type FeedbackNotice = {
  message: string;
  ok: boolean;
};

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

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function timestampAgeMs(value: string | null | undefined) {
  if (!value) return null;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
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
          "Check the arcli-worker logs, Redis embeddings queue, OPENAI_API_KEY, REDIS_URL, DATABASE_URL, and INTERNAL_WORKER_SECRET.",
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
}: {
  lead: QualifiedLeadView;
  disabled: boolean;
  qualificationMessage: string | null;
  onQualify: (leadId: string) => void;
  reviewOnly: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(lead.suggestedReply);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "empty" | "error">(
    "idle",
  );
  const isQualified = lead.matchStatus === "qualified";
  // A discovery candidate is useful evidence to inspect, not a lead that a
  // browser user can promote. The server and RLS policy enforce the same
  // boundary; keeping it explicit here prevents a misleading CRM action.
  const isReviewOnly = reviewOnly || lead.matchStatus === "discovery_candidate";
  const hasSuggestedReply = Boolean(lead.suggestedReply.trim());
  const draftId = `suggested-reply-${lead.id}`;

  useEffect(() => {
    setDraft(lead.suggestedReply);
  }, [lead.id, lead.suggestedReply]);

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

  const sourceAction = lead.sourcePost.url ? (
    <Button asChild size="sm" style={{ backgroundColor: C.blue, color: C.white }}>
      <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" />
        Reply on Platform
      </a>
    </Button>
  ) : (
    <Button type="button" size="sm" disabled>
      <ExternalLink className="size-4" />
      Source unavailable
    </Button>
  );

  const qualificationAction = !isReviewOnly ? (
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
            Edit this draft to match your voice. Your changes stay in this browser.
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
      className="w-full border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]"
      style={{
        borderColor: C.rule,
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
          {isWatch ? "Review" : "Ready"}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold" style={{ color: C.navy }}>
        {lead.sourcePost.title}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs" style={{ color: C.muted }}>
          {lead.painDetected || lead.matchReason}
        </p>
        <span className="shrink-0 text-[10px] font-semibold" style={{ color: C.blue }}>
          {formatScore(lead.verifierScore)}
        </span>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3" style={{ borderColor: C.rule }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold" style={{ color: C.navySoft }}>
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
            {isWatch ? "Review" : "Ready"}
          </Badge>
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-5" style={{ color: C.navy }}>
          {lead.sourcePost.title}
        </h3>
        <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
          Verifier {formatScore(lead.verifierScore)}
          {lead.similarityScore !== null ? ` · Similarity ${formatScore(lead.similarityScore)}` : ""}
          {postedAt ? ` · Posted ${postedAt}` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-l-[3px] bg-white p-3" style={{ borderColor: C.rule, borderLeftColor: C.amber }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.amber }}>
              Their need
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-5" style={{ color: C.navy }}>
              {lead.painDetected}
            </p>
          </div>
          <div className="rounded-md border border-l-[3px] bg-white p-3" style={{ borderColor: C.rule, borderLeftColor: C.blue }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.blue }}>
              Why it fits
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-5" style={{ color: C.navy }}>
              {lead.matchReason}
            </p>
          </div>
        </div>

        {lead.urgencyReason ? (
          <div className="rounded-md border border-l-[3px] bg-white p-2.5" style={{ borderColor: C.rule, borderLeftColor: C.red }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.red }}>
              Why now
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: C.navy }}>
              “{lead.urgencyReason}”
            </p>
          </div>
        ) : null}

        <div className="rounded-md border p-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.navySoft }}>
              Original words
            </p>
            {lead.sourcePost.author ? (
              <span className="text-[10px]" style={{ color: C.muted }}>{lead.sourcePost.author}</span>
            ) : null}
          </div>
          {lead.evidenceExcerpt ? (
            <blockquote className="mt-2 border-l-2 pl-2 text-xs italic leading-5" style={{ borderColor: C.blueLight, color: C.navy }}>
              “{lead.evidenceExcerpt}”
            </blockquote>
          ) : null}
          <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5" style={{ color: C.navySoft }}>
            {lead.sourcePost.text}
          </p>
        </div>

        <LeadOutreach
          lead={lead}
          disabled={qualificationPending}
          qualificationMessage={qualificationMessage}
          onQualify={onQualify}
          reviewOnly={isWatch}
          compact
        />

        <div className="border-t pt-3" style={{ borderColor: C.rule }}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
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
  verifierThreshold,
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
  const shouldRefreshForLeads = shouldContinueActionQueuePolling({
    isWarmingUp,
    readyToActCount: leads.length,
    hasTerminalReport: buyerDemandReport?.isTerminal ?? false,
  });
  const refreshMs = useMemo(() => (isWarmingUp ? 5000 : 15000), [isWarmingUp]);

  useEffect(() => {
    if (!shouldRefreshForLeads) return;

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [refreshMs, router, shouldRefreshForLeads]);

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
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    queueItems[0]?.id ?? null,
  );

  useEffect(() => {
    if (queueItems.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!queueItems.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(queueItems[0].id);
    }
  }, [queueItems, selectedLeadId]);

  const selectedLead =
    queueItems.find((lead) => lead.id === selectedLeadId) ?? null;
  const status = pipelineStatus({ crawlJob, serviceProfile, isWarmingUp });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4" style={{ color: C.text }}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="pfd text-xl font-semibold tracking-tight" style={{ color: C.navy }}>
            Prospect desk
          </h1>
          <span className="hidden text-sm sm:inline" style={{ color: C.muted }}>
            Review real conversations, then decide what deserves your time.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-7 rounded px-2 text-[11px]"
            style={{ borderColor: C.blueLight, backgroundColor: C.blueTint, color: C.blue }}
          >
            Profile {serviceProfile.status ?? "ready"}
          </Badge>
          <Link
            href="/dashboard/brief"
            className="inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors hover:bg-[#F0F7FF]"
            style={{ borderColor: C.ruleDark, color: C.navySoft, backgroundColor: C.white }}
          >
            Edit brief
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(440px,1.35fr)_minmax(260px,0.7fr)]">
        <section
          aria-labelledby="matches-heading"
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white"
          style={{ borderColor: C.rule, boxShadow: "0 1px 2px rgba(10, 22, 40, 0.05)" }}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: C.rule }}>
            <div className="flex items-center gap-2">
              <h2 id="matches-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
                Matches
              </h2>
              <span className="text-[10px]" style={{ color: C.muted }}>{queueItems.length} total</span>
            </div>
            <span className="text-xs font-semibold" style={{ color: C.green }}>{leads.length} ready</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {queueItems.length > 0 ? (
              queueItems.map((lead) => (
                <DenseQueueRow
                  key={lead.id}
                  lead={lead}
                  selected={lead.id === selectedLeadId}
                  onSelect={setSelectedLeadId}
                />
              ))
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
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white"
          style={{ borderColor: C.rule, boxShadow: "0 1px 2px rgba(10, 22, 40, 0.05)" }}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: C.rule }}>
            <h2 id="details-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
              Details
            </h2>
            {selectedLead ? (
              <span className="text-[10px]" style={{ color: C.muted }}>
                {selectedLead.matchStatus === "discovery_candidate" ? "Review first" : "Ready to act"}
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

        <aside className="flex min-h-0 flex-col gap-3">
          <section className="shrink-0 rounded-lg border bg-white" style={{ borderColor: C.rule, boxShadow: "0 1px 2px rgba(10, 22, 40, 0.05)" }}>
            <div className="h-10 border-b px-4 leading-10" style={{ borderColor: C.rule }}>
              <h2 className="text-sm font-semibold" style={{ color: C.navy }}>At a glance</h2>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y" style={{ borderColor: C.rule }}>
              {[
                ["Ready", leads.length, C.green],
                ["Review", discoveryCandidates.length, C.amber],
                ["Threshold", formatScore(verifierThreshold), C.blue],
                ["Status", isWarmingUp ? "Searching" : "Current", C.navySoft],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="p-3">
                  <p className="text-[11px] font-medium" style={{ color: C.muted }}>{label}</p>
                  <p className="mt-0.5 text-base font-bold tracking-tight" style={{ color: color as string }}>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white" style={{ borderColor: C.rule, boxShadow: "0 1px 2px rgba(10, 22, 40, 0.05)" }}>
            <div className="flex h-10 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: C.rule }}>
              <h2 className="text-sm font-semibold" style={{ color: C.navy }}>Next steps</h2>
              <Target className="size-4" style={{ color: C.blue }} aria-hidden="true" />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              <Link href="/dashboard/watchlists" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, backgroundColor: C.white }}>
                <p className="text-sm font-semibold" style={{ color: C.navy }}>Buyer groups</p>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>Focus the next scan on one audience and one real problem.</p>
              </Link>
              <Link href="/dashboard/brief" className="block rounded-md border p-3 transition-colors hover:bg-[#F0F7FF]" style={{ borderColor: C.rule, backgroundColor: C.white }}>
                <p className="text-sm font-semibold" style={{ color: C.navy }}>Your brief</p>
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
