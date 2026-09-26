"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  TARGETING_BRIEF_LIMITS,
  TARGET_TYPES,
  normalizeSeedUrl,
  normalizeTargetingBriefInput,
  type TargetingBriefInput,
  type TargetType,
} from "@/lib/targeting-brief";
import { retainedPublicTargetMonitoringUiIsEnabled } from "@/lib/retained-public-monitoring-server";
import type { Json } from "@/types/supabase";
import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";

import type {
  ProspectActionResult,
  TargetFeedbackValue,
  TargetEvidenceReviewDecision,
} from "./prospect-types";

type TargetingRpcClient = {
  rpc: (
    functionName: string,
    arguments_: Record<string, Json>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

type ManualTargetInput = {
  entityKind: TargetType;
  canonicalUrl: string;
  title?: string;
};

const TARGETING_BRIEF_SCHEMA = z.object({
  targetTypes: z.array(z.enum(TARGET_TYPES)).min(1).max(TARGET_TYPES.length),
  idealCustomerTraits: z
    .array(z.string().trim().min(2).max(TARGETING_BRIEF_LIMITS.maxTextLength))
    .max(TARGETING_BRIEF_LIMITS.maxItemsPerField),
  changeTriggers: z
    .array(z.string().trim().min(2).max(TARGETING_BRIEF_LIMITS.maxTextLength))
    .max(TARGETING_BRIEF_LIMITS.maxItemsPerField),
  strongEvidenceDefinitions: z
    .array(z.string().trim().min(2).max(TARGETING_BRIEF_LIMITS.maxTextLength))
    .max(TARGETING_BRIEF_LIMITS.maxItemsPerField),
  exclusions: z
    .array(z.string().trim().min(2).max(TARGETING_BRIEF_LIMITS.maxTextLength))
    .max(TARGETING_BRIEF_LIMITS.maxItemsPerField),
  seedUrls: z
    .array(z.string().trim().min(1).max(TARGETING_BRIEF_LIMITS.maxSeedUrlLength))
    .max(TARGETING_BRIEF_LIMITS.maxItemsPerField),
}).strict();

const MANUAL_TARGET_SCHEMA = z.object({
  entityKind: z.enum(TARGET_TYPES),
  canonicalUrl: z.string().trim().min(1).max(TARGETING_BRIEF_LIMITS.maxSeedUrlLength),
  title: z.string().trim().max(240).optional(),
}).strict();

const EVIDENCE_REVIEW_SCHEMA = z.object({
  evidenceId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected"]),
}).strict();

const TARGET_FEEDBACK_SCHEMA = z.object({
  assessmentId: z.string().uuid(),
  feedback: z.enum(["target", "not_relevant", "contacted", "meeting", "won"]),
}).strict();

const TARGET_MONITORING_SCHEMA = z.object({
  assessmentId: z.string().uuid(),
  enabled: z.boolean(),
}).strict();

function actionError(message: string): ProspectActionResult {
  return { ok: false, message };
}

function actionOk(message: string): ProspectActionResult {
  return { ok: true, message };
}

async function requireTenant(): Promise<TenantContext | ProspectActionResult> {
  const result = await resolveTenantContext();
  if (!("response" in result)) return result.context;

  if (result.response.status === 401) {
    return actionError("Sign in again before updating targets.");
  }
  if (result.response.status === 202) {
    return actionError("Workspace setup is still finishing.");
  }
  return actionError("Workspace access could not be verified.");
}

function validServiceProfileId(value: string | null): string | null {
  const result = z.string().uuid().safeParse(value);
  return result.success ? result.data : null;
}

/**
 * A brief controls discovery scope. Saving it never starts a crawler or a
 * provider lookup: the user first sees the scope, then explicitly adds or
 * researches targets in later flows.
 */
export async function saveTargetingBrief(
  serviceProfileId: string | null,
  values: unknown,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const profileId = validServiceProfileId(serviceProfileId);
  if (!profileId) {
    return actionError("Finish preparing the website profile before saving targeting.");
  }

  const parsed = TARGETING_BRIEF_SCHEMA.safeParse(values);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Check the targeting brief and try again.",
    );
  }

  const normalized = normalizeTargetingBriefInput(parsed.data);
  if (normalized.targetTypes.length === 0) {
    return actionError("Choose at least one target type.");
  }

  const client = context.supabase as unknown as TargetingRpcClient;
  const result = await client.rpc("upsert_targeting_profile", {
    target_service_profile_id: profileId,
    target_types_input: normalized.targetTypes,
    ideal_customer_traits_input: normalized.idealCustomerTraits,
    change_triggers_input: normalized.changeTriggers,
    strong_evidence_definitions_input: normalized.strongEvidenceDefinitions,
    exclusions_input: normalized.exclusions,
    seed_urls_input: normalized.seedUrls,
  });

  if (result.error) {
    console.error("[TargetingBrief] save failed", {
      tenant_id: context.tenantId,
      service_profile_id: profileId,
      error: result.error,
    });
    return actionError(
      "Could not save targeting yet. Confirm the targeting database migration is deployed, then try again.",
    );
  }

  revalidatePath("/dashboard/brief");
  revalidatePath("/dashboard/targets");
  return actionOk("Targeting brief saved. Add a public target when you are ready to research it.");
}

/**
 * Normalise a public URL before it is stored as a manual target. Worker-side
 * fetch controls remain responsible for DNS/IP validation before any crawl;
 * this boundary rejects non-web URLs and credential-bearing links up front.
 */
function publicTargetUrl(value: string): string | null {
  const normalized = normalizeSeedUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function createManualProspectTarget(
  serviceProfileId: string | null,
  values: ManualTargetInput,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const profileId = validServiceProfileId(serviceProfileId);
  if (!profileId) {
    return actionError("Finish preparing the website profile before adding a target.");
  }

  const parsed = MANUAL_TARGET_SCHEMA.safeParse(values);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Check the public target and try again.",
    );
  }

  const canonicalUrl = publicTargetUrl(parsed.data.canonicalUrl);
  if (!canonicalUrl) {
    return actionError("Enter a public HTTP(S) URL without sign-in credentials.");
  }

  const client = context.supabase as unknown as TargetingRpcClient;
  const result = await client.rpc("create_manual_prospect_entity", {
    target_service_profile_id: profileId,
    entity_kind_input: parsed.data.entityKind,
    canonical_url_input: canonicalUrl,
    title_input: parsed.data.title?.trim() || null,
  });

  if (result.error) {
    console.error("[TargetDesk] manual target creation failed", {
      tenant_id: context.tenantId,
      service_profile_id: profileId,
      entity_kind: parsed.data.entityKind,
      error: result.error,
    });
    return actionError(
      "Could not add this target. Save an approved targeting brief that includes this target type, then try again.",
    );
  }

  revalidatePath("/dashboard/targets");
  return actionOk("Target added as a high-fit target. It has no buyer signal until cited evidence is collected.");
}

/**
 * Evidence review is a narrow terminal decision over a server-owned pending
 * observation. It never accepts target, tenant, profile, score, or source
 * values from the browser, so the database RPC remains the authority for both
 * tenancy and the assessment reconciliation it may trigger.
 */
export async function reviewProspectEvidence(
  evidenceId: string,
  decision: TargetEvidenceReviewDecision,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const parsed = EVIDENCE_REVIEW_SCHEMA.safeParse({ evidenceId, decision });
  if (!parsed.success) {
    return actionError("Choose a valid pending observation to review.");
  }

  const client = context.supabase as unknown as TargetingRpcClient;
  const result = await client.rpc("review_prospect_evidence", {
    target_evidence_id: parsed.data.evidenceId,
    decision_input: parsed.data.decision,
  });

  if (result.error) {
    console.error("[TargetDesk] evidence review failed", {
      tenant_id: context.tenantId,
      decision: parsed.data.decision,
      error: result.error,
    });
    return actionError(
      "Could not record this review. The observation may already have been reviewed; refresh and try again.",
    );
  }

  revalidatePath("/dashboard/targets");
  return parsed.data.decision === "accepted"
    ? actionOk("Evidence accepted. It can now inform this target's assessment.")
    : actionOk("Evidence rejected. It will not be used in this target's assessment.");
}

/**
 * Record a customer-owned target outcome without creating a lead, exporting a
 * CRM record, or changing the server-assessed target state. These events are
 * intentionally narrow inputs for later tenant-scoped calibration.
 */
export async function submitProspectTargetFeedback(
  assessmentId: string,
  feedback: TargetFeedbackValue,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const parsed = TARGET_FEEDBACK_SCHEMA.safeParse({ assessmentId, feedback });
  if (!parsed.success) {
    return actionError("Choose a valid target outcome to record.");
  }

  const client = context.supabase as unknown as TargetingRpcClient;
  const result = await client.rpc("submit_prospect_feedback", {
    target_assessment_id: parsed.data.assessmentId,
    feedback_type_input: parsed.data.feedback,
    reason_code_input: null,
  });
  if (result.error) {
    console.error("[TargetDesk] target feedback failed", {
      tenant_id: context.tenantId,
      feedback: parsed.data.feedback,
      error: result.error,
    });
    return actionError("Could not record that target outcome. Refresh and try again.");
  }

  revalidatePath("/dashboard/targets");
  switch (parsed.data.feedback) {
    case "target":
      return actionOk("Target outcome recorded. This does not create a lead or CRM record.");
    case "not_relevant":
      return actionOk("Not-relevant outcome recorded for future ranking review.");
    case "contacted":
      return actionOk("Contacted outcome recorded. No message was sent by Arcli.");
    case "meeting":
      return actionOk("Meeting outcome recorded for future ranking review.");
    case "won":
      return actionOk("Won outcome recorded for future ranking review.");
  }
}

/**
 * Explicitly opt one supported builder target into (or out of) low-frequency
 * retained-corpus monitoring. The action accepts no source, URL, handle,
 * query, cadence, tenant, or profile data, and it cannot create a lead,
 * outreach, or CRM record.
 */
export async function setProspectTargetMonitoring(
  assessmentId: string,
  enabled: boolean,
): Promise<ProspectActionResult> {
  if (!retainedPublicTargetMonitoringUiIsEnabled()) {
    return actionError("Target monitoring is not available until its evidence worker is deployed.");
  }

  const context = await requireTenant();
  if ("ok" in context) return context;

  const parsed = TARGET_MONITORING_SCHEMA.safeParse({ assessmentId, enabled });
  if (!parsed.success) {
    return actionError("Choose a valid target before changing monitoring.");
  }

  const client = context.supabase as unknown as TargetingRpcClient;
  const result = await client.rpc("set_prospect_target_monitoring", {
    target_assessment_id: parsed.data.assessmentId,
    enabled_input: parsed.data.enabled,
  });
  if (result.error) {
    console.error("[TargetDesk] target monitoring update failed", {
      tenant_id: context.tenantId,
      enabled: parsed.data.enabled,
      error: result.error,
    });
    return actionError(
      "Could not update target monitoring. This target may not support retained-public monitoring yet.",
    );
  }

  revalidatePath("/dashboard/targets");
  return parsed.data.enabled
    ? actionOk(
        "Target monitoring is on. Arcli will only recheck retained public records at its exact supported profile locator; it cannot create a lead, outreach, or CRM record.",
      )
    : actionOk("Target monitoring is off. No future retained-record checks will be scheduled.");
}
