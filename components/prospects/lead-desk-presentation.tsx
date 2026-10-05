"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Check, Github, Globe2, MessageSquareText, ShieldAlert, type LucideIcon } from "lucide-react";

import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import { isPotentialBuyer, isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";

export type DetailTab = "match" | "evidence";
export const DETAIL_TABS: readonly DetailTab[] = ["match", "evidence"];

export function sourceDisplayName(source: string) {
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

export function SourcePlatformMark({
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

export function SourcePlatformBadge({ source }: { source: string }) {
  const { label, Icon, background, color } = sourcePresentation(source);

  return (
    <span title={label} className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: background, color }}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

export function relativeTime(value: string | null) {
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

export function exactDateTime(value: string | null) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "Date not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function leadStatus(lead: QualifiedLeadView) {
  if (isScreenedMatch(lead)) {
    return {
      label: "Screened out",
      description: "Automated review didn't find a close enough fit.",
      color: C.muted,
      background: C.offWhite,
    };
  }
  if (lead.matchStatus === "qualified") {
    return {
      label: "Qualified",
      description: "You marked this opportunity qualified.",
      color: C.green,
      background: C.greenPale,
    };
  }
  if (lead.intentTier === "high") {
    return {
      label: "High intent",
      description: "A direct request or active evaluation. Review first.",
      color: C.green,
      background: C.greenPale,
    };
  }
  if (lead.intentTier === "warm") {
    return {
      label: "Warm",
      description: "Relevant frustration or workflow pain.",
      color: C.amber,
      background: C.amberPale,
    };
  }
  if (lead.intentTier === "exploratory") {
    return {
      label: "Exploratory",
      description: "A related discussion, useful for research or later outreach.",
      color: C.blue,
      background: C.bluePale,
    };
  }
  if (isPotentialBuyer(lead)) {
    return {
      label: "Maybe",
      description: "Plausible, but not verified. Check the evidence first.",
      color: C.amber,
      background: C.amberPale,
    };
  }
  return {
    label: "Lead",
    description: "A clear, verified buyer problem. Not a confirmed customer.",
    color: C.blue,
    background: C.bluePale,
  };
}

export function signalLabel(lead: QualifiedLeadView) {
  return lead.painTheme ?? lead.painDetected ?? "Buyer signal";
}

export function evidencePreview(lead: QualifiedLeadView) {
  return lead.evidenceExcerpt ?? lead.sourcePost.text ?? lead.matchReason;
}

export function metricValue(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function freshnessLabel(lastUpdatedAt: Date | null) {
  if (!lastUpdatedAt) return "Live data";
  return `Updated ${new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(lastUpdatedAt)}`;
}

export function Metric({
  label,
  value,
  detail,
  icon,
  tone = "default",
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: "default" | "quiet";
  active?: boolean;
  onClick: () => void;
}) {
  const isQuiet = tone === "quiet";

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="flex min-h-14 w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#F2F8FD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF] sm:px-4" style={{ backgroundColor: active ? C.blueTint : isQuiet ? C.offWhite : C.white }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: isQuiet ? C.white : C.blueTint, color: isQuiet ? C.muted : C.blue }} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-semibold leading-none tracking-tight" style={{ color: isQuiet ? C.navySoft : C.navy }}>{value}</p>
          <p className="truncate text-[11px] font-semibold" style={{ color: C.muted }}>{label}</p>
        </div>
        {detail ? <p className="mt-0.5 text-[10px]" style={{ color: C.muted }}>{detail}</p> : null}
      </div>
    </button>
  );
}

export function LeadControlSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex h-9 min-w-0 items-center rounded-md border bg-white focus-within:ring-2 focus-within:ring-[#1B6EBF] focus-within:ring-offset-1" style={{ borderColor: C.ruleDark }}>
      <span className="shrink-0 border-r px-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: C.rule, color: C.muted }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-[11px] font-semibold outline-none"
        style={{ color: C.navy }}
      >
        {children}
      </select>
    </label>
  );
}

export function DetailTabButton({
  active,
  tab,
  onClick,
  onKeyDown,
  children,
}: {
  active: boolean;
  tab: DetailTab;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: DetailTab) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`signal-detail-tab-${tab}`}
      aria-controls={`signal-detail-panel-${tab}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={(event) => onKeyDown(event, tab)}
      className="-mb-px border-b-2 px-0.5 pb-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2"
      style={{ borderColor: active ? C.blue : "transparent", color: active ? C.blue : C.muted }}
    >
      {children}
    </button>
  );
}

export function SignalPoint({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: C.green }} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function LeadRow({
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
  const source = sourcePresentation(lead.sourcePost.source);

  return (
    <button
      type="button"
      data-lead-id={lead.id}
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full border-l-[3px] px-4 py-3 text-left transition hover:bg-[#F6FAFE] focus-visible:outline-none focus-visible:ring-2 sm:px-5"
      style={{ backgroundColor: selected ? C.blueTint : C.white, borderLeftColor: selected ? C.blue : "transparent", outlineColor: C.blueLight }}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <SourcePlatformMark source={lead.sourcePost.source} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold">
            <span title={source.label} style={{ color: source.color }}>{source.label}</span>
            <span title={exactDateTime(lead.sourcePost.publishedAt ?? lead.matchedAt)} style={{ color: C.muted }}>
              {relativeTime(lead.sourcePost.publishedAt ?? lead.matchedAt)}
            </span>
          </span>
          <span className="mt-0.5 block line-clamp-2 text-sm font-semibold leading-5" title={title} style={{ color: C.navy }}>{title}</span>
        </span>
        <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" title={status.description} style={{ backgroundColor: status.background, color: status.color }}>{status.label}</span>
      </span>
      <span className="mt-1.5 block line-clamp-1 text-xs leading-5" title={evidencePreview(lead)} style={{ color: C.navySoft }}>
        {evidencePreview(lead)}
      </span>
      <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: C.muted }}>
        <span className="max-w-full truncate rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: C.bluePale, color: C.blue }}>{signalLabel(lead)}</span>
        <span title="Match strength measures relevance, not purchase likelihood.">Match {formatScore(lead.verifierScore)}</span>
      </span>
    </button>
  );
}

export function ScreenedMatchOutcome({ lead }: { lead: QualifiedLeadView }) {
  return (
    <section className="overflow-hidden rounded-xl border" aria-label="Verification review" style={{ borderColor: C.ruleDark, backgroundColor: C.offWhite }}>
      <div className="flex gap-2.5 px-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.white, color: C.muted }}>
          <ShieldAlert className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: C.navy }}>Screened out</h3>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.navySoft }}>Not a close enough fit. Kept for inspection and feedback.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x border-t" style={{ borderColor: C.ruleDark }}>
        <VerificationMetric
          label="Similarity"
          value={lead.similarityScore === null ? "—" : formatScore(lead.similarityScore)}
        />
        <VerificationMetric label="Match strength" value={formatScore(lead.verifierScore)} />
      </dl>
    </section>
  );
}

function VerificationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 first:pl-3 last:pr-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold" style={{ color: C.navy }}>{value}</dd>
    </div>
  );
}
