"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Github, Globe2, MessageSquareText } from "lucide-react";

import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import { isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { ArcSignalIcon } from "@/components/dashboard/arc-icons";
import { LeadStatusBadge, leadIntent } from "@/components/prospects/lead-status";
import { leadSignalLevel, signalLevelLabel } from "@/components/prospects/lead-verdict";
import { cn } from "@/lib/utils";

export type DetailTab = "reply" | "match" | "evidence";
export const DETAIL_TABS: readonly DetailTab[] = ["reply", "match", "evidence"];

const SOURCE_NAMES: Record<string, string> = {
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

export function sourceDisplayName(source: string) {
  return SOURCE_NAMES[source.trim().toLowerCase()] ?? source.replace(/[_-]+/g, " ");
}

// Sources are told apart by name and icon shape, not colour: per-source brand
// hues read like warning and error badges next to the status column.
function SourceIcon({ source, className }: { source: string; className: string }) {
  const normalized = source.trim().toLowerCase();
  if (normalized === "github") return <Github className={className} aria-hidden="true" />;
  if (normalized in SOURCE_NAMES) return <MessageSquareText className={className} aria-hidden="true" />;
  return <Globe2 className={className} aria-hidden="true" />;
}

export function SourcePlatformMark({
  source,
  size = "row",
}: {
  source: string;
  size?: "row" | "detail";
}) {
  const label = sourceDisplayName(source);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-off-white text-navy-soft ring-1 ring-inset ring-border",
        size === "detail" ? "size-10 rounded-lg" : "size-7 rounded-md",
      )}
      title={label}
      role="img"
      aria-label={label}
    >
      <SourceIcon source={source} className={size === "detail" ? "size-5" : "size-3.5"} />
    </span>
  );
}

export function SourcePlatformBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-medium text-navy-soft">
      <SourceIcon source={source} className="size-3.5" />
      {sourceDisplayName(source)}
    </span>
  );
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

export function signalLabel(lead: QualifiedLeadView) {
  return lead.painTheme ?? lead.painDetected ?? "Buyer problem";
}

export function evidencePreview(lead: QualifiedLeadView) {
  return lead.evidenceExcerpt ?? lead.sourcePost.text ?? lead.matchReason;
}

export function leadTitle(lead: QualifiedLeadView) {
  return lead.sourcePost.title || lead.sourcePost.author || sourceDisplayName(lead.sourcePost.source);
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
      className={cn(
        "-mb-px min-h-10 border-b-2 px-0.5 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
  const title = leadTitle(lead);
  const intent = leadIntent(lead);
  const postedAt = lead.sourcePost.publishedAt ?? lead.matchedAt;

  return (
    <button
      type="button"
      data-lead-id={lead.id}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "block w-full border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5",
        selected ? "border-l-primary bg-blue-tint" : "border-l-transparent bg-card hover:bg-off-white",
      )}
    >
      <span className="flex min-w-0 items-start gap-3">
        <SourcePlatformMark source={lead.sourcePost.source} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 text-xs text-subtle">
            <span className="shrink-0 font-medium text-navy-soft">{sourceDisplayName(lead.sourcePost.source)}</span>
            {lead.sourcePost.community ? <span className="truncate">{lead.sourcePost.community}</span> : null}
            <span className="shrink-0 tabular-nums" title={exactDateTime(postedAt)}>{relativeTime(postedAt)}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={title}>
            {title}
          </span>
          <span className="mt-1 line-clamp-1 text-[13px] leading-5 text-muted-foreground">
            {evidencePreview(lead)}
          </span>
          <span className="mt-1.5 flex min-w-0 items-center gap-3 text-xs text-subtle">
            {/* The title already carries the topic on narrow screens. */}
            <span className="hidden min-w-0 truncate sm:block">{signalLabel(lead)}</span>
            {intent ? (
              <span
                className={cn("shrink-0", intent.strong && "font-medium text-foreground")}
                title={intent.description}
              >
                {intent.label}
              </span>
            ) : null}
            {isScreenedMatch(lead) ? null : (
              <ArcSignalIcon className="shrink-0" size={18} level={leadSignalLevel(lead)} label={signalLevelLabel(leadSignalLevel(lead))} />
            )}
          </span>
        </span>
        <LeadStatusBadge lead={lead} size="compact" />
      </span>
    </button>
  );
}
