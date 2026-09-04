import { ChevronDown, ExternalLink, Search } from "lucide-react";

import type { DiscoveryPoolCandidateView } from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

type CandidatePoolProps = {
  candidates: DiscoveryPoolCandidateView[];
};

const UNVERIFIED_STATUS = {
  label: "Collected, not reviewed",
  detail:
    "This post was found by a source search. It has not passed relevance or buyer-intent verification.",
  color: C.navySoft,
  background: C.offWhite,
};

function sourceName(source: string) {
  const names: Record<string, string> = {
    hn: "Hacker News",
    hackernews: "Hacker News",
    hacker_news: "Hacker News",
    github: "GitHub",
    stackexchange: "Stack Exchange",
    stack_exchange: "Stack Exchange",
    bluesky: "Bluesky",
    lemmy: "Lemmy",
    x: "Public conversation",
  };
  const normalized = source.trim().toLowerCase();
  return names[normalized] ?? source.replace(/[_-]+/g, " ");
}

function relativeTime(value: string | null) {
  if (!value) return "Recently";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Recently";

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function candidateLabel(candidate: DiscoveryPoolCandidateView) {
  if (candidate.candidateKind === "account") return "Company candidate";
  if (candidate.candidateKind === "contact") return "Contact candidate";
  return "Public conversation";
}

/**
 * The candidate pool is a collection queue, not a buyer-intent queue. The
 * server only returns raw rows, and the defensive filter keeps a malformed
 * response from making a matched or screened record look unverified.
 */
export function CandidatePool({ candidates }: CandidatePoolProps) {
  const unverifiedCandidates = candidates.filter(
    (candidate) => candidate.status === "raw",
  );
  if (unverifiedCandidates.length === 0) return null;

  const shownCandidates = unverifiedCandidates.slice(0, 6);
  const hiddenCount = Math.max(0, unverifiedCandidates.length - shownCandidates.length);

  return (
    <section
      aria-labelledby="early-candidate-pool-heading"
      className="shrink-0 overflow-hidden rounded-lg border"
      style={{ borderColor: C.blueLight, backgroundColor: C.white }}
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF] sm:px-5 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: C.blueTint, color: C.blue }}>
              <Search className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
                Unverified discovery
              </p>
              <h2 id="early-candidate-pool-heading" className="mt-0.5 text-sm font-semibold" style={{ color: C.navy }}>
                {unverifiedCandidates.length} collected {unverifiedCandidates.length === 1 ? "conversation" : "conversations"}
              </h2>
              <p className="mt-0.5 text-[11px] leading-4" style={{ color: C.navySoft }}>
                Raw search results, not buyer signals or leads.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold" style={{ color: C.blue }}>
            Review
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>

        <div className="border-t" style={{ borderColor: C.rule }}>
          <p className="px-4 py-2.5 text-xs leading-5 sm:px-5" style={{ color: C.navySoft }}>
            These posts were found by a search query. They are not buyer signals or leads until matching and verification finish.
          </p>
          <div className="grid divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3" style={{ borderColor: C.rule }}>
        {shownCandidates.map((candidate) => (
          <article key={candidate.id} className="min-w-0 p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                  {candidateLabel(candidate)} · {sourceName(candidate.source)}
                </p>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5" style={{ color: C.navy }}>
                  {candidate.title}
                </h3>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                style={{ backgroundColor: UNVERIFIED_STATUS.background, color: UNVERIFIED_STATUS.color }}
              >
                {UNVERIFIED_STATUS.label}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: C.navySoft }}>
              {candidate.text}
            </p>
            <p className="mt-2 line-clamp-2 text-[11px] leading-4" style={{ color: C.muted }}>
              {candidate.matchedPhrase
                ? `Found via search query: "${candidate.matchedPhrase}"`
                : UNVERIFIED_STATUS.detail}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px]" style={{ color: C.muted }}>
                Seen {relativeTime(candidate.lastSeenAt ?? candidate.firstSeenAt)}
              </span>
              {candidate.sourceUrl ? (
                <a
                  href={candidate.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm text-[11px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF]"
                  style={{ color: C.blue }}
                >
                  Open source
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </article>
        ))}
          </div>

          {hiddenCount > 0 ? (
            <p className="border-t px-4 py-2.5 text-xs" style={{ borderColor: C.rule, color: C.muted }}>
              {hiddenCount} more unverified {hiddenCount === 1 ? "conversation is" : "conversations are"} retained for this scan.
            </p>
          ) : null}
        </div>
      </details>
      <p className="sr-only">
        {unverifiedCandidates.length} unverified conversations are present before lead verification.
      </p>
    </section>
  );
}
