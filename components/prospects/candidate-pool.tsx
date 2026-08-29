import { ExternalLink, Search, Sparkles } from "lucide-react";

import type { DiscoveryPoolCandidateView } from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

type CandidatePoolProps = {
  candidates: DiscoveryPoolCandidateView[];
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

function statusCopy(status: DiscoveryPoolCandidateView["status"]) {
  if (status === "review") {
    return {
      label: "Ready for review",
      detail: "Passed the matching checks; it is still not a qualified lead.",
      color: C.blue,
      background: C.bluePale,
    };
  }
  if (status === "plausible") {
    return {
      label: "Plausible signal",
      detail: "Passed a first relevance check and is moving through matching.",
      color: C.amber,
      background: C.amberPale,
    };
  }
  return {
    label: "Collected",
    detail: "A public post matched a buyer phrase; verification has not run yet.",
    color: C.navySoft,
    background: C.offWhite,
  };
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
 * Makes the candidate-first stage visible without conflating it with a lead.
 * It intentionally offers only the original public source, not CRM or contact
 * actions, until verifier-owned lead records are available.
 */
export function CandidatePool({ candidates }: CandidatePoolProps) {
  if (candidates.length === 0) return null;

  const shownCandidates = candidates.slice(0, 6);
  const hiddenCount = Math.max(0, candidates.length - shownCandidates.length);

  return (
    <section
      aria-labelledby="early-candidate-pool-heading"
      className="shrink-0 overflow-hidden rounded-lg border"
      style={{ borderColor: C.blueLight, backgroundColor: C.white }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: C.rule }}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: C.blueTint, color: C.blue }}>
            <Search className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
              Candidate-first discovery
            </p>
            <h2 id="early-candidate-pool-heading" className="mt-0.5 text-sm font-semibold" style={{ color: C.navy }}>
              {candidates.length} early {candidates.length === 1 ? "candidate" : "candidates"} found
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: C.navySoft }}>
              These are collected public conversations, shown before full verification. They may become leads, or be screened out.
            </p>
          </div>
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: C.amberPale, color: C.amber }}>
          Not qualified leads
        </span>
      </div>

      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3" style={{ borderColor: C.rule }}>
        {shownCandidates.map((candidate) => {
          const status = statusCopy(candidate.status);
          return (
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
                <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: status.background, color: status.color }}>
                  {status.label}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: C.navySoft }}>
                {candidate.text}
              </p>
              <p className="mt-2 line-clamp-2 text-[11px] leading-4" style={{ color: C.muted }}>
                {candidate.matchedPhrase
                  ? `Matched phrase: “${candidate.matchedPhrase}”`
                  : status.detail}
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
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <p className="border-t px-4 py-2.5 text-xs" style={{ borderColor: C.rule, color: C.muted }}>
          {hiddenCount} more early {hiddenCount === 1 ? "candidate is" : "candidates are"} retained for this scan.
        </p>
      ) : null}
      <p className="sr-only">
        {candidates.length} candidate conversations are present before lead verification.
      </p>
    </section>
  );
}
