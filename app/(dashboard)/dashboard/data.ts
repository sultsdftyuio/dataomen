import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DISCOVERY_QUERY_TYPES,
  discoveryQueryPlanValidationError,
  isDiscoveryQueryType,
  type DiscoveryQuery,
} from "@/lib/discovery-queries";
import {
  deriveBuyerDemandPatterns,
  isCompletedDiscoveryRunStatus,
  isTerminalDiscoveryRunStatus,
  parseDiscoveryRunSummary,
  sourceGroundedExcerpt,
  sourceGroundedUrgencyReason,
  type VerifierConfirmedPatternMatch,
} from "@/lib/buyer-demand-report";
import {
  buildBuyerLanguageResearchEvidence,
  type BuyerLanguageResearchView,
} from "@/lib/buyer-language-research";
import { getWebsiteCrawlCooldown } from "@/lib/website-crawl-cooldown";
import type { Database, Json } from "@/types/supabase";
import type {
  BuyerDemandReportView,
  CrawlJobView,
  LeadMatchStatus,
  QualifiedLeadView,
  ServiceProfileFields,
  ServiceProfileView,
  SourcePostView,
  WebsiteCrawlCooldownView,
  WatchlistResultsView,
  WatchlistView,
} from "./prospect-types";

type DbRecord = Record<string, unknown>;

const EMPTY_FIELDS: ServiceProfileFields = {
  target_audience: [],
  core_problem: "",
  unique_value_prop: "",
  use_cases: [],
  pain_points: [],
  buying_triggers: [],
  urgency_signals: [],
  discovery_queries: [],
  search_terms: [],
  negative_keywords: [],
  excluded_audiences: [],
};

export type LeadQueueCounts = {
  readyToReview: number;
  discoveryCandidates: number;
};

export function verifierScoreThreshold() {
  const configured = Number(process.env.LEAD_VERIFIER_SCORE_THRESHOLD ?? "0.6");
  return Number.isFinite(configured) ? configured : 0.6;
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRecord)
    : null;
}

function firstRecord(value: unknown): DbRecord | null {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }

  return asRecord(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isOptionalAdditiveSchemaUnavailable(error: unknown) {
  const record = asRecord(error);
  const code = readString([record], ["code"]);
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function isMissingDiscoveryRunKindColumn(error: unknown) {
  const record = asRecord(error);
  const code = readString([record], ["code"]);
  if (code === "42703") return true;

  // PostgREST reports a missing selected column with PGRST204 in some
  // versions. Limit the legacy fallback to `run_kind`; any other schema
  // failure remains fail-closed instead of silently changing the query.
  const message = readString([record], ["message", "details", "hint"]);
  return code === "PGRST204" && Boolean(message?.toLowerCase().includes("run_kind"));
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function splitStringList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normalizeStringList(value: unknown): string[] {
  const seen = new Set<string>();
  const rawItems = Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" || typeof item === "number" ? [String(item)] : [],
      )
    : typeof value === "string"
      ? splitStringList(value)
      : [];

  return rawItems.reduce<string[]>((items, item) => {
    const normalized = item.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      items.push(normalized);
    }

    return items;
  }, []);
}

function readString(sources: Array<DbRecord | null>, keys: string[]): string | null {
  for (const source of sources) {
    if (!source) continue;

    for (const key of keys) {
      const value = source[key];
      const direct = stringValue(value);
      if (direct) return direct;

      if (Array.isArray(value)) {
        const joined = normalizeStringList(value).join("\n");
        if (joined) return joined;
      }
    }
  }

  return null;
}

function readStringList(sources: Array<DbRecord | null>, keys: string[]): string[] {
  for (const source of sources) {
    if (!source) continue;

    for (const key of keys) {
      const items = normalizeStringList(source[key]);
      if (items.length > 0) return items;
    }
  }

  return [];
}

function readDiscoveryQueries(
  sources: Array<DbRecord | null>,
): DiscoveryQuery[] {
  for (const source of sources) {
    if (!source || !Array.isArray(source.discovery_queries)) continue;

    const queries: DiscoveryQuery[] = [];
    let hasMalformedQuery = false;
    for (const value of source.discovery_queries) {
      const query = asRecord(value);
      const queryType = stringValue(query?.query_type);
      const phrase = stringValue(query?.phrase);
      if (!queryType || !phrase || !isDiscoveryQueryType(queryType)) {
        hasMalformedQuery = true;
        break;
      }

      queries.push({
        query_type: queryType,
        phrase: phrase.replace(/\s+/g, " "),
      });
    }

    if (!hasMalformedQuery && !discoveryQueryPlanValidationError(queries)) {
      return queries.sort(
        (left, right) =>
          DISCOVERY_QUERY_TYPES.indexOf(left.query_type) -
          DISCOVERY_QUERY_TYPES.indexOf(right.query_type),
      );
    }
  }

  return [];
}

function nestedProfile(row: DbRecord | null): DbRecord | null {
  if (!row) return null;

  return (
    firstRecord(row.profile) ??
    firstRecord(row.profile_json) ??
    firstRecord(row.service_profile) ??
    firstRecord(row.structured_json) ??
    firstRecord(row.data)
  );
}

function emptyProfile(websiteUrl: string | null = null): ServiceProfileView {
  return {
    id: null,
    hasProfile: false,
    status: null,
    extractionStatus: null,
    embeddingStatus: null,
    embeddingFailureReason: null,
    embeddingGeneratedAt: null,
    websiteUrl,
    updatedAt: null,
    fields: EMPTY_FIELDS,
    rawProfile: null,
  };
}

export function normalizeServiceProfileStatus(status: string | null) {
  return status?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

export function isServiceProfileApproved(profile: ServiceProfileView) {
  return (
    profile.hasProfile &&
    normalizeServiceProfileStatus(profile.status) === "approved"
  );
}

export function isServiceProfileWarmingUp(profile: ServiceProfileView) {
  if (!profile.hasProfile) return true;

  const extractionStatus = normalizeServiceProfileStatus(profile.extractionStatus);
  const embeddingStatus = normalizeServiceProfileStatus(profile.embeddingStatus);

  if (
    extractionStatus &&
    !["completed", "manual_entry", "manual_refined"].includes(extractionStatus)
  ) {
    return !["failed", "error"].includes(extractionStatus);
  }

  if (["failed", "error"].includes(embeddingStatus ?? "")) {
    return false;
  }

  if (!profile.embeddingGeneratedAt && embeddingStatus !== "completed") {
    return true;
  }

  return ["queued", "pending", "processing", "generating"].includes(
    embeddingStatus ?? "",
  );
}

/**
 * A terminal report belongs to the active website crawl only when it was
 * written after that crawl was last updated. This prevents an older result
 * from appearing while the same website is being re-crawled.
 */
export function isBuyerDemandReportCurrent(
  crawlJob: CrawlJobView | null,
  report: BuyerDemandReportView | null,
) {
  if (!report?.isTerminal) return false;
  if (!crawlJob?.updatedAt) return true;

  const crawlTimestamp = Date.parse(crawlJob.updatedAt);
  const reportTimestamp = Date.parse(report.completedAt ?? report.updatedAt ?? "");

  // Preserve compatibility with older optional telemetry rows that do not
  // have usable timestamps rather than trapping a finished workspace.
  if (!Number.isFinite(crawlTimestamp) || !Number.isFinite(reportTimestamp)) {
    return true;
  }

  return reportTimestamp >= crawlTimestamp;
}

export async function fetchTenantWebsiteUrl(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("tenant_id, website_url")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ tenant_id: string; website_url: string | null }>();

  if (error) {
    console.error("[ProspectDashboard] tenant website lookup failed", {
      tenant_id: tenantId,
      error,
    });
    return null;
  }

  return data?.website_url ?? null;
}

export async function fetchServiceProfile(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  websiteUrl: string | null,
): Promise<ServiceProfileView> {
  if (!websiteUrl) return emptyProfile(null);

  let result = await supabase
    .from("service_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("website_url", websiteUrl)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, Json>>();

  if (result.error) {
    result = await supabase
      .from("service_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("url", websiteUrl)
      .limit(1)
      .maybeSingle<Record<string, Json>>();
  }

  if (result.error) {
    console.error("[ProspectDashboard] service profile lookup failed", {
      tenant_id: tenantId,
      error: result.error,
    });
    return emptyProfile(websiteUrl);
  }

  const row = asRecord(result.data);
  if (!row) return emptyProfile(websiteUrl);

  const profile = nestedProfile(row);
  const sources = [profile, row];
  const discoveryQueries = readDiscoveryQueries(sources);
  const searchTerms = readStringList(sources, [
    "search_terms",
    "discovery_terms",
  ]);

  return {
    id:
      readString([row], ["id", "profile_id", "service_profile_id"]) ??
      null,
    hasProfile: true,
    status: readString(sources, ["status", "review_status"]) ?? null,
    extractionStatus:
      readString(sources, ["extraction_status", "crawl_status"]) ?? null,
    embeddingStatus:
      readString(sources, ["embedding_status", "profile_embedding_status"]) ?? null,
    embeddingFailureReason:
      readString(sources, ["embedding_failure_reason"]) ?? null,
    embeddingGeneratedAt:
      readString(sources, [
        "profile_embedding_generated_at",
        "embedding_generated_at",
      ]) ?? null,
    websiteUrl:
      readString(sources, ["website_url", "url", "websiteUrl"]) ?? websiteUrl,
    updatedAt:
      readString([row], ["updated_at", "updatedAt", "created_at", "createdAt"]) ??
      null,
    fields: {
      target_audience: readStringList(sources, ["target_audience", "audience"]),
      core_problem:
        readString(sources, ["core_problem", "core_problem_solved"]) ?? "",
      unique_value_prop:
        readString(sources, [
          "unique_value_prop",
          "unique_value_proposition",
          "one_liner",
          "key_value_propositions",
        ]) ?? "",
      use_cases: readStringList(sources, ["use_cases", "usecases"]),
      pain_points: readStringList(sources, [
        "pain_points",
        "ideal_customer_pain_points",
      ]),
      buying_triggers: readStringList(sources, ["buying_triggers"]),
      urgency_signals: readStringList(sources, ["urgency_signals"]),
      discovery_queries: discoveryQueries,
      // Typed plans are canonical. Flat phrases are only surfaced for legacy
      // profiles that do not yet have a complete categorized plan.
      search_terms:
        discoveryQueries.length > 0
          ? discoveryQueries.map((query) => query.phrase)
          : searchTerms,
      negative_keywords: readStringList(sources, ["negative_keywords"]),
      excluded_audiences: readStringList(sources, [
        "excluded_audiences",
        "excluded_audience",
      ]),
    },
    rawProfile: (profile ?? row) as Record<string, unknown>,
  };
}

export async function fetchLatestCrawlJob(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  websiteUrl: string | null,
): Promise<CrawlJobView | null> {
  if (!websiteUrl) return null;

  const normalizedCandidates = Array.from(
    new Set([websiteUrl, websiteUrl.replace(/\/$/, "")].filter(Boolean)),
  );
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => {
                maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
              };
            };
          };
        };
      };
    };
  };

  const result = await client
    .from("crawl_jobs")
    .select(
      "id,status,phase,failure_reason,error_type,error_message,last_heartbeat_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .in("website_url", normalizedCandidates)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, Json>>();

  if (result.error) {
    console.warn("[ProspectDashboard] crawl job lookup unavailable", {
      tenant_id: tenantId,
      website_url: websiteUrl,
      error: result.error,
    });
    return null;
  }

  const row = asRecord(result.data);
  if (!row) return null;

  return {
    id: readString([row], ["id"]) ?? null,
    status: readString([row], ["status"]) ?? null,
    phase: readString([row], ["phase"]) ?? null,
    failureReason: readString([row], ["failure_reason", "failureReason"]) ?? null,
    errorType: readString([row], ["error_type", "errorType"]) ?? null,
    errorMessage: readString([row], ["error_message", "errorMessage"]) ?? null,
    lastHeartbeatAt:
      readString([row], ["last_heartbeat_at", "lastHeartbeatAt"]) ?? null,
    updatedAt: readString([row], ["updated_at", "updatedAt"]) ?? null,
  };
}

/**
 * A website crawl consumes meaningful source and model capacity. Keep the
 * dashboard aware of the server-enforced tenant-wide daily cooldown so people
 * know when a fresh scan will be useful again.
 */
export async function fetchWebsiteCrawlCooldown(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<WebsiteCrawlCooldownView> {
  return getWebsiteCrawlCooldown(supabase, tenantId);
}

function sourcePostFromRow(row: DbRecord): DbRecord {
  return (
    firstRecord(row.source_posts) ??
    firstRecord(row.source_post) ??
    firstRecord(row.source_post_data) ??
    firstRecord(row.source_post_json) ??
    firstRecord(row.post) ??
    row
  );
}

function sourcePostView(row: DbRecord): SourcePostView {
  const sourcePost = sourcePostFromRow(row);
  const metadata = firstRecord(sourcePost.metadata) ?? firstRecord(row.metadata);
  const sources = [sourcePost, metadata, row];
  const text =
    readString(sources, ["text", "body", "content", "post_text", "source_text"]) ??
    "Source text was not captured for this match.";

  return {
    title:
      readString(sources, ["title", "headline"]) ??
      text.slice(0, 96),
    text,
    source:
      readString(sources, ["source", "platform", "network"]) ?? "source",
    author: readString(sources, ["author", "username", "user_name"]),
    community: readString(sources, [
      "community",
      "subreddit",
      "channel",
      "forum",
      "group_name",
    ]),
    url: safeHttpUrl(readString(sources, ["url", "permalink", "link"])),
    publishedAt: readString(sources, [
      "published_at",
      "posted_at",
      "created_at",
      "createdAt",
    ]),
  };
}

function leadView(row: DbRecord, index: number): QualifiedLeadView {
  const verification = firstRecord(row.verification) ?? firstRecord(row.verifier_result);
  const sources = [verification, row];
  const sourcePost = sourcePostView(row);
  const urgencyReason = sourceGroundedUrgencyReason(
    sourcePost.text,
    readString(sources, ["urgency_reason"]),
  );

  return {
    id:
      readString([row], ["id", "lead_match_id", "match_id"]) ??
      `lead-${index}`,
    matchStatus: (readString([row], ["match_status"]) ??
      "ready_for_review") as LeadMatchStatus,
    verifierScore: numberValue(row.verifier_score) ?? 0,
    similarityScore:
      numberValue(row.similarity_score) ??
      numberValue(row.embedding_score) ??
      numberValue(row.match_score),
    painDetected:
      readString(sources, ["pain_detected"]) ??
      "No pain summary was stored for this verified match.",
    painTheme: readString(sources, ["pain_theme"]),
    signalType: readString(sources, ["signal_type"]),
    // An urgency level without a visible source-grounded reason is not shown
    // to a reviewer. This prevents a model-generated label from becoming an
    // unsupported claim about a public post.
    urgencyLevel: urgencyReason
      ? readString(sources, ["urgency_level"])
      : null,
    urgencyReason,
    evidenceExcerpt: sourceGroundedExcerpt(
      sourcePost.text,
      readString(sources, ["evidence_excerpt"]),
    ),
    matchReason:
      readString(sources, [
        "match_reason",
        "why_this_matches",
        "reason",
        "explanation",
      ]) ?? "No match rationale was stored for this verified match.",
    suggestedReply:
      readString(sources, [
        "suggested_reply",
        "suggestedReply",
        "reply_draft",
      ]) ?? "",
    matchedAt:
      readString([row], ["matched_at", "verified_at", "created_at", "createdAt"]) ??
      null,
    sourcePost,
  };
}

async function runLeadQuery(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string,
  threshold: number,
  select: string,
  withOrder = true,
  activeSince: string | null = null,
) {
  let query = supabase
    .from("lead_matches")
    .select(select)
    .eq("tenant_id", tenantId)
    .eq("service_profile_id", serviceProfileId)
    .in("match_status", ["ready_for_review", "qualified"])
    .gte("verifier_score", threshold);

  // A profile that was historically overwritten during a website replacement
  // can share an ID with legacy matches. Only show matches evaluated since the
  // active profile was updated, so a previous website's conversations never
  // appear as results for the current one.
  if (activeSince) {
    query = query.gte("updated_at", activeSince);
  }

  if (withOrder) {
    query = query
      .order("verifier_score", { ascending: false })
      .order("created_at", { ascending: false });
  }

  return query.limit(10);
}

export async function fetchQualifiedLeads(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
  threshold: number,
  activeSince: string | null = null,
): Promise<QualifiedLeadView[]> {
  if (!serviceProfileId) return [];

  let result = await runLeadQuery(
    supabase,
    tenantId,
    serviceProfileId,
    threshold,
    "*, source_posts(*)",
    true,
    activeSince,
  );

  if (result.error) {
    result = await runLeadQuery(
      supabase,
      tenantId,
      serviceProfileId,
      threshold,
      "*",
      true,
      activeSince,
    );
  }

  if (result.error) {
    result = await runLeadQuery(
      supabase,
      tenantId,
      serviceProfileId,
      threshold,
      "*",
      false,
      activeSince,
    );
  }

  // ``updated_at`` is part of the current lead-match contract. If an older
  // deployment lacks it, retain a readable dashboard rather than failing the
  // whole page; current deployments always keep the replacement-site guard.
  if (result.error && activeSince) {
    result = await runLeadQuery(
      supabase,
      tenantId,
      serviceProfileId,
      threshold,
      "*",
    );
  }

  if (result.error) {
    console.error("[ProspectDashboard] qualified lead lookup failed", {
      tenant_id: tenantId,
      verifier_score_threshold: threshold,
      error: result.error,
    });
    return [];
  }

  return ((result.data ?? []) as unknown[])
    .map((row, index) => leadView(asRecord(row) ?? {}, index))
    .filter((lead) => lead.verifierScore >= threshold);
}

async function runDiscoveryCandidateQuery(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string,
  select: string,
  withOrder = true,
  activeSince: string | null = null,
) {
  let query = supabase
    .from("lead_matches")
    .select(select)
    .eq("tenant_id", tenantId)
    .eq("service_profile_id", serviceProfileId)
    .eq("match_status", "discovery_candidate");

  if (activeSince) {
    query = query.gte("updated_at", activeSince);
  }

  if (withOrder) {
    query = query
      .order("verifier_score", { ascending: false })
      .order("created_at", { ascending: false });
  }

  return query.limit(10);
}

/**
 * These posts passed the LLM's relevance check but did not meet the automatic
 * review score. They are deliberately separate from verified leads so a human
 * can inspect useful evidence without treating it as a qualified opportunity.
 */
export async function fetchDiscoveryCandidates(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
  activeSince: string | null = null,
): Promise<QualifiedLeadView[]> {
  if (!serviceProfileId) return [];

  let result = await runDiscoveryCandidateQuery(
    supabase,
    tenantId,
    serviceProfileId,
    "*, source_posts(*)",
    true,
    activeSince,
  );

  if (result.error) {
    result = await runDiscoveryCandidateQuery(
      supabase,
      tenantId,
      serviceProfileId,
      "*",
      true,
      activeSince,
    );
  }

  if (result.error) {
    result = await runDiscoveryCandidateQuery(
      supabase,
      tenantId,
      serviceProfileId,
      "*",
      false,
      activeSince,
    );
  }

  if (result.error && activeSince) {
    result = await runDiscoveryCandidateQuery(
      supabase,
      tenantId,
      serviceProfileId,
      "*",
    );
  }

  if (result.error) {
    console.error("[ProspectDashboard] discovery candidate lookup failed", {
      tenant_id: tenantId,
      error: result.error,
    });
    return [];
  }

  return ((result.data ?? []) as unknown[]).map((row, index) =>
    leadView(asRecord(row) ?? {}, index),
  );
}

/**
 * Free workspaces receive aggregate discovery progress only. This query never
 * loads source text, author details, URLs, or reply drafts into the browser.
 */
export async function fetchLeadQueueCounts(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
  threshold: number,
  activeSince: string | null = null,
): Promise<LeadQueueCounts> {
  if (!serviceProfileId) {
    return { readyToReview: 0, discoveryCandidates: 0 };
  }

  type FreeLeadCountRow = {
    ready_to_review: number | null;
    discovery_candidates: number | null;
  };
  type FreeLeadCountClient = {
    rpc: (
      functionName: "free_plan_lead_queue_counts",
      args: {
        p_service_profile_id: string;
        p_minimum_verifier_score: number;
        p_active_since: string | null;
      },
    ) => Promise<{ data: FreeLeadCountRow[] | null; error: unknown }>;
  };

  const { data, error } = await (supabase as unknown as FreeLeadCountClient).rpc(
    "free_plan_lead_queue_counts",
    {
      p_service_profile_id: serviceProfileId,
      p_minimum_verifier_score: threshold,
      p_active_since: activeSince,
    },
  );

  if (error) {
    // Fail closed. Do not fall back to a regular lead_matches read: Free
    // access must never receive individual lead records.
    console.error("[ProspectDashboard] Free lead count lookup failed", {
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
      error,
    });
    return { readyToReview: 0, discoveryCandidates: 0 };
  }

  const row = data?.[0];
  return {
    readyToReview: row?.ready_to_review ?? 0,
    discoveryCandidates: row?.discovery_candidates ?? 0,
  };
}

function watchlistView(row: DbRecord): WatchlistView | null {
  const id = readString([row], ["id"]);
  const name = readString([row], ["name"]);
  const targetBuyer = readString([row], ["target_buyer"]);
  const problemToSolve = readString([row], ["problem_to_solve"]);
  if (!id || !name || !targetBuyer || !problemToSolve) return null;

  return {
    id,
    name,
    targetBuyer,
    problemToSolve,
    includeTerms: readStringList([row], ["include_terms"]),
    excludeTerms: readStringList([row], ["exclude_terms"]),
    sourcePreferences: readStringList([row], ["source_preferences"]),
    suggestedPlaces: readStringList([row], ["suggested_places"]),
    isActive: booleanValue(row.is_active) ?? false,
    embeddingStatus: readString([row], ["embedding_status"]),
    scanStatus: readString([row], ["scan_status"]),
    lastScanAt: readString([row], ["last_scan_at"]),
    lastScanError: readString([row], ["last_scan_error"]),
  };
}

/**
 * The Watchlists migration is additive. A missing table never blocks the
 * action queue from loading during a staged production rollout.
 */
export async function fetchWatchlists(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<WatchlistView[]> {
  const result = await supabase
    .from("watchlists")
    .select(
      "id,name,target_buyer,problem_to_solve,include_terms,exclude_terms,source_preferences,suggested_places,is_active,embedding_status,scan_status,last_scan_at,last_scan_error,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(24);
  if (result.error) {
    if (!isOptionalAdditiveSchemaUnavailable(result.error)) {
      console.error("[ProspectDashboard] Watchlist lookup failed", {
        tenant_id: tenantId,
        error: result.error,
      });
    }
    return [];
  }
  return ((result.data ?? []) as unknown[])
    .map((row) => watchlistView(asRecord(row) ?? {}))
    .filter((row): row is WatchlistView => Boolean(row));
}

export async function fetchWatchlistResults(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  watchlists: WatchlistView[],
  threshold: number,
): Promise<WatchlistResultsView[]> {
  if (watchlists.length === 0) return [];
  const watchlistIds = watchlists.map((watchlist) => watchlist.id);
  const joinedResult = await supabase
    .from("watchlist_matches")
    .select("*, source_posts(*)")
    .eq("tenant_id", tenantId)
    .in("watchlist_id", watchlistIds)
    .in("match_status", ["ready_for_review", "discovery_candidate"])
    .order("verifier_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(72);
  const result = joinedResult.error
    ? await supabase
      .from("watchlist_matches")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("watchlist_id", watchlistIds)
      .in("match_status", ["ready_for_review", "discovery_candidate"])
      .order("verifier_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(72)
    : joinedResult;
  if (result.error) {
    if (!isOptionalAdditiveSchemaUnavailable(result.error)) {
      console.error("[ProspectDashboard] Watchlist match lookup failed", {
        tenant_id: tenantId,
        error: result.error,
      });
    }
    return watchlists.map((watchlist) => ({
      watchlistId: watchlist.id,
      readyToAct: [],
      discoveryCandidates: [],
    }));
  }

  const grouped = new Map<string, WatchlistResultsView>(
    watchlists.map((watchlist) => [
      watchlist.id,
      { watchlistId: watchlist.id, readyToAct: [], discoveryCandidates: [] },
    ]),
  );
  for (const [index, rawRow] of ((result.data ?? []) as unknown[]).entries()) {
    const row = asRecord(rawRow) ?? {};
    const watchlistId = readString([row], ["watchlist_id"]);
    const group = watchlistId ? grouped.get(watchlistId) : null;
    if (!group) continue;
    const lead = leadView(row, index);
    if (
      lead.matchStatus === "ready_for_review" &&
      lead.verifierScore >= threshold &&
      group.readyToAct.length < 6
    ) {
      group.readyToAct.push(lead);
    } else if (
      lead.matchStatus === "discovery_candidate" &&
      group.discoveryCandidates.length < 6
    ) {
      group.discoveryCandidates.push(lead);
    }
  }
  return Array.from(grouped.values());
}

type OptionalReadQuery = {
  eq: (column: string, value: string) => OptionalReadQuery;
  in: (column: string, values: string[]) => OptionalReadQuery;
  gte: (column: string, value: number) => OptionalReadQuery;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => OptionalReadQuery;
  limit: (count: number) => OptionalReadQuery;
  maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
};

type OptionalReadClient = {
  from: (table: string) => {
    select: (columns: string) => OptionalReadQuery;
  };
};

type OptionalEvidenceReadQuery = {
  eq: (column: string, value: string) => OptionalEvidenceReadQuery;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => OptionalEvidenceReadQuery;
  limit: (
    count: number,
  ) => Promise<{ data: Array<Record<string, Json>> | null; error: unknown }>;
};

type OptionalEvidenceReadClient = {
  from: (table: string) => {
    select: (columns: string) => OptionalEvidenceReadQuery;
  };
};

function discoveryRunView(
  row: DbRecord,
  marketPatterns: BuyerDemandReportView["marketPatterns"],
): BuyerDemandReportView | null {
  const id = readString([row], ["id"]);
  if (!id) return null;

  const status = normalizeServiceProfileStatus(readString([row], ["status"]));

  return {
    id,
    status,
    completedAt: readString([row], ["completed_at", "completedAt"]),
    updatedAt: readString([row], ["updated_at", "updatedAt"]),
    // The UI stops its empty-state polling only for this explicit terminal
    // report. Cancelled/unknown runs do not masquerade as a useful
    // customer-facing result, while partial/skipped/failed runs retain their
    // diagnostics and prevent unnecessary empty-state polling.
    isCompleted: isCompletedDiscoveryRunStatus(status),
    isTerminal: isTerminalDiscoveryRunStatus(status),
    summary: parseDiscoveryRunSummary(row.summary),
    marketPatterns,
  };
}

function patternMatchFromRow(row: DbRecord): VerifierConfirmedPatternMatch | null {
  const verification = firstRecord(row.verification) ?? firstRecord(row.verifier_result);
  const id = readString([row], ["id"]);
  const tenantId = readString([row], ["tenant_id", "tenantId"]);
  const matchStatus = readString([row], ["match_status"]);
  const verifierScore = numberValue(row.verifier_score);

  if (!id || !tenantId || !matchStatus || verifierScore === null) return null;

  return {
    id,
    tenantId,
    matchStatus,
    verifierScore,
    painTheme: readString([verification, row], ["pain_theme"]),
    painDetected: readString([verification, row], ["pain_detected"]),
    verifierExecuted: booleanValue(verification?.verifier_executed),
    verifierMatch: booleanValue(verification?.match),
  };
}

/**
 * Fetch a terminal, tenant-owned discovery report when the optional
 * telemetry migration is present. This intentionally does not read run events
 * or source posts: the report is aggregate-only and all individual evidence
 * stays in the tenant-scoped action/watch queues above.
 */
export async function fetchBuyerDemandReport(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
  threshold: number,
): Promise<BuyerDemandReportView | null> {
  if (!serviceProfileId) return null;

  const client = supabase as unknown as OptionalReadClient;
  let runRow: DbRecord | null = null;

  try {
    let result = await client
      .from("discovery_runs")
      .select("id,tenant_id,service_profile_id,run_kind,status,summary,completed_at,updated_at")
      .eq("tenant_id", tenantId)
      .eq("service_profile_id", serviceProfileId)
      // Research runs have their own evidence/reporting surface. They must
      // never replace the opportunity scan that explains an empty action
      // queue, even though both runs use the same matching brief.
      .eq("run_kind", "opportunity_leads")
      .in("status", ["completed", "partial", "skipped", "failed"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle<Record<string, Json>>();

    // `run_kind` is an additive research migration. Before it is applied,
    // every existing discovery run is necessarily an opportunity run, so a
    // scoped legacy read preserves the existing empty-state report without
    // risking a research run replacing it.
    if (result.error && isMissingDiscoveryRunKindColumn(result.error)) {
      result = await client
        .from("discovery_runs")
        .select("id,tenant_id,service_profile_id,status,summary,completed_at,updated_at")
        .eq("tenant_id", tenantId)
        .eq("service_profile_id", serviceProfileId)
        .in("status", ["completed", "partial", "skipped", "failed"])
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle<Record<string, Json>>();
    }

    if (result.error) {
      // `discovery_runs` is intentionally an additive migration. Do not make
      // dashboard availability depend on it being deployed everywhere yet.
      if (!isOptionalAdditiveSchemaUnavailable(result.error)) {
        console.warn("[ProspectDashboard] discovery report unavailable", {
          tenant_id: tenantId,
          service_profile_id: serviceProfileId,
          error: result.error,
        });
      }
      return null;
    }

    runRow = asRecord(result.data);
  } catch (error) {
    console.info("[ProspectDashboard] discovery report lookup skipped", {
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
      error_type: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }

  if (!runRow) return null;

  // Defense in depth beyond RLS and the query predicate: never surface a row
  // whose persisted ownership does not exactly match this server context.
  if (
    readString([runRow], ["tenant_id", "tenantId"]) !== tenantId ||
    readString([runRow], ["service_profile_id", "serviceProfileId"]) !==
      serviceProfileId
  ) {
    console.warn("[ProspectDashboard] discovery report ownership mismatch", {
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
    });
    return null;
  }

  let marketPatterns: BuyerDemandReportView["marketPatterns"] = [];
  try {
    const patternResult = await supabase
      .from("lead_matches")
      .select(
        "id,tenant_id,service_profile_id,match_status,verifier_score,pain_detected,verification,verifier_result",
      )
      .eq("tenant_id", tenantId)
      .eq("service_profile_id", serviceProfileId)
      .in("match_status", ["ready_for_review", "qualified"])
      .gte("verifier_score", threshold)
      .limit(100);

    if (patternResult.error) {
      console.info("[ProspectDashboard] buyer-demand pattern lookup unavailable", {
        tenant_id: tenantId,
        service_profile_id: serviceProfileId,
      });
    } else {
      marketPatterns = deriveBuyerDemandPatterns(
        ((patternResult.data ?? []) as unknown[])
          .map((row) => patternMatchFromRow(asRecord(row) ?? {}))
          .filter(
            (match): match is VerifierConfirmedPatternMatch => match !== null,
          ),
        tenantId,
        threshold,
      );
    }
  } catch (error) {
    console.info("[ProspectDashboard] buyer-demand pattern lookup skipped", {
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
      error_type: error instanceof Error ? error.name : "unknown",
    });
  }

  return discoveryRunView(runRow, marketPatterns);
}

/**
 * Read the optional, tenant-scoped evidence store for buyer-language
 * research. The source worker owns writing this table; this dashboard code is
 * intentionally read-only and fails closed when the additive migration has
 * not been deployed. We select only the canonical evidence contract so a
 * future schema change cannot accidentally surface an unreviewed JSON field.
 */
export async function fetchBuyerLanguageResearch(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
): Promise<BuyerLanguageResearchView> {
  const unavailable: BuyerLanguageResearchView = {
    availability: "unavailable",
    evidence: [],
  };

  if (!serviceProfileId) return unavailable;

  const client = supabase as unknown as OptionalEvidenceReadClient;

  try {
    const result = await client
      .from("discovery_evidence")
      .select(
        "id,tenant_id,service_profile_id,evidence_status,source,source_url,source_text,evidence_excerpt,created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("service_profile_id", serviceProfileId)
      .eq("evidence_status", "accepted")
      .order("created_at", { ascending: false })
      .limit(12);

    if (result.error) {
      if (!isOptionalAdditiveSchemaUnavailable(result.error)) {
        console.warn("[ProspectDashboard] buyer-language research unavailable", {
          tenant_id: tenantId,
          service_profile_id: serviceProfileId,
          error: result.error,
        });
      }
      return unavailable;
    }

    return {
      availability: "available",
      // Query predicates and RLS constrain ownership, and this helper checks
      // it again before rendering any evidence.
      evidence: buildBuyerLanguageResearchEvidence(
        (result.data ?? []) as unknown[],
        tenantId,
        serviceProfileId,
      ),
    };
  } catch (error) {
    console.info("[ProspectDashboard] buyer-language research lookup skipped", {
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
      error_type: error instanceof Error ? error.name : "unknown",
    });
    return unavailable;
  }
}
