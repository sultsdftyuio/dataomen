/**
 * Small, framework-independent guards for the buyer-demand dashboard.
 *
 * These helpers deliberately work from persisted verifier data only. They do
 * not turn rejected records, unverified similarity hits, or cross-tenant data
 * into a customer-facing market pattern.
 */

type UnknownRecord = Record<string, unknown>;

export type DiscoverySourceSummary = {
  source: string;
  itemCount: number | null;
  failed: boolean;
};

export type DiscoveryFallbackSummary = {
  outcome: string | null;
  reason: string | null;
};

export type DiscoveryRunSummaryView = {
  sources: DiscoverySourceSummary[];
  totalHits: number | null;
  plausibleHits: number | null;
  sourceFailures: number | null;
  verifierPending: boolean;
  caveat: string | null;
  xFallback: DiscoveryFallbackSummary | null;
};

export type VerifierConfirmedPatternMatch = {
  id: string;
  tenantId: string;
  matchStatus: string;
  verifierScore: number;
  painTheme: string | null;
  painDetected: string | null;
  verifierExecuted?: boolean | null;
  verifierMatch?: boolean | null;
};

export type BuyerDemandPattern = {
  label: string;
  matchCount: number;
};

const READY_MATCH_STATUSES = new Set(["ready_for_review", "qualified"]);

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function firstString(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }

  return null;
}

function firstCount(record: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = asCount(record[key]);
    if (value !== null) return value;
  }

  return null;
}

function sourceSummaryFromRecord(
  record: UnknownRecord,
  fallbackSource: string | null = null,
): DiscoverySourceSummary | null {
  const source =
    firstString(record, ["source", "name", "platform", "network"]) ??
    fallbackSource;
  if (!source) return null;

  const status = firstString(record, ["status", "outcome"]);
  const explicitFailure = asBoolean(record.failed);

  return {
    source,
    itemCount: firstCount(record, [
      "item_count",
      "count",
      "posts",
      "hits",
      "fetched",
      "total",
    ]),
    failed:
      explicitFailure === true ||
      status === "failed" ||
      status === "error" ||
      Boolean(asString(record.error)),
  };
}

function sourceSummaries(value: unknown): DiscoverySourceSummary[] {
  const candidates = Array.isArray(value)
    ? value.flatMap((item) => {
        const source = sourceSummaryFromRecord(asRecord(item) ?? {});
        return source ? [source] : [];
      })
    : Object.entries(asRecord(value) ?? {}).flatMap(([source, item]) => {
        if (typeof item === "number" || typeof item === "string") {
          const count = asCount(item);
          return count === null
            ? []
            : [{ source, itemCount: count, failed: false }];
        }

        const summary = sourceSummaryFromRecord(asRecord(item) ?? {}, source);
        return summary ? [summary] : [];
      });

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.source.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackSummary(record: UnknownRecord): DiscoveryFallbackSummary | null {
  const rawFallback = record.x_fallback;
  const fallback = asRecord(rawFallback);
  const directOutcome = asString(rawFallback);
  const outcome =
    firstString(fallback ?? {}, ["outcome", "status", "result"]) ??
    directOutcome ??
    firstString(record, ["x_fallback_outcome", "x_outcome"]);
  const reason =
    firstString(fallback ?? {}, ["reason", "skip_reason", "detail"]) ??
    firstString(record, ["x_fallback_reason", "x_skip_reason"]);

  return outcome || reason ? { outcome, reason } : null;
}

/**
 * Normalize the optional summary JSON stored with a discovery run. The worker
 * may add fields over time; unknown shapes are ignored rather than rendered as
 * untrusted JSON in the tenant dashboard.
 */
export function parseDiscoveryRunSummary(value: unknown): DiscoveryRunSummaryView {
  const summary = asRecord(value) ?? {};
  const sourceValue =
    summary.source_counts ?? summary.source_results ?? summary.sources ?? [];
  const sources = sourceSummaries(sourceValue);
  const hasSourceCounts = sources.some((source) => source.itemCount !== null);
  const sourceTotal = sources.reduce(
    (total, source) => total + (source.itemCount ?? 0),
    0,
  );
  const verificationStatus = asString(summary.verification_status)
    ?.toLowerCase()
    .replace(/\s+/g, "_");

  return {
    sources,
    // Source totals describe the whole run. A generic `hits_found` field may
    // describe only the final X fallback phase, so use it solely as a legacy
    // fallback when no per-source count is available.
    totalHits: hasSourceCounts
      ? sourceTotal
      : firstCount(summary, ["total_hits", "hits_found", "hits", "posts_found"]),
    plausibleHits: firstCount(summary, ["plausible_hits", "plausible_count"]),
    sourceFailures: firstCount(summary, ["source_failures", "failed_sources"]),
    verifierPending:
      asBoolean(summary.verifier_pending) === true ||
      asBoolean(summary.verification_pending) === true ||
      asBoolean(summary.candidate_verification_pending) === true ||
      verificationStatus === "pending_or_running" ||
      verificationStatus === "pending" ||
      verificationStatus === "running",
    caveat: firstString(summary, ["caveat", "note", "message"]),
    xFallback: fallbackSummary(summary),
  };
}

export function isCompletedDiscoveryRunStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase().replace(/\s+/g, "_") === "completed";
}

export function isTerminalDiscoveryRunStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/g, "_");
  return (
    normalized === "completed" ||
    normalized === "partial" ||
    normalized === "skipped" ||
    normalized === "failed"
  );
}

/**
 * Avoid background refresh loops after the server has written a terminal
 * report.  A terminal source-collection report can still have verifier work
 * in flight, so keep refreshing for a bounded window rather than freezing the
 * desk before those real (but weaker) signals can arrive.
 */
export function shouldContinueActionQueuePolling({
  isWarmingUp,
  readyToActCount,
  hasTerminalReport,
  verificationPending = false,
  terminalReportAgeMs = null,
}: {
  isWarmingUp: boolean;
  readyToActCount: number;
  hasTerminalReport: boolean;
  verificationPending?: boolean;
  terminalReportAgeMs?: number | null;
}) {
  const verificationWindowMs = 5 * 60 * 1000;
  const withinVerificationWindow =
    verificationPending &&
    (terminalReportAgeMs === null || terminalReportAgeMs < verificationWindowMs);

  if (withinVerificationWindow) return true;
  return !hasTerminalReport && (isWarmingUp || readyToActCount === 0);
}

/**
 * Only present urgency when the verifier's reason is visibly grounded in the
 * preserved source text. Normalizing whitespace/case keeps copied excerpts
 * readable without accepting paraphrases.
 */
export function sourceGroundedExcerpt(
  sourceText: string,
  excerpt: string | null | undefined,
): string | null {
  const normalizedExcerpt = asString(excerpt);
  if (!normalizedExcerpt) return null;

  const normalizedSource = sourceText
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
  const normalizedCandidate = normalizedExcerpt
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

  return normalizedSource.includes(normalizedCandidate) ? normalizedExcerpt : null;
}

export function sourceGroundedUrgencyReason(
  sourceText: string,
  urgencyReason: string | null | undefined,
): string | null {
  return sourceGroundedExcerpt(sourceText, urgencyReason);
}

/**
 * A ready match's lifecycle status is the persisted verifier gate. The
 * optional verifier flags tighten the check when they are present, while
 * preserving safely migrated historical ready-for-review records.
 */
export function isVerifierConfirmedTenantMatch(
  match: VerifierConfirmedPatternMatch,
  tenantId: string,
  verifierThreshold: number,
) {
  if (
    !match.id ||
    match.tenantId !== tenantId ||
    !READY_MATCH_STATUSES.has(match.matchStatus.trim().toLowerCase()) ||
    !Number.isFinite(match.verifierScore) ||
    match.verifierScore < verifierThreshold
  ) {
    return false;
  }

  return match.verifierExecuted !== false && match.verifierMatch !== false;
}

/**
 * A market pattern is intentionally a repeated, verifier-confirmed theme,
 * never a summary of one post. Match IDs are de-duplicated to make retries or
 * joined source rows unable to inflate a pattern.
 */
export function deriveBuyerDemandPatterns(
  matches: VerifierConfirmedPatternMatch[],
  tenantId: string,
  verifierThreshold: number,
): BuyerDemandPattern[] {
  const groups = new Map<string, { label: string; matchIds: Set<string> }>();

  for (const match of matches) {
    if (!isVerifierConfirmedTenantMatch(match, tenantId, verifierThreshold)) {
      continue;
    }

    const label = asString(match.painTheme) ?? asString(match.painDetected);
    if (!label) continue;

    const key = label.normalize("NFKC").toLocaleLowerCase();
    const existing = groups.get(key) ?? { label, matchIds: new Set<string>() };
    existing.matchIds.add(match.id);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .filter((group) => group.matchIds.size >= 2)
    .map((group) => ({
      label: group.label,
      matchCount: group.matchIds.size,
    }))
    .sort(
      (left, right) =>
        right.matchCount - left.matchCount || left.label.localeCompare(right.label),
    )
    .slice(0, 3);
}
