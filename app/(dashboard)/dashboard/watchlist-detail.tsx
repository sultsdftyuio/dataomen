"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Pause,
  Play,
  Radar,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import type { WatchlistResultsView, WatchlistView } from "./prospect-types";

type DetailSection = "brief" | "coverage" | "signals";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function sourceLabel(value: string) {
  if (value.trim().toLowerCase() === "x") return "Public conversation";
  const sources: Record<string, string> = {
    hackernews: "Hacker News",
    bluesky: "Bluesky",
    lemmy: "Lemmy",
    stackexchange: "Stack Exchange",
    github: "GitHub",
  };
  return sources[value] ?? value;
}

function visibleSources(sources: string[]) {
  return sources.filter((source) => source.trim().toLowerCase() !== "x");
}

export function scanLabel(status: string | null) {
  switch (status?.toLowerCase()) {
    case "queued":
      return "Scanning";
    case "running":
      return "Preparing";
    case "completed":
      return "Checked";
    case "partial":
      return "Partial coverage";
    case "failed":
      return "Needs attention";
    default:
      return "Not scanned";
  }
}

function WatchlistResultCards({ result }: { result: WatchlistResultsView | undefined }) {
  const ready = result?.readyToAct ?? [];
  const review = result?.discoveryCandidates ?? [];
  const signals = [...ready, ...review];

  if (signals.length === 0) {
    return (
      <p className="text-sm leading-6" style={{ color: C.muted }}>
        No verifier-confirmed conversations for this group yet. A scan can still
        surface review-only evidence when the fit is plausible but incomplete.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {signals.slice(0, 4).map((lead) => {
        const isReady = lead.matchStatus === "ready_for_review";
        return (
          <article
            key={lead.id}
            className="rounded-lg border bg-white p-3"
            style={{ borderColor: isReady ? C.green : C.amber }}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className="rounded-md"
                style={{
                  borderColor: isReady ? C.green : C.amber,
                  backgroundColor: isReady ? C.greenPale : C.amberPale,
                  color: isReady ? C.green : C.amber,
                }}
              >
                {isReady ? "Ready to review" : "Review signal"}
              </Badge>
              <span style={{ color: C.muted }}>
                {sourceLabel(lead.sourcePost.source)} · verifier {Math.round(lead.verifierScore * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6" style={{ color: C.navy }}>
              {lead.sourcePost.title}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-6" style={{ color: C.navySoft }}>
              {lead.painDetected || lead.matchReason}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {lead.sourcePost.url ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  style={{ borderColor: C.blueLight, color: C.blue }}
                >
                  <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    View source
                  </a>
                </Button>
              ) : null}
              {!isReady ? (
                <span className="text-xs" style={{ color: C.muted }}>
                  Review-only; not sent to CRM.
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
      {signals.length > 4 ? (
        <p className="text-xs" style={{ color: C.muted }}>
          Showing the latest 4 signals. Open Prospects to work through the full queue.
        </p>
      ) : null}
    </div>
  );
}

function DetailCard({
  id,
  title,
  summary,
  isOpen,
  onClick,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  isOpen: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;

  return (
    <section className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: isOpen ? C.blue : C.rule }}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-[#F8FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onClick}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: C.navy }}>
            {title}
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5" style={{ color: C.muted }}>
            {summary}
          </span>
        </span>
        <ChevronDown
          className={isOpen ? "size-4 shrink-0 rotate-180" : "size-4 shrink-0"}
          style={{ color: C.muted }}
          aria-hidden="true"
        />
      </button>
      {isOpen ? (
        <div id={panelId} className="border-t p-3.5" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function WatchlistDetail({
  watchlist,
  result,
  busy,
  onRun,
  onSetActive,
}: {
  watchlist: WatchlistView;
  result: WatchlistResultsView | undefined;
  busy: boolean;
  onRun: (watchlistId: string) => void;
  onSetActive: (watchlistId: string, isActive: boolean) => void;
}) {
  const [activeSection, setActiveSection] = useState<DetailSection | null>(null);
  const readyCount = result?.readyToAct.length ?? 0;
  const reviewCount = result?.discoveryCandidates.length ?? 0;
  const signalCount = readyCount + reviewCount;
  const lastScan = formatDate(watchlist.lastScanAt);
  const displayedSources = visibleSources(watchlist.sourcePreferences);
  const toggleSection = (section: DetailSection) => {
    setActiveSection((current) => current === section ? null : section);
  };

  useEffect(() => {
    setActiveSection(null);
  }, [watchlist.id]);

  return (
    <section
      aria-labelledby={`watchlist-brief-${watchlist.id}`}
      className="overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.05)" }}
    >
      <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
              Buyer group
            </p>
            <h2 id={`watchlist-brief-${watchlist.id}`} className="mt-1 text-xl font-semibold leading-tight" style={{ color: C.navy }}>
              {watchlist.name}
            </h2>
          </div>
          <Badge
            variant="outline"
            className="h-6 rounded px-2 text-[10px]"
            style={{
              borderColor: watchlist.isActive ? C.green : C.ruleDark,
              backgroundColor: watchlist.isActive ? C.greenPale : C.white,
              color: watchlist.isActive ? C.green : C.muted,
            }}
          >
            <Radar className="size-3" />
            {watchlist.isActive ? scanLabel(watchlist.scanStatus) : "Paused"}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.muted }}>
          <span>{lastScan ? `Last scanned ${lastScan}` : "No scan has run yet"}</span>
          <span>
            {signalCount > 0
              ? `${readyCount} ready · ${reviewCount} for review`
              : "No signals yet"}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <DetailCard
          id={`watchlist-${watchlist.id}-brief`}
          title="Group brief"
          summary={watchlist.targetBuyer}
          isOpen={activeSection === "brief"}
          onClick={() => toggleSection("brief")}
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                Looking for
              </dt>
              <dd className="mt-1 leading-5" style={{ color: C.navy }}>
                {watchlist.targetBuyer}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                Their problem
              </dt>
              <dd className="mt-1 leading-5" style={{ color: C.navy }}>
                {watchlist.problemToSolve}
              </dd>
            </div>
          </dl>
        </DetailCard>

        <DetailCard
          id={`watchlist-${watchlist.id}-coverage`}
          title="Coverage"
          summary={`${displayedSources.length} public ${displayedSources.length === 1 ? "source" : "sources"} enabled`}
          isOpen={activeSection === "coverage"}
          onClick={() => toggleSection("coverage")}
        >
          <div className="flex flex-wrap gap-1.5">
            {displayedSources.map((source) => (
              <Badge key={source} variant="outline" className="h-5 rounded px-1.5 text-[10px]" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                {sourceLabel(source)}
              </Badge>
            ))}
          </div>
        </DetailCard>

        <DetailCard
          id={`watchlist-${watchlist.id}-signals`}
          title="Latest signals"
          summary={`${readyCount} ready to review · ${reviewCount} review signal${reviewCount === 1 ? "" : "s"}`}
          isOpen={activeSection === "signals"}
          onClick={() => toggleSection("signals")}
        >
          <div className="space-y-3">
            <WatchlistResultCards result={result} />
            {signalCount > 0 ? (
              <Button asChild size="sm" variant="outline" style={{ borderColor: C.blueLight, color: C.blue }}>
                <Link href="/dashboard">
                  Open Prospects
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : null}
          </div>
        </DetailCard>

        {watchlist.lastScanError ? (
          <p className="rounded-md border p-3 text-xs leading-5" style={{ borderColor: C.red, backgroundColor: C.redPale, color: C.red }}>
            {watchlist.lastScanError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t bg-white p-3" style={{ borderColor: C.rule }}>
        {watchlist.isActive ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => onRun(watchlist.id)} style={{ backgroundColor: C.blue, color: C.white }}>
              <Search className="size-3.5" />
              {busy ? "Starting…" : lastScan ? "Scan again" : "Start scan"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSetActive(watchlist.id, false)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
              <Pause className="size-3.5" />
              Pause group
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSetActive(watchlist.id, true)} style={{ borderColor: C.blueLight, color: C.blue }}>
            <Play className="size-3.5" />
            Resume group
          </Button>
        )}
      </div>
    </section>
  );
}
