"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
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
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { retryServiceProfileEmbedding, submitLeadFeedback } from "./actions";
import {
  FEEDBACK_OPTIONS,
  type CrawlJobView,
  type LeadFeedbackValue,
  type QualifiedLeadView,
  type ServiceProfileView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  leads: QualifiedLeadView[];
  verifierThreshold: number;
  isWarmingUp: boolean;
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
        "Arcli is moving from profile preparation into lead discovery and verification.",
    };
  }

  return {
    label: "Scanning",
    title: "Scanning public streams for verified matches.",
    detail:
      "The pipeline is active. New verified leads will appear here automatically.",
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
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onFeedback(leadId, option.value)}
          style={{
            borderColor: option.value === "good_lead" ? C.green : C.ruleDark,
            color: option.value === "good_lead" ? C.green : C.navySoft,
            backgroundColor: C.white,
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
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
        This dashboard refreshes while the first pass is running, so verified leads
        appear as soon as they are written.
      </p>
    </div>
  );
}

export default function ProspectDashboardClient({
  serviceProfile,
  crawlJob,
  leads,
  verifierThreshold,
  isWarmingUp,
}: ProspectDashboardClientProps) {
  const router = useRouter();
  const [feedbackMessages, setFeedbackMessages] = useState<Record<string, string>>({});
  const [pendingFeedbackLeadId, setPendingFeedbackLeadId] = useState<string | null>(null);
  const [isFeedbackPending, startFeedbackTransition] = useTransition();
  const shouldRefreshForLeads = isWarmingUp || leads.length === 0;
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
      const result = await submitLeadFeedback(leadId, value);
      setFeedbackMessages((current) => ({
        ...current,
        [leadId]: result.message,
      }));
      setPendingFeedbackLeadId(null);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" style={{ color: C.text }}>
      <div className="flex flex-col gap-2 border-b pb-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: C.navy }}>
              Prospect Intelligence
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Qualified opportunities with the reason they surfaced.
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

      <section id="leads" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
              Qualified Leads
            </h2>
            {leads.length > 0 ? (
              <p className="mt-1 text-sm" style={{ color: C.muted }}>
                {leads.length} lead{leads.length === 1 ? "" : "s"} passed the verifier.
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
            Qualified only
          </Badge>
        </div>

        {leads.length === 0 ? (
          <WarmUpState
            crawlJob={crawlJob}
            serviceProfile={serviceProfile}
            isWarmingUp={isWarmingUp}
          />
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => {
              const matchedAt = formatDate(lead.matchedAt);
              const postedAt = formatDate(lead.sourcePost.publishedAt);
              const feedbackPending =
                isFeedbackPending && pendingFeedbackLeadId === lead.id;

              return (
                <Card
                  key={lead.id}
                  className="rounded-lg shadow-sm"
                  style={{ borderColor: C.rule }}
                >
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-md"
                            style={{
                              borderColor: C.green,
                              backgroundColor: C.greenPale,
                              color: C.green,
                            }}
                          >
                            {formatScore(lead.verifierScore)}
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
                            {lead.sourcePost.community
                              ? ` / ${lead.sourcePost.community}`
                              : ""}
                            {matchedAt ? ` / matched ${matchedAt}` : ""}
                          </span>
                        </div>
                        <CardTitle
                          className="break-words text-base leading-snug"
                          style={{ color: C.navy }}
                        >
                          {lead.sourcePost.title}
                        </CardTitle>
                      </div>
                      {lead.sourcePost.url ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          style={{
                            borderColor: C.ruleDark,
                            backgroundColor: C.white,
                            color: C.blue,
                          }}
                        >
                          <a
                            href={lead.sourcePost.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-4" />
                            Open
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div
                        className="rounded-md border p-3"
                        style={{
                          borderColor: C.amber,
                          backgroundColor: C.amberPale,
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
                          <MessageSquareText className="size-3.5" />
                          <span style={{ color: C.amber }}>Pain Detected</span>
                        </div>
                        <p className="text-sm leading-6" style={{ color: C.navy }}>
                          {lead.painDetected}
                        </p>
                      </div>
                      <div
                        className="rounded-md border p-3"
                        style={{
                          borderColor: C.blueLight,
                          backgroundColor: C.blueTint,
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
                          <Target className="size-3.5" />
                          <span style={{ color: C.blue }}>Match Reason</span>
                        </div>
                        <p className="text-sm leading-6" style={{ color: C.navy }}>
                          {lead.matchReason}
                        </p>
                      </div>
                    </div>

                    <div
                      className="rounded-md border p-3"
                      style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
                    >
                      <div
                        className="mb-2 flex flex-wrap gap-2 text-xs"
                        style={{ color: C.muted }}
                      >
                        {lead.sourcePost.author ? (
                          <span>Author {lead.sourcePost.author}</span>
                        ) : null}
                        {postedAt ? <span>Posted {postedAt}</span> : null}
                      </div>
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

                    <div
                      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                      style={{ borderColor: C.rule }}
                    >
                      <LeadFeedbackButtons
                        leadId={lead.id}
                        disabled={feedbackPending}
                        onFeedback={handleFeedback}
                      />
                      {feedbackMessages[lead.id] ? (
                        <span className="text-xs font-medium" style={{ color: C.green }}>
                          {feedbackMessages[lead.id]}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
