"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  entityCandidateGenerationUiIsEnabled,
  retainedPublicEvidenceResearchUiIsEnabled,
} from "@/lib/entity-research-server";
import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";

import type { ProspectActionResult } from "./prospect-types";

const UUID_SCHEMA = z.string().uuid();
const ENTITY_RESEARCH_TIMEOUT_MS = 10_000;
const ENTITY_RESEARCH_RETRY_WINDOW_MS = 5 * 60 * 1_000;
const MAX_EVIDENCE_RESEARCH_TARGETS = 25;

const ACTIVE_TARGET_STATES = [
  "high_fit",
  "triggered",
  "signal_backed",
  "strong_buyer_signal",
] as const;

type DbRecord = Record<string, unknown>;
type EntityResearchKind = "candidate_generation" | "evidence_collection";

type TargetingScopeQuery = {
  eq: (column: string, value: string) => TargetingScopeQuery;
  order: (column: string, options: { ascending: boolean }) => TargetingScopeQuery;
  limit: (count: number) => TargetingScopeQuery;
  maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
};

type EligibleTargetQuery = {
  eq: (column: string, value: string) => EligibleTargetQuery;
  in: (column: string, values: readonly string[]) => EligibleTargetQuery;
  order: (column: string, options: { ascending: boolean }) => EligibleTargetQuery;
  limit: (count: number) => Promise<{ data: unknown[] | null; error: unknown }>;
};

type EntityResearchReadClient = {
  from: (table: string) => {
    select: (columns: string) => TargetingScopeQuery | EligibleTargetQuery;
  };
};

type ApprovedTargetingScope = {
  targetingProfileId: string;
  serviceProfileId: string;
  profileVersion: number;
  seedCount: number;
};

type WorkerAcknowledgement = {
  status?: unknown;
  created?: unknown;
};

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
    return actionError("Sign in again before starting target research.");
  }
  if (result.response.status === 202) {
    return actionError("Workspace setup is still finishing.");
  }
  return actionError("Workspace access could not be verified.");
}

function record(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DbRecord)
    : null;
}

function uuid(value: unknown): string | null {
  const result = UUID_SCHEMA.safeParse(value);
  return result.success ? result.data : null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function seedUrlCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => typeof item === "string" && item.trim()).length;
}

function errorCode(error: unknown): string | null {
  const value = record(error)?.code;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolve the approved target scope immediately before each handoff. Browser
 * callers never supply tenant, service profile, target profile, seed URL, or
 * any generation criteria.
 */
async function loadApprovedTargetingScope(
  context: TenantContext,
): Promise<ApprovedTargetingScope | null> {
  const client = context.supabase as unknown as EntityResearchReadClient;
  const query = client
    .from("targeting_profiles")
    .select("id,tenant_id,service_profile_id,profile_version,approval_status,seed_urls") as TargetingScopeQuery;
  const result = await query
    .eq("tenant_id", context.tenantId)
    .eq("approval_status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<DbRecord>();

  if (result.error) {
    console.warn("[EntityResearch] approved targeting scope lookup failed", {
      tenant_id: context.tenantId,
      error_code: errorCode(result.error),
    });
    return null;
  }

  const row = record(result.data);
  const targetingProfileId = uuid(row?.id);
  const serviceProfileId = uuid(row?.service_profile_id);
  const profileVersion = positiveInteger(row?.profile_version);
  if (
    !row ||
    row.tenant_id !== context.tenantId ||
    row.approval_status !== "approved" ||
    !targetingProfileId ||
    !serviceProfileId ||
    !profileVersion
  ) {
    return null;
  }

  return {
    targetingProfileId,
    serviceProfileId,
    profileVersion,
    seedCount: seedUrlCount(row.seed_urls),
  };
}

/**
 * Pick the bounded target set on the server. The action accepts no target IDs,
 * allowing the worker's lifecycle checks to remain the final authority while
 * preventing a browser from researching another tenant's target by ID.
 */
async function loadEligibleEvidenceTargetIds(
  context: TenantContext,
  targetingProfileId: string,
): Promise<string[] | null> {
  const client = context.supabase as unknown as EntityResearchReadClient;
  const query = client
    .from("prospect_assessments")
    .select("tenant_id,targeting_profile_id,prospect_entity_id") as EligibleTargetQuery;
  const result = await query
    .eq("tenant_id", context.tenantId)
    .eq("targeting_profile_id", targetingProfileId)
    .in("assessment_state", ACTIVE_TARGET_STATES)
    .order("last_assessed_at", { ascending: false })
    .limit(MAX_EVIDENCE_RESEARCH_TARGETS);

  if (result.error) {
    console.warn("[EntityResearch] evidence target scope lookup failed", {
      tenant_id: context.tenantId,
      error_code: errorCode(result.error),
    });
    return null;
  }

  const ids = new Set<string>();
  for (const value of result.data ?? []) {
    const row = record(value);
    if (
      row?.tenant_id === context.tenantId &&
      row.targeting_profile_id === targetingProfileId
    ) {
      const entityId = uuid(row.prospect_entity_id);
      if (entityId) ids.add(entityId);
    }
  }
  return [...ids].slice(0, MAX_EVIDENCE_RESEARCH_TARGETS);
}

function joinBackendPath(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }
  return `${base}${normalizedPath}`;
}

function triggerEndpoints(kind: EntityResearchKind): string[] {
  const explicit =
    kind === "candidate_generation"
      ? process.env.ARCLI_ENTITY_CANDIDATE_GENERATION_TRIGGER_URL?.trim()
      : process.env.ARCLI_RETAINED_PUBLIC_EVIDENCE_TRIGGER_URL?.trim();
  const path =
    kind === "candidate_generation"
      ? "/api/prospecting/candidate-generation/trigger"
      : "/api/prospecting/evidence-collection/trigger";
  const bases = [
    process.env.ARCLI_WORKER_API_URL?.trim(),
    process.env.PYTHON_BACKEND_URL?.trim(),
    process.env.INTERNAL_API_URL?.trim(),
    process.env.BACKEND_API_URL?.trim(),
  ];

  return Array.from(
    new Set(
      [
        explicit,
        ...bases.map((base) => (base ? joinBackendPath(base, path) : null)),
      ].filter((endpoint): endpoint is string => Boolean(endpoint)),
    ),
  );
}

/**
 * A deterministic, short retry window makes browser/network retries resolve
 * to one durable backend run, while a later explicit customer request remains
 * eligible for the worker's normal tenant quota. Scope material is entirely
 * server-resolved; entity IDs are opaque inputs only to this digest.
 */
function requestIdempotencyKey(
  context: TenantContext,
  kind: EntityResearchKind,
  scope: ApprovedTargetingScope,
  targetIds: readonly string[] = [],
): string {
  const retryWindow = Math.floor(Date.now() / ENTITY_RESEARCH_RETRY_WINDOW_MS);
  const material = [
    "entity-research-dashboard-v1",
    kind,
    context.tenantId,
    context.userId,
    scope.serviceProfileId,
    scope.targetingProfileId,
    String(scope.profileVersion),
    String(retryWindow),
    ...[...targetIds].sort(),
  ].join("\x1f");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function handoffMessage(kind: EntityResearchKind, acknowledgement: WorkerAcknowledgement | null) {
  const created = acknowledgement?.created === true;
  const status = acknowledgement?.status;
  const isTerminal = status === "terminal";

  if (kind === "candidate_generation") {
    if (isTerminal) {
      return actionOk("The latest target-generation run has already finished. Refresh to review any new targets.");
    }
    return actionOk(
      created
        ? "Target generation is queued from your approved official-site seeds. It creates research targets, not leads or outreach."
        : "That target-generation request is already queued or running. Refresh for its current status.",
    );
  }

  if (isTerminal) {
    return actionOk("The latest evidence-research run has already finished. Refresh to review any pending evidence.");
  }
  return actionOk(
    created
      ? "Retained-public evidence research is queued. It can add pending cited observations for review, never a lead or outreach."
      : "That evidence-research request is already queued or running. Refresh for its current status.",
  );
}

async function postEntityResearchTrigger(
  context: TenantContext,
  kind: EntityResearchKind,
  scope: ApprovedTargetingScope,
  targetIds: readonly string[] = [],
): Promise<ProspectActionResult> {
  const endpoints = triggerEndpoints(kind);
  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (endpoints.length === 0 || !workerSecret) {
    console.warn("[EntityResearch] trusted worker handoff is not configured", {
      tenant_id: context.tenantId,
      operation: kind,
      endpoint_configured: endpoints.length > 0,
      secret_configured: Boolean(workerSecret),
    });
    return actionError("Target research is not deployed for this workspace yet.");
  }

  const idempotencyKey = requestIdempotencyKey(context, kind, scope, targetIds);
  const body =
    kind === "candidate_generation"
      ? {
          tenant_id: context.tenantId,
          service_profile_id: scope.serviceProfileId,
          requested_by: context.userId,
          source: "dashboard_entity_research",
        }
      : {
          tenant_id: context.tenantId,
          service_profile_id: scope.serviceProfileId,
          prospect_entity_ids: targetIds,
        };
  const deadline = Date.now() + ENTITY_RESEARCH_TIMEOUT_MS;
  let sawNotFound = false;

  for (const endpoint of endpoints) {
    const timeoutMs = Math.min(5_000, deadline - Date.now());
    if (timeoutMs <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerSecret}`,
          "Idempotency-Key": idempotencyKey,
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const acknowledgement = (await response.json().catch(() => null)) as
          | WorkerAcknowledgement
          | null;
        console.info("[EntityResearch] trusted worker handoff accepted", {
          tenant_id: context.tenantId,
          service_profile_id: scope.serviceProfileId,
          operation: kind,
          created: acknowledgement?.created === true,
          status: typeof acknowledgement?.status === "string" ? acknowledgement.status : null,
        });
        return handoffMessage(kind, acknowledgement);
      }

      // Do not log response bodies: even an upstream error must not become a
      // new source-content or URL disclosure channel.
      console.warn("[EntityResearch] trusted worker handoff rejected", {
        tenant_id: context.tenantId,
        service_profile_id: scope.serviceProfileId,
        operation: kind,
        status: response.status,
      });
      if (response.status === 404) {
        sawNotFound = true;
        continue;
      }
      if (response.status === 429) {
        return actionError("Target research is temporarily rate limited. Try again later.");
      }
      if (response.status === 409) {
        return actionError("Your approved targeting changed. Refresh this page and try again.");
      }
      return actionError("The target-research worker did not accept this request. Try again shortly.");
    } catch (error) {
      console.warn("[EntityResearch] trusted worker handoff unavailable", {
        tenant_id: context.tenantId,
        service_profile_id: scope.serviceProfileId,
        operation: kind,
        error_type: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (sawNotFound) {
    return actionError("Target research is not enabled on the worker deployment yet.");
  }
  return actionError("The target-research worker is unavailable. The target list was not changed.");
}

/**
 * Start one bounded official-site candidate-generation run. Scope, seeds, and
 * criteria are resolved from the current approved brief; the browser supplies
 * no URLs, provider filters, tenant, or profile identifiers.
 */
export async function requestEntityCandidateGeneration(): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;
  if (!entityCandidateGenerationUiIsEnabled()) {
    return actionError("Target generation is not available until its worker is deployed.");
  }

  const scope = await loadApprovedTargetingScope(context);
  if (!scope) {
    return actionError("Save an approved targeting brief before generating targets.");
  }
  if (scope.seedCount === 0) {
    return actionError("Add at least one approved official-site seed before generating targets.");
  }

  const result = await postEntityResearchTrigger(context, "candidate_generation", scope);
  if (result.ok) revalidatePath("/dashboard/targets");
  return result;
}

/**
 * Start retained-public evidence research for the server-selected, bounded
 * active target set. This never fetches a profile or comment history and can
 * only produce human-reviewable pending evidence.
 */
export async function requestRetainedPublicEvidenceResearch(): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;
  if (!retainedPublicEvidenceResearchUiIsEnabled()) {
    return actionError("Evidence research is not available until its worker is deployed.");
  }

  const scope = await loadApprovedTargetingScope(context);
  if (!scope) {
    return actionError("Save an approved targeting brief before researching evidence.");
  }
  const targetIds = await loadEligibleEvidenceTargetIds(context, scope.targetingProfileId);
  if (targetIds === null) {
    return actionError("Could not load the current target set. Refresh and try again.");
  }
  if (targetIds.length === 0) {
    return actionError("Add or generate a non-rejected target before researching evidence.");
  }

  const result = await postEntityResearchTrigger(
    context,
    "evidence_collection",
    scope,
    targetIds,
  );
  if (result.ok) revalidatePath("/dashboard/targets");
  return result;
}
