"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type {
  LeadFeedbackValue,
  QualifiedLeadView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

type QueueFilter = "all" | "leads" | "potential";
type QueueSort = "priority" | "newest" | "confidence";

type ProspectLeadDeskProps = {
  serviceProfile: ServiceProfileView;
  leads: QualifiedLeadView[];
  potentialBuyers: QualifiedLeadView[];
  filteredQueueItems: QualifiedLeadView[];
  selectedLead: QualifiedLeadView | null;
  selectedLeadId: string | null;
  queueQuery: string;
  queueFilter: QueueFilter;
  queueSort: QueueSort;
  sourceCount: number;
  reportingSourceCount: number;
  status: {
    label: string;
    title: string;
    detail: string;
  };
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

function sourceInitial(source: string) {
  return sourceDisplayName(source).trim().charAt(0).toUpperCase() || "P";
}

function leadStatus(lead: QualifiedLeadView) {
  if (lead.matchStatus === "qualified") {
    return { label: "Qualified", color: C.green, background: C.greenPale };
  }
  if (isPotentialBuyer(lead)) {
    return { label: "Potential", color: C.amber, background: C.amberPale };
  }
  return { label: "Review", color: C.blue, background: C.bluePale };
}

function signalLabel(lead: QualifiedLeadView) {
  return lead.painTheme ?? lead.painDetected ?? "Buyer signal";
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
  filteredQueueItems,
  selectedLead,
  selectedLeadId,
  queueQuery,
  queueFilter,
  queueSort,
  sourceCount,
  reportingSourceCount,
  status,
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
  onSelectLead,
  onOpenFocusedReview,
  onFeedback,
  onQualify,
}: ProspectLeadDeskProps) {
  const profileDomain = serviceProfile.websiteUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "") ?? "Your matching brief";
  const healthTone = status.label === "Needs attention"
    ? { background: C.amberPale, color: C.amber, border: C.amberPale }
    : { background: C.greenPale, color: C.green, border: C.greenPale };
  const healthDetail = sourceCount > 0
    ? `${reportingSourceCount}/${sourceCount} source${sourceCount === 1 ? "" : "s"} reporting in the latest scan`
    : status.detail;
  const selectedStatus = selectedLead ? leadStatus(selectedLead) : null;
  const evidence = selectedLead
    ? selectedLead.evidenceExcerpt ?? selectedLead.sourcePost.text
    : null;

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 sm:gap-4" style={{ color: C.text }}>
      <header className="flex flex-col justify-between gap-4 border-b pb-4 lg:flex-row lg:items-end" style={{ borderColor: C.rule }}>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
            <Target className="size-3.5" aria-hidden="true" />
            Prospect discovery
          </div>
          <h1 className="pfd text-3xl leading-none sm:text-4xl" style={{ color: C.navy }}>
            Leads
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
            Review public buyer signals with the clearest evidence and closest fit first.
          </p>
        </div>

        <section
          aria-label="Discovery health"
          className="min-w-0 rounded-xl border px-4 py-3 lg:w-[330px]"
          style={{ borderColor: C.rule, backgroundColor: C.white }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: C.navy }}>Discovery health</p>
              <p className="mt-0.5 text-sm font-semibold" style={{ color: C.navySoft }}>{status.title}</p>
            </div>
            <span
              className="shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: healthTone.background, borderColor: healthTone.border, color: healthTone.color }}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>{healthDetail}</p>
        </section>
      </header>

      <section
        aria-label="Lead discovery controls"
        className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(205px,.75fr)_minmax(260px,1.5fr)_minmax(130px,.55fr)_minmax(150px,.65fr)_auto] lg:items-center"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        <div className="flex min-w-0 items-center gap-3 border-b pb-3 lg:border-r lg:border-b-0 lg:pb-0 lg:pr-3" style={{ borderColor: C.rule }}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.blueTint, color: C.blue }}>
            <Globe2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>Matching brief</p>
            <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>{profileDomain}</p>
          </div>
        </div>

        <label className="relative block">
          <span className="sr-only">Search public signals</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: C.faint }} aria-hidden="true" />
          <input
            value={queueQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search topic, source, author, or problem"
            className="h-10 w-full rounded-lg border bg-white py-2 pr-3 pl-9 text-sm outline-none transition focus:ring-2"
            style={{ borderColor: C.ruleDark, color: C.text, outlineColor: C.blueLight }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Signal type</span>
          <select
            value={queueFilter}
            onChange={(event) => onFilterChange(event.target.value as QueueFilter)}
            className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="all">All signals</option>
            <option value="leads">Ready to review</option>
            <option value="potential">Potential buyers</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Sort by</span>
          <select
            value={queueSort}
            onChange={(event) => onSortChange(event.target.value as QueueSort)}
            className="h-8 w-full rounded-md border bg-white px-2 text-xs font-semibold outline-none"
            style={{ borderColor: C.ruleDark, color: C.navy }}
          >
            <option value="priority">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>

        <Button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-10 whitespace-nowrap bg-[#1B6EBF] text-white hover:bg-[#155a9f]"
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} aria-hidden="true" />
          Refresh leads
        </Button>
      </section>

      <section
        aria-label="Lead discovery summary"
        className="grid divide-y overflow-hidden rounded-xl border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        <Metric label="Signals in review" value={metricValue(filteredQueueItems.length)} icon={<Sparkles className="size-5" />} />
        <Metric label="Ready to act" value={metricValue(leads.length)} icon={<ShieldCheck className="size-5" />} />
        <Metric label="Potential buyers" value={metricValue(potentialBuyers.length)} icon={<Target className="size-5" />} />
        <Metric
          label="Sources reporting"
          value={sourceCount > 0 ? `${reportingSourceCount}/${sourceCount}` : "—"}
          detail={freshnessLabel(lastUpdatedAt)}
          icon={<Globe2 className="size-5" />}
        />
      </section>

      <section
        aria-label="Lead review workspace"
        className="grid min-h-[590px] overflow-hidden rounded-xl border bg-white xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,.85fr)]"
        style={{ borderColor: C.rule }}
      >
        <div className="min-w-0 border-b xl:border-r xl:border-b-0" style={{ borderColor: C.rule }}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: C.rule }}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold" style={{ color: C.navy }}>Signals</h2>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                {filteredQueueItems.length}
              </span>
            </div>
            <p className="text-xs" style={{ color: C.muted }}>{freshnessLabel(lastUpdatedAt)}</p>
          </div>

          <div className="hidden grid-cols-[minmax(210px,1fr)_minmax(180px,1fr)_86px_54px_82px] gap-3 border-b px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] lg:grid" style={{ borderColor: C.rule, color: C.muted }}>
            <span>Public source</span>
            <span>Buyer signal</span>
            <span>Confidence</span>
            <span>Age</span>
            <span>Status</span>
          </div>

          {filteredQueueItems.length > 0 ? (
            <div className="divide-y" style={{ borderColor: C.rule }}>
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

        <aside className="flex min-w-0 flex-col" aria-label="Signal intelligence">
          {selectedLead && selectedStatus ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5" style={{ borderColor: C.rule }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold" style={{ color: C.navy }}>Signal intelligence</h2>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: selectedStatus.background, color: selectedStatus.color }}>
                      {selectedStatus.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: C.muted }}>
                    Public-source evidence, not a verified company record.
                  </p>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                <div className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                    {sourceInitial(selectedLead.sourcePost.source)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>
                      {selectedLead.sourcePost.title || signalLabel(selectedLead)}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: C.muted }}>
                      {sourceDisplayName(selectedLead.sourcePost.source)}
                      {selectedLead.sourcePost.author ? ` · ${selectedLead.sourcePost.author}` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DetailStat label="Confidence" value={formatScore(selectedLead.verifierScore)} />
                  <DetailStat label="Observed" value={relativeTime(selectedLead.sourcePost.publishedAt ?? selectedLead.matchedAt)} />
                </div>

                <DetailSection title="Why this matched">
                  <p className="text-sm leading-6" style={{ color: C.navySoft }}>{selectedLead.matchReason}</p>
                  {selectedLead.urgencyReason ? (
                    <p className="mt-2 rounded-md px-2.5 py-2 text-xs leading-5" style={{ backgroundColor: C.amberPale, color: C.amber }}>
                      Urgency cue: {selectedLead.urgencyReason}
                    </p>
                  ) : null}
                </DetailSection>

                <DetailSection title="Evidence">
                  <blockquote className="border-l-2 pl-3 text-sm leading-6" style={{ borderColor: C.blueLight, color: C.navySoft }}>
                    “{evidence}”
                  </blockquote>
                </DetailSection>

                {selectedLead.suggestedReply ? (
                  <DetailSection title="Suggested next move">
                    <p className="text-sm leading-6" style={{ color: C.navySoft }}>{selectedLead.suggestedReply}</p>
                  </DetailSection>
                ) : null}

                <div className="mt-auto space-y-2 border-t pt-4" style={{ borderColor: C.rule }}>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.sourcePost.url ? (
                      <Button asChild variant="outline" size="sm" className="border-[#C8D9E8]">
                        <a href={selectedLead.sourcePost.url} target="_blank" rel="noreferrer">
                          <ExternalLink aria-hidden="true" />
                          Open source
                        </a>
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" className="border-[#C8D9E8]" onClick={onOpenFocusedReview}>
                      Full review
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    {!isPotentialBuyer(selectedLead) && selectedLead.matchStatus !== "qualified" ? (
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
    <div className="flex min-h-[104px] items-center gap-3 px-4 py-4 sm:px-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: C.blueTint, color: C.blue }} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-[11px] font-semibold" style={{ color: C.muted }}>{label}</p>
        <p className="mt-0.5 text-2xl font-semibold leading-none" style={{ color: C.navy }}>{value}</p>
        {detail ? <p className="mt-1 text-[11px]" style={{ color: C.muted }}>{detail}</p> : null}
      </div>
    </div>
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
      className="grid w-full gap-2 px-4 py-3 text-left transition hover:bg-[#F6FAFE] focus-visible:outline-none focus-visible:ring-2 sm:px-5 lg:grid-cols-[minmax(210px,1fr)_minmax(180px,1fr)_86px_54px_82px] lg:items-center lg:gap-3"
      style={{ backgroundColor: selected ? C.blueTint : C.white, outlineColor: C.blueLight }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold" style={{ backgroundColor: C.bluePale, color: C.blue }}>
          {sourceInitial(lead.sourcePost.source)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold" style={{ color: C.navy }}>{title}</span>
          <span className="block truncate text-xs" style={{ color: C.muted }}>
            {sourceDisplayName(lead.sourcePost.source)}
            {lead.sourcePost.author ? ` · ${lead.sourcePost.author}` : ""}
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm" style={{ color: C.navySoft }}>{signalLabel(lead)}</span>
        <span className="block truncate text-xs lg:hidden" style={{ color: C.muted }}>{lead.matchReason}</span>
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
