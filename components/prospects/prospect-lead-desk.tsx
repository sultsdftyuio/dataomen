"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  Check,
  CircleCheckBig,
  ChevronRight,
  ExternalLink,
  Github,
  Globe2,
  MessageSquareText,
  Network,
  RefreshCw,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { WebsiteDemandMap } from "@/components/prospects/website-demand-map";
import type { BuyerGroupSuggestion } from "@/lib/buyer-group-suggestions";
import type {
  BuyerGroupActivationAction,
  LeadFeedbackValue,
  QualifiedLeadView,
  ServiceProfileView,
  WebsiteDemandScanAction,
} from "@/app/(dashboard)/dashboard/prospect-types";

type QueueFilter = "all" | "leads" | "potential" | "screened";
type QueueSort = "priority" | "newest" | "confidence";
type QueueConfidenceFilter = "all" | "high" | "sixty_plus";
type DetailTab = "match" | "evidence" | "context";

type ProspectLeadDeskProps = {
  serviceProfile: ServiceProfileView;
  leads: QualifiedLeadView[];
  potentialBuyers: QualifiedLeadView[];
  buyerGroupSuggestions: BuyerGroupSuggestion[];
  activateBuyerGroup: BuyerGroupActivationAction;
  startWebsiteDemandScan: WebsiteDemandScanAction;
  reviewedConversationCount: number;
  screenedMatches: QualifiedLeadView[];
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
  lastUpdatedAt: Date | null;
  feedbackNotice: { message: string; ok: boolean } | null;
  feedbackPending: boolean;
  qualificationPending: boolean;
  qualificationMessage: string | null;
  onRefresh: () => void;
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

function isPotentialBuyer(lead: QualifiedLeadView) {
  return lead.matchStatus === "discovery_candidate";
}

function isScreenedMatch(lead: QualifiedLeadView) {
  return lead.matchStatus === "rejected";
}

function sourceDisplayName(source: string) {
  const names: Record<string, string> = {
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
  const normalized = source.trim().toLowerCase();
  return names[normalized] ?? source.replace(/[_-]+/g, " ");
}

type SourcePresentation = {
  label: string;
  Icon: LucideIcon;
  background: string;
  color: string;
};

function sourcePresentation(source: string): SourcePresentation {
  const normalized = source.trim().toLowerCase();

  if (normalized === "github") {
    return { label: "GitHub", Icon: Github, background: "#EEF2F6", color: "#24292F" };
  }

  if (["hn", "hackernews", "hacker_news"].includes(normalized)) {
    return { label: "Hacker News", Icon: MessageSquareText, background: "#FFF3E8", color: "#C2410C" };
  }

  if (normalized === "reddit") {
    return { label: "Reddit", Icon: MessageSquareText, background: "#FFF1ED", color: "#D94716" };
  }

  if (["stackexchange", "stack_exchange", "stackoverflow", "stack_overflow"].includes(normalized)) {
    return { label: sourceDisplayName(source), Icon: MessageSquareText, background: C.bluePale, color: C.blue };
  }

  if (normalized === "bluesky") {
    return { label: "Bluesky", Icon: MessageSquareText, background: "#EAF6FF", color: "#0284C7" };
  }

  if (normalized === "lemmy") {
    return { label: "Lemmy", Icon: MessageSquareText, background: "#EDF9F1", color: C.green };
  }

  return { label: sourceDisplayName(source), Icon: Globe2, background: C.offWhite, color: C.navySoft };
}

function SourcePlatformMark({
  source,
  size = "row",
}: {
  source: string;
  size?: "row" | "detail";
}) {
  const { label, Icon, background, color } = sourcePresentation(source);
  const dimensions = size === "detail" ? "size-10 rounded-lg" : "size-7 rounded-md";
  const iconSize = size === "detail" ? "size-5" : "size-3.5";

  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", dimensions)}
      title={label}
      role="img"
      aria-label={label}
      style={{ backgroundColor: background, color }}
    >
      <Icon className={iconSize} aria-hidden="true" />
    </span>
  );
}

function SourcePlatformBadge({ source }: { source: string }) {
  const { label, Icon, background, color } = sourcePresentation(source);

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: background, color }}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function relativeTime(value: string | null) {
  if (!value) return "—";

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";

  const difference = Math.max(0, Date.now() - timestamp);
  const hours = Math.floor(difference / (60 * 60 * 1000));
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function leadStatus(lead: QualifiedLeadView) {
  if (lead.matchStatus === "qualified") {
    return { label: "Qualified", color: C.green, background: C.greenPale };
  }
  if (isPotentialBuyer(lead)) {
    return { label: "Potential", color: C.amber, background: C.amberPale };
  }
  if (isScreenedMatch(lead)) {
    return { label: "Screened out", color: C.muted, background: C.offWhite };
  }
  return { label: "Review", color: C.blue, background: C.bluePale };
}

function signalLabel(lead: QualifiedLeadView) {
  return lead.painTheme ?? lead.painDetected ?? "Buyer signal";
}

function evidencePreview(lead: QualifiedLeadView) {
  return lead.evidenceExcerpt ?? lead.sourcePost.text ?? lead.matchReason;
}

function metricValue(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function freshnessLabel(lastUpdatedAt: Date | null) {
  if (!lastUpdatedAt) return "Live data";
  return `Updated ${new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(lastUpdatedAt)}`;
}

export function ProspectLeadDesk({
  serviceProfile,
  leads,
  potentialBuyers,
  buyerGroupSuggestions,
  activateBuyerGroup,
  startWebsiteDemandScan,
  reviewedConversationCount,
  screenedMatches,
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
  lastUpdatedAt,
  feedbackNotice,
  feedbackPending,
  qualificationPending,
  qualificationMessage,
  onRefresh,
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
  const router = useRouter();
  const [detailTab, setDetailTab] = useState<DetailTab>("match");
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [isDiscoveryPending, startDiscoveryTransition] = useTransition();
  const profileDomain = serviceProfile.websiteUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "") ?? "Your matching brief";
  const selectedStatus = selectedLead ? leadStatus(selectedLead) : null;
  const evidence = selectedLead
    ? selectedLead.evidenceExcerpt ?? selectedLead.sourcePost.text
    : null;

  const checkNewLeads = () => {
    setDiscoveryMessage(null);
    startDiscoveryTransition(async () => {
      try {
        const result = await startWebsiteDemandScan();
        if (!result.ok) {
          setDiscoveryMessage(result.message);
          return;
        }

        router.replace("/dashboard/discovery?scan=1");
      } catch {
        setDiscoveryMessage("We could not reach the discovery service. Please try again.");
      }
    });
  };

  return (
    <main className="flex w-full flex-col gap-2 sm:gap-2.5 lg:h-full lg:min-h-0 lg:overflow-y-auto" style={{ color: C.text }}>
      <header className="flex shrink-0 flex-col gap-3 border-b pb-2.5 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: C.rule }}>
        <div>
          <h1 className="pfd text-2xl leading-none sm:text-[28px]" style={{ color: C.navy }}>
            Leads
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5" style={{ color: C.navySoft }}>
            Start with a website-derived direction, then review public buyer signals with the clearest evidence and closest fit first.
          </p>
        </div>

        <section
          aria-label="Matching brief"
          className="flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 lg:w-[300px]"
          style={{ borderColor: C.rule, backgroundColor: C.white }}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: C.blueTint, color: C.blue }}>
            <Globe2 className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>Matching brief</p>
            <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>{profileDomain}</p>
          </div>
        </section>
      </header>

      <section
        aria-label="Lead discovery controls"
        className="shrink-0 grid gap-2 rounded-lg border p-2 xl:grid-cols-[minmax(240px,1.4fr)_minmax(115px,.48fr)_minmax(115px,.48fr)_minmax(125px,.5fr)_minmax(125px,.5fr)_auto] xl:items-center"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        <label className="relative block">
          <span className="sr-only">Search public signals</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: C.faint }} aria-hidden="true" />
          <input
            value={queueQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search topic, source, author, or problem"
            className="h-9 w-full rounded-md border bg-white py-2 pr-3 pl-9 text-[13px] outline-none transition focus:ring-2"
            style={{ borderColor: C.ruleDark, color: C.text, outlineColor: C.blueLight }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Buyer intent</span>
          <select
            value={queueFilter}
            onChange={(event) => onFilterChange(event.target.value as QueueFilter)}
            className="h-7 w-full rounded-md border bg-white px-2 text-[11px] font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="all">All signals</option>
            <option value="leads">Ready to review</option>
            <option value="potential">Potential buyers</option>
            <option value="screened">Screened out</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Confidence</span>
          <select
            value={queueConfidence}
            onChange={(event) => onConfidenceChange(event.target.value as QueueConfidenceFilter)}
            className="h-7 w-full rounded-md border bg-white px-2 text-[11px] font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="all">All levels</option>
            <option value="high">High (80%+)</option>
            <option value="sixty_plus">60%+</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Source</span>
          <select
            value={queueSource}
            onChange={(event) => onSourceChange(event.target.value)}
            className="h-7 w-full rounded-md border bg-white px-2 text-[11px] font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="all">All sources</option>
            {queueSources.map((source) => (
              <option key={source} value={source}>{sourceDisplayName(source)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Sort by</span>
          <select
            value={queueSort}
            onChange={(event) => onSortChange(event.target.value as QueueSort)}
            className="h-7 w-full rounded-md border bg-white px-2 text-[11px] font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="priority">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>

        <Button
          type="button"
          onClick={checkNewLeads}
          disabled={isDiscoveryPending}
          className="h-9 whitespace-nowrap bg-[#1B6EBF] text-white hover:bg-[#155a9f]"
        >
          <Radar className={cn("size-4", isDiscoveryPending && "animate-pulse")} aria-hidden="true" />
          {isDiscoveryPending ? "Starting scan…" : "Scan website demand"}
        </Button>
        {discoveryMessage ? (
          <p className="text-xs leading-5 xl:col-span-full" role="alert" style={{ color: C.red }}>
            {discoveryMessage}
          </p>
        ) : null}
      </section>

      <section
        aria-label="Lead discovery summary"
        className="shrink-0 grid divide-y overflow-hidden rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        <Metric label="Reviewed conversations" value={metricValue(reviewedConversationCount)} icon={<Radar className="size-5" />} />
        <Metric label="Ready to act" value={metricValue(leads.length)} icon={<CircleCheckBig className="size-5" />} />
        <Metric label="Potential buyers" value={metricValue(potentialBuyers.length)} icon={<UsersRound className="size-5" />} />
        <Metric
          label="Screened out"
          value={metricValue(screenedMatches.length)}
          detail="Not lead-ready"
          icon={<Network className="size-5" />}
        />
      </section>

      <WebsiteDemandMap
        suggestions={buyerGroupSuggestions}
        activateBuyerGroup={activateBuyerGroup}
        collapsible
      />

      <section
        aria-label="Lead review workspace"
        className="grid min-h-[560px] overflow-hidden rounded-lg border bg-white xl:flex-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,.85fr)]"
        style={{ borderColor: C.rule }}
      >
        <div className="flex min-h-0 min-w-0 flex-col border-b xl:border-r xl:border-b-0" style={{ borderColor: C.rule }}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5" style={{ borderColor: C.rule }}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold" style={{ color: C.navy }}>Signals</h2>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                {filteredQueueItems.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs" style={{ color: C.muted }}>{freshnessLabel(lastUpdatedAt)}</p>
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

          <div className="hidden shrink-0 grid-cols-[minmax(180px,.9fr)_minmax(130px,.7fr)_minmax(180px,1fr)_76px_44px_74px] gap-3 border-b px-5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] lg:grid" style={{ borderColor: C.rule, color: C.muted }}>
            <span>Source &amp; post</span>
            <span>Signal</span>
            <span>Latest evidence</span>
            <span>Confidence</span>
            <span>Age</span>
            <span>Status</span>
          </div>

          {filteredQueueItems.length > 0 ? (
            <div className="min-h-0 flex-1 divide-y overflow-y-auto" style={{ borderColor: C.rule }}>
              {filteredQueueItems.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  selected={lead.id === selectedLeadId}
                  onSelect={() => onSelectLead(lead.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyQueue hasProfile={serviceProfile.hasProfile} />
          )}
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto" aria-label="Signal intelligence">
          {selectedLead && selectedStatus ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3 border-b p-3 sm:p-3.5" style={{ borderColor: C.rule }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold" style={{ color: C.navy }}>Signal intelligence</h2>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: selectedStatus.background, color: selectedStatus.color }}>
                      {selectedStatus.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: C.muted }}>
                    {isScreenedMatch(selectedLead)
                      ? "Kept as an audit record, not as a lead to pursue."
                      : "Public-source evidence, not a verified company record."}
                  </p>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-3 sm:p-3.5">
                <div className="flex gap-3">
                  <SourcePlatformMark source={selectedLead.sourcePost.source} size="detail" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>
                      {selectedLead.sourcePost.title || signalLabel(selectedLead)}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                      <SourcePlatformBadge source={selectedLead.sourcePost.source} />
                      {selectedLead.sourcePost.author ? <span className="truncate">{selectedLead.sourcePost.author}</span> : null}
                      {selectedLead.sourcePost.community ? <span className="truncate">in {selectedLead.sourcePost.community}</span> : null}
                    </div>
                  </div>
                </div>

                {isScreenedMatch(selectedLead) ? (
                  <section className="flex gap-2.5 rounded-lg border px-3 py-3" aria-label="Verification outcome" style={{ borderColor: C.ruleDark, backgroundColor: C.offWhite }}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: C.white, color: C.muted }}>
                      <ShieldAlert className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Verification outcome</p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: C.navy }}>Screened out of the lead queue</p>
                      <p className="mt-0.5 text-xs leading-5" style={{ color: C.navySoft }}>The semantic match did not meet the evidence threshold for buyer intent. It remains available for inspection and feedback.</p>
                    </div>
                  </section>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <DetailStat label={isScreenedMatch(selectedLead) ? "Verification score" : "Confidence"} value={formatScore(selectedLead.verifierScore)} />
                  <DetailStat label="Observed" value={relativeTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)} />
                </div>

                <div className="flex gap-4 border-b" role="tablist" aria-label="Signal details" style={{ borderColor: C.rule }}>
                  <DetailTabButton active={detailTab === "match"} onClick={() => setDetailTab("match")}>Why it matched</DetailTabButton>
                  <DetailTabButton active={detailTab === "evidence"} onClick={() => setDetailTab("evidence")}>Evidence</DetailTabButton>
                  <DetailTabButton active={detailTab === "context"} onClick={() => setDetailTab("context")}>Source context</DetailTabButton>
                </div>

                <div className="min-h-[142px]">
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
                    <DetailSection title="Source excerpt">
                      <blockquote className="border-l-2 pl-3 text-sm leading-6" style={{ borderColor: C.blueLight, color: C.navySoft }}>
                        “{evidence}”
                      </blockquote>
                      <p className="mt-3 text-xs leading-5" style={{ color: C.muted }}>
                        This excerpt is retained from the original public post.
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
                      {isScreenedMatch(selectedLead) ? "Inspect post" : "Review lead"}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <div className="flex flex-wrap gap-2">
                    {selectedLead.sourcePost.url ? (
                      <Button asChild variant="outline" size="sm" className="border-[#C8D9E8]">
                        <a href={selectedLead.sourcePost.url} target="_blank" rel="noreferrer">
                          <ExternalLink aria-hidden="true" />
                          Open source
                        </a>
                      </Button>
                    ) : null}
                    {selectedLead.matchStatus === "ready_for_review" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[#1B6EBF] text-white hover:bg-[#155a9f]"
                        onClick={() => onQualify(selectedLead.id)}
                        disabled={qualificationPending}
                      >
                        <Check aria-hidden="true" />
                        Mark qualified
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
                    {feedbackNotice ? (
                      <p className="mt-2 text-xs" style={{ color: feedbackNotice.ok ? C.green : C.red }}>{feedbackNotice.message}</p>
                    ) : null}
                    {qualificationMessage ? (
                      <p className="mt-2 text-xs" style={{ color: C.green }}>{qualificationMessage}</p>
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
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-[78px] items-center gap-2.5 px-4 py-2.5 sm:px-5">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full" style={{ color: C.blue }} aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-2 border-dashed" style={{ borderColor: C.blueLight }} />
        <span className="absolute inset-1.5 rounded-full" style={{ backgroundColor: C.blueTint }} />
        <span className="relative flex size-7 items-center justify-center rounded-full" style={{ backgroundColor: C.white }}>
          {icon}
        </span>
      </span>
      <div>
        <p className="text-[11px] font-semibold" style={{ color: C.muted }}>{label}</p>
        <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight" style={{ color: C.navy }}>{value}</p>
        {detail ? <p className="mt-1 text-[11px]" style={{ color: C.muted }}>{detail}</p> : null}
      </div>
    </div>
  );
}

function DetailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="-mb-px border-b-2 px-0.5 pb-2 text-xs font-semibold transition"
      style={{ borderColor: active ? C.blue : "transparent", color: active ? C.blue : C.muted }}
    >
      {children}
    </button>
  );
}

function SourceContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{label}</dt>
      <dd className="mt-1 truncate font-medium" style={{ color: C.navySoft }}>{value}</dd>
    </div>
  );
}

function SignalPoint({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: C.green }} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function InsightCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.white }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{title}</p>
      <p className="mt-1 truncate text-xs font-semibold capitalize" style={{ color: C.navy }}>{value}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: C.navySoft }}>{detail}</p>
    </section>
  );
}

function LeadRow({
  lead,
  selected,
  onSelect,
}: {
  lead: QualifiedLeadView;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = leadStatus(lead);
  const title = lead.sourcePost.title || lead.sourcePost.author || sourceDisplayName(lead.sourcePost.source);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className="grid w-full gap-1.5 px-4 py-2 text-left transition hover:bg-[#F6FAFE] focus-visible:outline-none focus-visible:ring-2 sm:px-5 lg:grid-cols-[minmax(180px,.9fr)_minmax(130px,.7fr)_minmax(180px,1fr)_76px_44px_74px] lg:items-center lg:gap-3"
      style={{ backgroundColor: selected ? C.blueTint : C.white, outlineColor: C.blueLight }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <SourcePlatformMark source={lead.sourcePost.source} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold" style={{ color: C.navy }}>{title}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
            <SourcePlatformBadge source={lead.sourcePost.source} />
            {lead.sourcePost.author ? <span className="truncate">{lead.sourcePost.author}</span> : null}
            {lead.sourcePost.community ? <span className="truncate">in {lead.sourcePost.community}</span> : null}
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
          {signalLabel(lead)}
        </span>
        <span className="mt-0.5 block truncate text-[11px]" style={{ color: C.muted }}>{lead.signalType ?? "Buyer signal"}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px]" style={{ color: C.navySoft }}>{evidencePreview(lead)}</span>
        <span className="block truncate text-[11px]" style={{ color: C.muted }}>{lead.matchReason}</span>
      </span>
      <span className="text-sm font-semibold" style={{ color: C.navy }}>{formatScore(lead.verifierScore)}</span>
      <span className="text-xs" style={{ color: C.muted }}>{relativeTime(lead.sourcePost.publishedAt ?? lead.matchedAt)}</span>
      <span className="justify-self-start rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: status.background, color: status.color }}>{status.label}</span>
    </button>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold" style={{ color: C.navy }}>{title}</h3>
      {children}
    </section>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>{label}</p>
      <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>{value}</p>
    </div>
  );
}

function EmptyQueue({ hasProfile }: { hasProfile: boolean }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: C.bluePale, color: C.blue }}>
        <Search className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold" style={{ color: C.navy }}>
        {hasProfile ? "No signals match these filters" : "Your matching brief needs a little more detail"}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: C.muted }}>
        {hasProfile
          ? "Try clearing a filter, or refresh after the next public-source scan completes."
          : "Add the buyer, problem, and value proposition you want discovery to look for."}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4 border-[#C8D9E8]">
        <Link href="/dashboard/brief">Edit matching brief</Link>
      </Button>
    </div>
  );
}
