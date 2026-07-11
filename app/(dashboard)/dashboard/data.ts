import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/supabase";
import type {
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
    websiteUrl,
    updatedAt: null,
    fields: EMPTY_FIELDS,
  };
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
    url: readString(sources, ["url", "permalink", "link"]),
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
    verifierScore: numberValue(row.verifier_score) ?? 0,
    similarityScore:
      numberValue(row.similarity_score) ??
      numberValue(row.embedding_score) ??
      numberValue(row.match_score),
    painDetected:
      readString(sources, ["pain_detected"]) ??
      "No pain summary was stored for this qualified match.",
    matchReason:
      readString(sources, [
        "match_reason",
        "why_this_matches",
        "reason",
        "explanation",
      ]) ?? "No match rationale was stored for this qualified match.",
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
    .eq("match_status", "qualified")
    .gte("verifier_score", threshold);

  if (withOrder) {
    query = query
      .order("verifier_score", { ascending: false })
      .order("created_at", { ascending: false });
  }

  return query.limit(30);
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
