import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudienceSegment, RiskUser } from "@/lib/types";

const AT_RISK_THRESHOLD = 70;
const DEFAULT_TARGET_LIMIT = 500;

type SupabaseLike = SupabaseClient<any> | any;

type UserProfileRow = {
  id: string | null;
  email: string | null;
  last_seen_at?: string | null;
  last_seen?: string | null;
  last_active_at?: string | null;
};

type RiskStateRow = {
  user_id: string | null;
  risk_score: number | string | null;
  risk_tier?: string | null;
  primary_risk_signal?: string | null;
  updated_at?: string | null;
};

export function normalizeAudienceSegment(value: unknown): AudienceSegment {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "at_risk" ? "at_risk" : "all";
}

export async function fetchCampaignTargetUsers({
  supabase,
  tenantId,
  segment,
  limit = DEFAULT_TARGET_LIMIT,
}: {
  supabase: SupabaseLike;
  tenantId: string;
  segment: AudienceSegment;
  limit?: number;
}): Promise<{ users: RiskUser[]; error: unknown | null }> {
  if (!tenantId) {
    return { users: [], error: new Error("tenantId is required") };
  }

  if (segment === "at_risk") {
    return fetchAtRiskTargetUsers(supabase, tenantId, limit);
  }

  return fetchAllTargetUsers(supabase, tenantId, limit);
}

async function fetchAllTargetUsers(
  supabase: SupabaseLike,
  tenantId: string,
  limit: number
): Promise<{ users: RiskUser[]; error: unknown | null }> {
  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, email, last_seen_at, last_seen, last_active_at")
    .eq("tenant_id", tenantId)
    .not("email", "is", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (profileError) {
    return { users: [], error: profileError };
  }

  const profiles = ((profileData || []) as UserProfileRow[]).filter(
    (row) => row.id && row.email
  );
  const userIds = profiles.map((row) => String(row.id));
  const riskByUserId = await fetchRiskStatesByUserIds(supabase, tenantId, userIds);

  return {
    users: profiles.map((profile) =>
      normalizeTargetUser(profile, riskByUserId.get(String(profile.id)))
    ),
    error: null,
  };
}

async function fetchAtRiskTargetUsers(
  supabase: SupabaseLike,
  tenantId: string,
  limit: number
): Promise<{ users: RiskUser[]; error: unknown | null }> {
  const { rows: riskRows, error: riskError } = await fetchRiskStateRows(
    supabase,
    tenantId,
    {
      minScore: AT_RISK_THRESHOLD,
      limit,
    }
  );

  if (riskError) {
    return { users: [], error: riskError };
  }

  const userIds = riskRows
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id));

  if (userIds.length === 0) {
    return { users: [], error: null };
  }

  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, email, last_seen_at, last_seen, last_active_at")
    .eq("tenant_id", tenantId)
    .in("id", userIds)
    .not("email", "is", null)
    .limit(limit);

  if (profileError) {
    return { users: [], error: profileError };
  }

  const profilesById = new Map(
    ((profileData || []) as UserProfileRow[])
      .filter((row) => row.id && row.email)
      .map((row) => [String(row.id), row])
  );

  return {
    users: riskRows
      .map((risk) => {
        const profile = profilesById.get(String(risk.user_id));
        return profile ? normalizeTargetUser(profile, risk) : null;
      })
      .filter((user): user is RiskUser => Boolean(user)),
    error: null,
  };
}

async function fetchRiskStatesByUserIds(
  supabase: SupabaseLike,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, RiskStateRow>> {
  if (userIds.length === 0) return new Map();

  const { rows, error } = await fetchRiskStateRows(supabase, tenantId, {
    userIds,
  });

  if (error) {
    console.error("[CampaignTargets] Failed to fetch churn risk states", {
      tenantId,
      error,
    });
    return new Map();
  }

  return new Map(
    rows
      .filter((row) => row.user_id)
      .map((row) => [String(row.user_id), row])
  );
}

async function fetchRiskStateRows(
  supabase: SupabaseLike,
  tenantId: string,
  options: {
    userIds?: string[];
    minScore?: number;
    limit?: number;
  }
): Promise<{ rows: RiskStateRow[]; error: unknown | null }> {
  const runQuery = async (selectFields: string) => {
    let query = supabase
      .from("churn_risk_state")
      .select(selectFields)
      .eq("tenant_id", tenantId);

    if (options.userIds) {
      query = query.in("user_id", options.userIds);
    }

    if (typeof options.minScore === "number") {
      query = query.gte("risk_score", options.minScore);
    }

    query = query.order("risk_score", { ascending: false, nullsFirst: false });

    if (typeof options.limit === "number") {
      query = query.limit(options.limit);
    }

    return query;
  };

  const first = await runQuery(
    "user_id, risk_score, risk_tier, primary_risk_signal, updated_at"
  );

  if (!first.error) {
    return { rows: (first.data || []) as RiskStateRow[], error: null };
  }

  const fallback = await runQuery("user_id, risk_score, risk_tier, updated_at");
  if (fallback.error) {
    return { rows: [], error: fallback.error };
  }

  return { rows: (fallback.data || []) as RiskStateRow[], error: null };
}

function normalizeTargetUser(
  profile: UserProfileRow,
  risk?: RiskStateRow
): RiskUser {
  const score = normalizeScore(risk?.risk_score);

  return {
    id: String(profile.id || ""),
    email: String(profile.email || "Unknown Email"),
    riskScore: score,
    signal: normalizeSignal(risk?.primary_risk_signal, score),
    lastActive: formatLastActive(
      profile.last_seen_at ?? profile.last_seen ?? profile.last_active_at ?? null
    ),
  };
}

function normalizeScore(value: RiskStateRow["risk_score"] | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

function normalizeSignal(value: string | null | undefined, score: number | null): string {
  if (value && value.trim()) {
    return value.replace(/_/g, " ");
  }

  if (score === null || score < AT_RISK_THRESHOLD) {
    return "Green / Healthy";
  }

  return "High Risk Detected";
}

function formatLastActive(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}
