import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emptyTargetingBriefView,
  normalizeSeedUrl,
  normalizeTargetingBriefInput,
  type TargetingBriefView,
} from "@/lib/targeting-brief";
import type { Database, Json } from "@/types/supabase";

import type {
  ProspectTargetEntityKind,
  ProspectTargetView,
  EntityResearchRunKind,
  EntityResearchRunStatus,
  EntityResearchRunView,
  TargetAssessmentState,
  TargetFeedbackSummary,
  TargetFeedbackSummaryType,
  TargetEvidenceKind,
  TargetEvidenceReviewStatus,
  TargetEvidenceView,
  TargetMonitoringStatus,
  TargetOpportunityStatus,
} from "../prospect-types";

type DbRecord = Record<string, unknown>;

type ReadQuery = {
  eq: (column: string, value: string) => ReadQuery;
  in: (column: string, values: string[]) => ReadQuery;
  order: (column: string, options: { ascending: boolean }) => ReadQuery;
  limit: (count: number) => ReadQuery;
  maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
};

type TargetingReadClient = {
  rpc: (
    functionName: string,
    arguments_: Record<string, Json>,
  ) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    select: (columns: string) => ReadQuery;
  };
};

const TARGET_ENTITY_KINDS = new Set<ProspectTargetEntityKind>([
  "account",
  "builder",
  "project",
]);
const ASSESSMENT_STATES = new Set<TargetAssessmentState>([
  "high_fit",
  "triggered",
  "signal_backed",
  "strong_buyer_signal",
  "rejected",
]);
const EVIDENCE_KINDS = new Set<TargetEvidenceKind>([
  "fit",
  "trigger",
  "problem",
  "evaluation",
  "relationship",
]);
const EVIDENCE_REVIEW_STATUSES = new Set<TargetEvidenceReviewStatus>([
  "pending",
  "accepted",
]);
const TARGET_FEEDBACK_SUMMARY_TYPES = new Set<TargetFeedbackSummaryType>([
  "promote_to_opportunity",
  "target",
  "useful_not_now",
  "not_relevant",
  "monitor",
  "contacted",
  "meeting",
  "won",
  "lost",
]);
const TARGET_MONITOR_STATUSES = new Set<TargetMonitoringStatus["status"]>([
  "active",
  "paused",
]);
const TARGET_OPPORTUNITY_STATUSES = new Set<TargetOpportunityStatus["status"]>([
  "ready_for_review",
  "qualified",
  "invalidated",
]);
const ENTITY_RESEARCH_RUN_KINDS = new Set<EntityResearchRunKind>([
  "candidate_generation",
  "evidence_collection",
]);
const ENTITY_RESEARCH_RUN_STATUSES = new Set<EntityResearchRunStatus>([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "skipped",
]);

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function nonnegativeCount(value: unknown): number | null {
  const normalized = typeof value === "number" ? value : stringValue(value);
  const numeric = typeof normalized === "number"
    ? normalized
    : normalized === null
      ? Number.NaN
      : Number(normalized);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return null;
  return numeric;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = stringValue(item)?.replace(/\s+/g, " ");
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function publicHttpUrl(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate ? normalizeSeedUrl(candidate) || null : null;
}

function optionalSchemaUnavailable(error: unknown) {
  const record = asRecord(error);
  const code = stringValue(record?.code);
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST202" ||
    code === "PGRST204"
  );
}

/**
 * Targeting is an additive migration. A missing contract must leave the
 * existing conversation-based prospect desk usable, while a real ownership or
 * query failure remains observable in server logs.
 */
function logOptionalTargetingFailure(operation: string, error: unknown) {
  if (optionalSchemaUnavailable(error)) return;
  console.warn(`[TargetDesk] ${operation} unavailable`, { error });
}

export async function fetchTargetingBrief(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
): Promise<TargetingBriefView> {
  if (!serviceProfileId) return emptyTargetingBriefView();

  const client = supabase as unknown as TargetingReadClient;
  try {
    const result = await client
      .from("targeting_profiles")
      .select(
        "id,tenant_id,service_profile_id,target_types,ideal_customer_traits,change_triggers,strong_evidence_definitions,exclusions,seed_urls,updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("service_profile_id", serviceProfileId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<DbRecord>();

    if (result.error) {
      logOptionalTargetingFailure("targeting brief lookup", result.error);
      return emptyTargetingBriefView();
    }

    const row = asRecord(result.data);
    if (
      !row ||
      stringValue(row.tenant_id) !== tenantId ||
      stringValue(row.service_profile_id) !== serviceProfileId
    ) {
      return emptyTargetingBriefView();
    }

    const fields = normalizeTargetingBriefInput({
      targetTypes: stringList(row.target_types) as TargetingBriefView["targetTypes"],
      idealCustomerTraits: stringList(row.ideal_customer_traits),
      changeTriggers: stringList(row.change_triggers),
      strongEvidenceDefinitions: stringList(row.strong_evidence_definitions),
      exclusions: stringList(row.exclusions),
      seedUrls: stringList(row.seed_urls),
    });
    return {
      id: stringValue(row.id),
      hasBrief: true,
      updatedAt: stringValue(row.updated_at),
      ...fields,
    };
  } catch (error) {
    logOptionalTargetingFailure("targeting brief lookup", error);
    return emptyTargetingBriefView();
  }
}

type AssessmentRow = {
  assessmentId: string;
  prospectEntityId: string;
  state: TargetAssessmentState;
  reasons: string[];
  assessedAt: string | null;
};

function assessmentFromRow(value: unknown): AssessmentRow | null {
  const row = asRecord(value);
  const assessmentId = stringValue(row?.id);
  const prospectEntityId = stringValue(row?.prospect_entity_id);
  const state = stringValue(row?.assessment_state);
  if (
    !assessmentId ||
    !prospectEntityId ||
    !state ||
    !ASSESSMENT_STATES.has(state as TargetAssessmentState)
  ) {
    return null;
  }

  return {
    assessmentId,
    prospectEntityId,
    state: state as TargetAssessmentState,
    reasons: stringList(row?.reason_codes),
    assessedAt: stringValue(row?.last_assessed_at) ?? stringValue(row?.updated_at),
  };
}

function evidenceFromRow(value: unknown): {
  prospectEntityId: string;
  evidence: TargetEvidenceView;
} | null {
  const row = asRecord(value);
  const id = stringValue(row?.id);
  const prospectEntityId = stringValue(row?.prospect_entity_id);
  const kind = stringValue(row?.evidence_type);
  const summary = stringValue(row?.summary);
  const reviewStatus = stringValue(row?.evidence_status);
  if (
    !id ||
    !prospectEntityId ||
    !kind ||
    !summary ||
    !reviewStatus ||
    !EVIDENCE_KINDS.has(kind as TargetEvidenceKind) ||
    !EVIDENCE_REVIEW_STATUSES.has(reviewStatus as TargetEvidenceReviewStatus)
  ) {
    return null;
  }

  const evidenceStrength = stringValue(row?.evidence_strength);
  // A worker's strength estimate is useful context, but a pending row has not
  // yet been accepted as a reliable target-to-source link by a human reviewer.
  const entityLinkConfidence =
    reviewStatus === "accepted" && evidenceStrength === "strong"
      ? "verified"
      : reviewStatus === "accepted" && evidenceStrength === "moderate"
        ? "likely"
        : "unverified";
  return {
    prospectEntityId,
    evidence: {
      id,
      kind: kind as TargetEvidenceKind,
      summary,
      excerpt: stringValue(row?.evidence_excerpt),
      sourceLabel: stringValue(row?.source),
      sourceUrl: publicHttpUrl(row?.source_url),
      observedAt: stringValue(row?.observed_at),
      entityLinkConfidence,
      reviewStatus: reviewStatus as TargetEvidenceReviewStatus,
    },
  };
}

function feedbackSummaryFromRow(value: unknown): TargetFeedbackSummary | null {
  const row = asRecord(value);
  const feedbackType = stringValue(row?.feedback_type);
  const feedbackCount = nonnegativeCount(row?.feedback_count);
  const targetCount = nonnegativeCount(row?.target_count);
  if (
    !feedbackType ||
    feedbackCount === null ||
    targetCount === null ||
    !TARGET_FEEDBACK_SUMMARY_TYPES.has(feedbackType as TargetFeedbackSummaryType)
  ) {
    return null;
  }
  return {
    feedbackType: feedbackType as TargetFeedbackSummaryType,
    feedbackCount,
    targetCount,
    latestFeedbackAt: stringValue(row?.latest_feedback_at),
  };
}

function monitoringStatusFromRow(value: unknown): {
  prospectEntityId: string;
  monitoring: TargetMonitoringStatus;
} | null {
  const row = asRecord(value);
  const prospectEntityId = stringValue(row?.prospect_entity_id);
  const status = stringValue(row?.monitor_status);
  if (
    !prospectEntityId ||
    !status ||
    !TARGET_MONITOR_STATUSES.has(status as TargetMonitoringStatus["status"])
  ) {
    return null;
  }
  return {
    prospectEntityId,
    monitoring: {
      status: status as TargetMonitoringStatus["status"],
      nextRefreshAt: stringValue(row?.next_refresh_at),
      lastDispatchedAt: stringValue(row?.last_dispatched_at),
    },
  };
}

function opportunityStatusFromRow(value: unknown): {
  assessmentId: string;
  opportunity: TargetOpportunityStatus;
} | null {
  const row = asRecord(value);
  const assessmentId = stringValue(row?.prospect_assessment_id);
  const opportunityId = stringValue(row?.opportunity_id);
  const status = stringValue(row?.opportunity_status);
  if (
    !assessmentId ||
    !opportunityId ||
    !status ||
    !TARGET_OPPORTUNITY_STATUSES.has(status as TargetOpportunityStatus["status"])
  ) {
    return null;
  }

  return {
    assessmentId,
    opportunity: {
      id: opportunityId,
      status: status as TargetOpportunityStatus["status"],
      createdAt: stringValue(row?.created_at),
      qualifiedAt: stringValue(row?.qualified_at),
    },
  };
}

function entityResearchRunFromRow(
  value: unknown,
  tenantId: string,
  targetingProfileId: string,
): EntityResearchRunView | null {
  const row = asRecord(value);
  const runKind = stringValue(row?.run_kind);
  const status = stringValue(row?.status);
  if (
    stringValue(row?.tenant_id) !== tenantId ||
    stringValue(row?.targeting_profile_id) !== targetingProfileId ||
    !runKind ||
    !status ||
    !ENTITY_RESEARCH_RUN_KINDS.has(runKind as EntityResearchRunKind) ||
    !ENTITY_RESEARCH_RUN_STATUSES.has(status as EntityResearchRunStatus)
  ) {
    return null;
  }

  return {
    kind: runKind as EntityResearchRunKind,
    status: status as EntityResearchRunStatus,
    createdAt: stringValue(row?.created_at),
    startedAt: stringValue(row?.started_at),
    completedAt: stringValue(row?.completed_at),
  };
}

/**
 * Read aggregate target outcomes through an RPC rather than returning reviewer
 * identities or raw per-target feedback. These counts are informational; they
 * never alter assessment state or ranking in the browser.
 */
export async function fetchProspectFeedbackSummary(
  supabase: SupabaseClient<Database>,
  targetingProfileId: string | null,
): Promise<TargetFeedbackSummary[]> {
  if (!targetingProfileId) return [];

  const client = supabase as unknown as TargetingReadClient;
  try {
    const result = await client.rpc("list_prospect_feedback_summary_for_profile", {
      target_profile_id: targetingProfileId,
    }) as { data: unknown[] | null; error: unknown };
    if (result.error) {
      logOptionalTargetingFailure("target feedback summary lookup", result.error);
      return [];
    }
    return (result.data ?? [])
      .map(feedbackSummaryFromRow)
      .filter((summary): summary is TargetFeedbackSummary => summary !== null);
  } catch (error) {
    logOptionalTargetingFailure("target feedback summary lookup", error);
    return [];
  }
}

/**
 * Read only the active/paused monitor projection. Scheduler leases, errors,
 * run IDs, source locators, and raw retained records stay server-owned.
 */
export async function fetchProspectTargetMonitoringStatuses(
  supabase: SupabaseClient<Database>,
  targetingProfileId: string | null,
): Promise<Map<string, TargetMonitoringStatus> | null> {
  if (!targetingProfileId) return new Map();

  const client = supabase as unknown as TargetingReadClient;
  try {
    const result = await client.rpc(
      "list_prospect_target_monitor_status_for_profile",
      { target_profile_id: targetingProfileId },
    ) as { data: unknown[] | null; error: unknown };
    if (result.error) {
      logOptionalTargetingFailure("target monitoring status lookup", result.error);
      // The monitor contract is additive. Treat any unavailable projection as
      // not deployed so the page never offers a control that cannot be saved.
      return null;
    }
    const statuses = new Map<string, TargetMonitoringStatus>();
    for (const value of result.data ?? []) {
      const parsed = monitoringStatusFromRow(value);
      if (parsed) statuses.set(parsed.prospectEntityId, parsed.monitoring);
    }
    return statuses;
  } catch (error) {
    logOptionalTargetingFailure("target monitoring status lookup", error);
    return null;
  }
}

/**
 * Read only a target assessment's opportunity lifecycle projection. A missing
 * migration returns `null` so callers can withhold the corresponding actions
 * rather than presenting a control that cannot safely persist.
 */
export async function fetchProspectTargetOpportunityStatuses(
  supabase: SupabaseClient<Database>,
  targetingProfileId: string | null,
): Promise<Map<string, TargetOpportunityStatus> | null> {
  if (!targetingProfileId) return new Map();

  const client = supabase as unknown as TargetingReadClient;
  try {
    const result = await client.rpc(
      "list_prospect_opportunity_status_for_profile",
      { target_profile_id: targetingProfileId },
    ) as { data: unknown[] | null; error: unknown };
    if (result.error) {
      logOptionalTargetingFailure("target opportunity status lookup", result.error);
      return null;
    }

    const statuses = new Map<string, TargetOpportunityStatus>();
    for (const value of result.data ?? []) {
      const parsed = opportunityStatusFromRow(value);
      if (parsed) statuses.set(parsed.assessmentId, parsed.opportunity);
    }
    return statuses;
  } catch (error) {
    logOptionalTargetingFailure("target opportunity status lookup", error);
    return null;
  }
}

/**
 * Return at most the newest status for each explicit entity-research action.
 * The projection intentionally excludes run IDs, request/entity mappings,
 * leases, errors, result payloads, URLs, query text, and source content.
 */
export async function fetchEntityResearchRunStatuses(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  targetingProfileId: string | null,
): Promise<Partial<Record<EntityResearchRunKind, EntityResearchRunView>>> {
  if (!targetingProfileId) return {};

  const client = supabase as unknown as TargetingReadClient;
  try {
    const request = client
      .from("prospect_research_runs")
      .select("tenant_id,targeting_profile_id,run_kind,status,created_at,started_at,completed_at")
      .eq("tenant_id", tenantId)
      .eq("targeting_profile_id", targetingProfileId)
      .in("run_kind", [...ENTITY_RESEARCH_RUN_KINDS])
      .order("created_at", { ascending: false })
      .limit(12);
    const result = await (request as unknown as Promise<{
      data: unknown[] | null;
      error: unknown;
    }>);

    if (result.error) {
      logOptionalTargetingFailure("entity research run lookup", result.error);
      return {};
    }

    const newest: Partial<Record<EntityResearchRunKind, EntityResearchRunView>> = {};
    for (const value of result.data ?? []) {
      const run = entityResearchRunFromRow(value, tenantId, targetingProfileId);
      // The database query is newest-first. Keep the first safely parsed row
      // for each action rather than exposing a historical run as current.
      if (run && !newest[run.kind]) newest[run.kind] = run;
    }
    return newest;
  } catch (error) {
    logOptionalTargetingFailure("entity research run lookup", error);
    return {};
  }
}

/**
 * Read a tenant-scoped target projection. New manual targets correctly render
 * with an empty observation list until a later research worker has stored
 * accepted or pending evidence; the UI never fabricates buyer context for
 * them. Rejected evidence stays out of the review projection.
 */
export async function fetchProspectTargets(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  targetingProfileId: string | null,
): Promise<ProspectTargetView[]> {
  if (!targetingProfileId) return [];

  const client = supabase as unknown as TargetingReadClient;
  try {
    const assessmentRequest = client
      .from("prospect_assessments")
      .select(
        "id,tenant_id,prospect_entity_id,assessment_state,reason_codes,last_assessed_at,updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("targeting_profile_id", targetingProfileId)
      .order("last_assessed_at", { ascending: false })
      .limit(100);
    const assessmentResult = await (assessmentRequest as unknown as Promise<{
      data: unknown[] | null;
      error: unknown;
    }>);

    if (assessmentResult.error) {
      logOptionalTargetingFailure("target assessment lookup", assessmentResult.error);
      return [];
    }

    const assessments = (assessmentResult.data ?? [])
      .map(assessmentFromRow)
      .filter((assessment): assessment is AssessmentRow => assessment !== null);
    const assessmentByEntityId = new Map<string, AssessmentRow>();
    for (const assessment of assessments) {
      // The query is newest-first. Preserve the first assessment instead of
      // allowing an older row to overwrite a newer current assessment.
      if (!assessmentByEntityId.has(assessment.prospectEntityId)) {
        assessmentByEntityId.set(assessment.prospectEntityId, assessment);
      }
    }
    const entityIds = [...assessmentByEntityId.keys()];
    if (entityIds.length === 0) return [];

    const entityRequest = client
      .from("prospect_entities")
      .select("id,tenant_id,entity_kind,canonical_url,title,updated_at")
      .eq("tenant_id", tenantId)
      .in("id", entityIds)
      .order("updated_at", { ascending: false })
      .limit(100);
    const entityResult = await (entityRequest as unknown as Promise<{
      data: unknown[] | null;
      error: unknown;
    }>);

    if (entityResult.error) {
      logOptionalTargetingFailure("target entity lookup", entityResult.error);
      return [];
    }

    const evidenceByEntityId = new Map<string, TargetEvidenceView[]>();
    try {
      // A public-source evidence row intentionally stores only its immutable
      // source-post ID. This narrow RPC projects the retained post's exact
      // permalink after it has verified tenant membership, without making the
      // global source corpus (body, author, metadata) browser-readable.
      const evidenceResult = await client.rpc("list_prospect_evidence_for_profile", {
        target_profile_id: targetingProfileId,
      }) as {
        data: unknown[] | null;
        error: unknown;
      };

      if (evidenceResult.error) {
        logOptionalTargetingFailure("target evidence lookup", evidenceResult.error);
      } else {
        for (const value of evidenceResult.data ?? []) {
          const parsedEvidence = evidenceFromRow(value);
          if (!parsedEvidence || !assessmentByEntityId.has(parsedEvidence.prospectEntityId)) {
            continue;
          }
          const current = evidenceByEntityId.get(parsedEvidence.prospectEntityId) ?? [];
          current.push(parsedEvidence.evidence);
          evidenceByEntityId.set(parsedEvidence.prospectEntityId, current);
        }
      }
    } catch (error) {
      // Evidence is supplementary to a target's current assessment. A partial
      // rollout must not make a manually entered high-fit target disappear.
      logOptionalTargetingFailure("target evidence lookup", error);
    }

    return (entityResult.data ?? []).flatMap((value) => {
      const row = asRecord(value);
      const id = stringValue(row?.id);
      const kind = stringValue(row?.entity_kind);
      const assessment = id ? assessmentByEntityId.get(id) : null;
      if (
        !row ||
        stringValue(row.tenant_id) !== tenantId ||
        !id ||
        !kind ||
        !TARGET_ENTITY_KINDS.has(kind as ProspectTargetEntityKind) ||
        !assessment
      ) {
        return [];
      }

      const canonicalUrl = publicHttpUrl(row.canonical_url);
      const title = stringValue(row.title);
      const displayName = title ?? canonicalUrl ?? "Untitled target";
      return [{
        id,
        assessmentId: assessment.assessmentId,
        entityKind: kind as ProspectTargetEntityKind,
        displayName,
        subtitle: title && canonicalUrl ? canonicalUrl : null,
        canonicalUrl,
        assessmentState: assessment.state,
        assessmentReasons: assessment.reasons,
        assessedAt: assessment.assessedAt,
        evidence: evidenceByEntityId.get(id) ?? [],
      } satisfies ProspectTargetView];
    });
  } catch (error) {
    logOptionalTargetingFailure("target desk lookup", error);
    return [];
  }
}

/** Avoid widening the public data boundary just to satisfy a generic table. */
export type TargetingProfileRecord = Record<string, Json>;
