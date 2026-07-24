import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/supabase";
import type {
  CrawlJobView,
  LeadMatchStatus,
  QualifiedLeadView,
  ServiceProfileFields,
  ServiceProfileView,
  SourcePostView,
} from "./prospect-types";

type DbRecord = Record<string, unknown>;

const EMPTY_FIELDS: ServiceProfileFields = {
  target_audience: [],
  core_problem: "",
  unique_value_prop: "",
  use_cases: [],
  pain_points: [],
  buying_triggers: [],
  negative_keywords: [],
  excluded_audiences: [],
};

export function verifierScoreThreshold() {
  const configured = Number(process.env.LEAD_VERIFIER_SCORE_THRESHOLD ?? "0.7");
  return Number.isFinite(configured) ? configured : 0.7;
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
  let result = await supabase
    .from("service_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, Json>>();

  if (result.error) {
    result = await supabase
      .from("service_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
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
    sourcePost: sourcePostView(row),
  };
}

async function runLeadQuery(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  threshold: number,
  select: string,
  withOrder = true,
) {
  let query = supabase
    .from("lead_matches")
    .select(select)
    .eq("tenant_id", tenantId)
    .in("match_status", ["ready_for_review", "qualified"])
    .gte("verifier_score", threshold);

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
  threshold: number,
): Promise<QualifiedLeadView[]> {
  let result = await runLeadQuery(
    supabase,
    tenantId,
    threshold,
    "*, source_posts(*)",
  );

  if (result.error) {
    result = await runLeadQuery(supabase, tenantId, threshold, "*");
  }

  if (result.error) {
    result = await runLeadQuery(supabase, tenantId, threshold, "*", false);
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
