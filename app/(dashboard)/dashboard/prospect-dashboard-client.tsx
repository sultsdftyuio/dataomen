"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import WatchlistsPanel from "./watchlists-panel";
import {
  FEEDBACK_OPTIONS,
  type BuyerLanguageResearchRequestAction,
  type BuyerLanguageResearchView,
  type BuyerDemandReportView,
  type CrawlJobView,
  type LeadFeedbackValue,
  type ProspectActionResult,
  type QualifiedLeadView,
  type ServiceProfileView,
  type WatchlistAction,
  type WatchlistResultsView,
  type WatchlistView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  leads: QualifiedLeadView[];
  discoveryCandidates: QualifiedLeadView[];
  buyerDemandReport: BuyerDemandReportView | null;
  buyerLanguageResearch: BuyerLanguageResearchView;
  requestBuyerLanguageResearch?: BuyerLanguageResearchRequestAction;
  watchlists: WatchlistView[];
  watchlistResults: WatchlistResultsView[];
  createWatchlist: WatchlistAction;
  runWatchlistDiscovery: (watchlistId: string) => Promise<ProspectActionResult>;
  setWatchlistActive: (
    watchlistId: string,
    isActive: boolean,
  ) => Promise<ProspectActionResult>;
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
}: {
  lead: QualifiedLeadView;
  disabled: boolean;
  qualificationMessage: string | null;
  onQualify: (leadId: string) => void;
  reviewOnly: boolean;
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
        className="rounded-md border p-4"
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
      className="rounded-md border p-4"
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
        className="min-h-28 resize-y bg-white text-sm leading-6"
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
    <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
      <CardHeader className="gap-3">
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
            className="rounded-md border p-3"
            style={{ borderColor: C.amber, backgroundColor: C.amberPale }}
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
            className="rounded-md border p-3"
            style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
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
            className="rounded-md border p-3"
            style={{ borderColor: C.red, backgroundColor: C.redPale }}
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

function BuyerDemandPatterns({
  report,
}: {
  report: BuyerDemandReportView;
}) {
  if (report.marketPatterns.length === 0) return null;

  return (
    <section aria-labelledby="buyer-demand-patterns" className="space-y-3">
      <div>
        <h2 id="buyer-demand-patterns" className="text-lg font-semibold" style={{ color: C.navy }}>
          Recurring buyer themes
        </h2>
        <p className="mt-1 text-sm leading-6" style={{ color: C.muted }}>
          Shown only when the same verifier-confirmed theme appears in at least
          two ready-to-act matches in this workspace.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {report.marketPatterns.map((pattern) => (
          <Card key={pattern.label} className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium leading-6" style={{ color: C.navy }}>
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
function BuyerLanguageResearch({
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
    <section id="buyer-language-research" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
            Buyer-language research
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6" style={{ color: C.muted }}>
            Exact phrases from accepted, source-grounded public evidence in this
            workspace. This is research for refining your matching brief — not
            an opportunity queue, and it cannot be qualified or sent to your CRM.
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-md"
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
        <div className="grid gap-4 md:grid-cols-2">
          {research.evidence.map((item) => {
            const capturedAt = formatDate(item.capturedAt);

            return (
              <Card
                key={item.id}
                className="rounded-lg shadow-sm"
                style={{ borderColor: C.rule }}
              >
                <CardContent className="space-y-3 p-4">
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
                    className="border-l-2 pl-3 text-sm italic leading-6"
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
                          <ExternalLink className="size-4" />
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
        <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm leading-6" style={{ color: C.navySoft }}>
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
                  style={{
                    borderColor: C.blueLight,
                    backgroundColor: C.white,
                    color: C.blue,
                  }}
                >
                  {isRequestPending ? "Starting research…" : "Start buyer-language research"}
                </Button>
              ) : null}
              <Button
                asChild
                size="sm"
                variant="outline"
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navySoft,
                }}
              >
                <a href="/settings">Review matching brief</a>
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
  buyerLanguageResearch,
  requestBuyerLanguageResearch,
  watchlists,
  watchlistResults,
  createWatchlist,
  runWatchlistDiscovery,
  setWatchlistActive,
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" style={{ color: C.text }}>
      <div className="flex flex-col gap-2 border-b pb-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: C.navy }}>
              Action queue
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Evidence-backed conversations, ordered for a thoughtful next step.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="rounded-md px-3 py-1"
              style={{
                borderColor: C.green,
                backgroundColor: C.greenPale,
                color: C.green,
              }}
            >
              <ShieldCheck className="size-3" />
              Profile {serviceProfile.status ?? "approved"}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md px-3 py-1"
              style={{
                borderColor: C.ruleDark,
                backgroundColor: C.white,
                color: C.navySoft,
              }}
            >
              Verifier threshold {formatScore(verifierThreshold)}
            </Badge>
          </div>
        </div>
      </div>

      <WatchlistsPanel
        watchlists={watchlists}
        results={watchlistResults}
        createWatchlist={createWatchlist}
        runWatchlistDiscovery={runWatchlistDiscovery}
        setWatchlistActive={setWatchlistActive}
      />

      <section id="action-queue" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
              Ready to act
            </h2>
            {leads.length > 0 ? (
              <p className="mt-1 text-sm" style={{ color: C.muted }}>
                {leads.length} conversation{leads.length === 1 ? "" : "s"} passed the verifier and is ready for review.
              </p>
            ) : buyerDemandReport?.isTerminal ? (
              <p className="mt-1 text-sm" style={{ color: C.muted }}>
                {buyerDemandReport.isCompleted
                  ? "This completed scan has no Ready to act conversations."
                  : buyerDemandReport.status === "failed"
                    ? "The most recent scan failed before a Ready to act conversation could be verified."
                  : "The most recent scan ended with limited coverage and no Ready to act conversations."}
              </p>
            ) : discoveryCandidates.length > 0 ? (
              <p className="mt-1 text-sm" style={{ color: C.muted }}>
                No conversations have met the automatic action threshold yet.
              </p>
            ) : null}
          </div>
          <Badge
            variant="outline"
            className="rounded-md"
            style={{
              borderColor: C.green,
              backgroundColor: C.greenPale,
              color: C.green,
            }}
          >
            <ShieldCheck className="size-3" />
            Ready to act
          </Badge>
        </div>

        {leads.length === 0 && buyerDemandReport?.isTerminal ? (
          <CompletedDiscoveryReport report={buyerDemandReport} />
        ) : leads.length === 0 && discoveryCandidates.length === 0 ? (
          <WarmUpState
            crawlJob={crawlJob}
            serviceProfile={serviceProfile}
            isWarmingUp={isWarmingUp}
          />
        ) : leads.length > 0 ? (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                kind="ready"
                feedbackPending={
                  isFeedbackPending && pendingFeedbackLeadId === lead.id
                }
                qualificationPending={
                  isQualificationPending && pendingQualificationLeadId === lead.id
                }
                feedbackMessage={feedbackMessages[lead.id] ?? null}
                qualificationMessage={qualificationMessages[lead.id] ?? null}
                onFeedback={handleFeedback}
                onQualify={handleQualification}
              />
            ))}
          </div>
        ) : null}
      </section>

      {discoveryCandidates.length > 0 ? (
        <section id="watch" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
                Watch
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6" style={{ color: C.muted }}>
                These conversations have plausible, verifier-confirmed evidence,
                but did not meet the automatic action threshold. They are
                review-only watch items, not ready-to-act opportunities, and
                cannot be qualified or exported to your CRM.
              </p>
            </div>
            <Badge
              variant="outline"
              className="rounded-md"
              style={{
                borderColor: C.amber,
                backgroundColor: C.amberPale,
                color: C.amber,
              }}
            >
              <Radar className="size-3" />
              Watch
            </Badge>
          </div>

          <div className="grid gap-4">
            {discoveryCandidates.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                kind="watch"
                feedbackPending={
                  isFeedbackPending && pendingFeedbackLeadId === lead.id
                }
                qualificationPending={
                  isQualificationPending && pendingQualificationLeadId === lead.id
                }
                feedbackMessage={feedbackMessages[lead.id] ?? null}
                qualificationMessage={qualificationMessages[lead.id] ?? null}
                onFeedback={handleFeedback}
                onQualify={handleQualification}
              />
            ))}
          </div>
        </section>
      ) : null}

      {buyerDemandReport?.isTerminal ? (
        <BuyerDemandPatterns report={buyerDemandReport} />
      ) : null}

      <BuyerLanguageResearch
        research={buyerLanguageResearch}
        requestBuyerLanguageResearch={requestBuyerLanguageResearch}
      />
    </div>
  );
}
