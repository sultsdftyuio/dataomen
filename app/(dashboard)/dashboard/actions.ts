"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/types/supabase";
import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";
import {
  FEEDBACK_OPTIONS,
  type LeadFeedbackValue,
  type ProspectActionResult,
} from "./prospect-types";

type DbRecord = Record<string, Json>;
type CrawlerTriggerContext = Pick<TenantContext, "tenantId" | "userId">;
type EmbeddingTriggerContext = Pick<TenantContext, "tenantId" | "userId">;

type CrawlerTriggerResponse = {
  pass1_status?: "completed" | "skipped" | "failed";
  service_profile_id?: string | null;
};

type UntypedSupabase = {
  from: (table: string) => {
    upsert: (
      payload: DbRecord,
      options?: { onConflict?: string },
    ) => {
      select: (columns: string) => {
        maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
      };
    };
    update: (payload: DbRecord) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
        };
      };
    };
  };
};

const SERVICE_PROFILE_SCHEMA = z.object({
  target_audience: z.array(z.string().trim().min(1)).default([]),
  core_problem: z.string().trim().default(""),
  unique_value_prop: z.string().trim().default(""),
  use_cases: z.array(z.string().trim().min(1)).default([]),
  pain_points: z.array(z.string().trim().min(1)).default([]),
  buying_triggers: z.array(z.string().trim().min(1)).default([]),
  negative_keywords: z.array(z.string().trim().min(1)).default([]),
  excluded_audiences: z.array(z.string().trim().min(1)).default([]),
});

const FEEDBACK_VALUES = new Set(FEEDBACK_OPTIONS.map((option) => option.value));

function actionError(message: string): ProspectActionResult {
  return { ok: false, message };
}

function actionOk(message: string): ProspectActionResult {
  return { ok: true, message };
}

async function requireTenant(): Promise<TenantContext | ProspectActionResult> {
  const tenantResult = await resolveTenantContext();

  if (!("response" in tenantResult)) {
    return tenantResult.context;
  }

  if (tenantResult.response.status === 401) {
    return actionError("Sign in again before updating this workspace.");
  }

  if (tenantResult.response.status === 202) {
    return actionError("Workspace setup is still finishing.");
  }

  return actionError("Workspace access could not be verified.");
}

function normalizeWebsiteUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Website URL is required.");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Website URL is required.");
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Enter a valid website URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

function crawlJobId(tenantId: string, websiteUrl: string) {
  return createHash("sha256")
    .update(`${tenantId}:${websiteUrl}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

async function upsertCrawlJobStatus(
  context: TenantContext,
  websiteUrl: string,
  payload: DbRecord,
) {
  const now = new Date().toISOString();
  const client = context.supabase as unknown as UntypedSupabase;
  const result = await client
    .from("crawl_jobs")
    .upsert(
      {
        id: crawlJobId(context.tenantId, websiteUrl),
        tenant_id: context.tenantId,
        website_url: websiteUrl,
        last_heartbeat_at: now,
        updated_at: now,
        ...payload,
      },
      { onConflict: "id" },
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (result.error) {
    console.warn("[ProspectDashboard] crawl job status update skipped", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      error: result.error,
    });
  }
}

async function markCrawlTriggerFailed(
  context: TenantContext,
  websiteUrl: string,
  reason: string,
  detail?: unknown,
) {
  const detailContext: Record<string, Json> = { source: "dashboard_onboarding" };
  if (detail && typeof detail === "object" && !(detail instanceof Error)) {
    detailContext.detail = JSON.parse(JSON.stringify(detail)) as Json;
  }

  await upsertCrawlJobStatus(context, websiteUrl, {
    status: "failed",
    phase: "trigger_failed",
    failure_reason: reason,
    error_type:
      detail instanceof Error
        ? detail.name
        : typeof detail === "string"
          ? "TriggerError"
          : "CrawlerTriggerError",
    error_message:
      detail instanceof Error
        ? detail.message
        : typeof detail === "string"
          ? detail
          : "Crawler trigger could not be accepted.",
    error_context: detailContext,
  });
}

async function latestServiceProfileId(context: TenantContext) {
  let result = await context.supabase
    .from("service_profiles")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string | null }>();

  if (result.error) {
    result = await context.supabase
      .from("service_profiles")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .limit(1)
      .maybeSingle<{ id: string | null }>();
  }

  if (result.error) {
    console.warn("[ProspectDashboard] manual profile lookup skipped", {
      tenant_id: context.tenantId,
      error: result.error,
    });
    return null;
  }

  return result.data?.id ?? null;
}

function crawlerTriggerEndpoint() {
  const explicit = process.env.ARCLI_CRAWLER_TRIGGER_URL?.trim();
  if (explicit) return explicit;

  const legacy = process.env.ARCLI_CRAWLER_INGEST_URL?.trim();
  if (legacy) return legacy;

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  return internalApiUrl ? `${internalApiUrl}/api/crawl/trigger` : null;
}

function joinBackendPath(baseUrl: string, path: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
}

function embeddingTriggerEndpoints() {
  const explicit = process.env.ARCLI_PROFILE_EMBEDDING_TRIGGER_URL?.trim();
  const workerApiUrls = [
    process.env.ARCLI_WORKER_API_URL?.trim(),
    process.env.PYTHON_BACKEND_URL?.trim(),
    process.env.INTERNAL_API_URL?.trim(),
  ];

  return Array.from(
    new Set(
      [
        explicit,
        ...workerApiUrls.map((baseUrl) =>
          baseUrl
            ? joinBackendPath(baseUrl, "/api/service-profile/embed/trigger")
            : null,
        ),
      ].filter((endpoint): endpoint is string => Boolean(endpoint)),
    ),
  );
}

async function persistWebsiteUrl(context: TenantContext, websiteUrl: string) {
  const updateResult = await context.supabase
    .from("tenant_settings")
    .update({
      website_url: websiteUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", context.tenantId)
    .select("tenant_id")
    .maybeSingle();

  if (updateResult.error) {
    throw updateResult.error;
  }

  if (updateResult.data) {
    return;
  }

  const insertResult = await context.supabase
    .from("tenant_settings")
    .insert({
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", context.tenantId)
    .select("tenant_id")
    .maybeSingle();

  if (insertResult.error) {
    throw insertResult.error;
  }
}

async function postCrawlerTrigger(
  context: CrawlerTriggerContext,
  websiteUrl: string,
): Promise<ProspectActionResult> {
  const endpoint = crawlerTriggerEndpoint();
  if (!endpoint) {
    console.warn("[ProspectDashboard] crawler trigger not configured", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
    return actionError("Crawler queue is not configured.");
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[ProspectDashboard] crawler trigger secret missing", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
    return actionError("Crawler queue credentials are missing.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${workerSecret}`,
    "Idempotency-Key": crawlJobId(context.tenantId, websiteUrl),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        tenant_id: context.tenantId,
        website_url: websiteUrl,
        requested_by: context.userId,
        source: "dashboard_onboarding",
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[ProspectDashboard] crawler trigger endpoint failed", {
        tenant_id: context.tenantId,
        website_url: websiteUrl,
        status: response.status,
        body: text.slice(0, 500),
      });
      return actionError(
        `Crawler queue rejected the request with HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | CrawlerTriggerResponse
      | null;

    console.info("[ProspectDashboard] crawler trigger posted", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
    return actionOk(
      payload?.pass1_status === "completed"
        ? "Your initial service profile is ready. Arcli is refining it in the background."
        : "Website crawl queued. We are extracting your profile now.",
    );
  } catch (error) {
    console.warn("[ProspectDashboard] crawler trigger unavailable", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      error,
    });
    return actionError(
      error instanceof Error
        ? `Crawler queue is unavailable: ${error.message}`
        : "Crawler queue is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function postEmbeddingTrigger(
  context: EmbeddingTriggerContext,
  serviceProfileId: string | null,
): Promise<ProspectActionResult> {
  const endpoints = embeddingTriggerEndpoints();
  if (endpoints.length === 0) {
    console.warn("[ProspectOnboarding] profile embedding trigger not configured", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return actionError("Embedding worker endpoint is not configured.");
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[ProspectOnboarding] profile embedding trigger secret missing", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return actionError("Embedding worker credentials are missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let lastUnavailableError: unknown = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${workerSecret}`,
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            tenant_id: context.tenantId,
            service_profile_id: serviceProfileId,
            requested_by: context.userId,
            source: "onboarding_profile_approval",
          }),
        });

        if (response.ok) {
          console.info("[ProspectOnboarding] profile embedding trigger posted", {
            tenant_id: context.tenantId,
            service_profile_id: serviceProfileId,
            endpoint,
          });
          return actionOk("Embedding job queued.");
        }

        const text = await response.text().catch(() => "");
        console.warn("[ProspectOnboarding] profile embedding trigger failed", {
          tenant_id: context.tenantId,
          service_profile_id: serviceProfileId,
          endpoint,
          status: response.status,
          body: text.slice(0, 500),
        });
        if (response.status !== 404) {
          return actionError(
            `Embedding queue rejected the request with HTTP ${response.status}.`,
          );
        }
      } catch (error) {
        lastUnavailableError = error;
        console.warn("[ProspectOnboarding] profile embedding trigger unavailable", {
          tenant_id: context.tenantId,
          service_profile_id: serviceProfileId,
          endpoint,
          error,
        });
      }
    }

    if (!lastUnavailableError) {
      return actionError("Embedding worker endpoint returned HTTP 404.");
    }

    return actionError(
      lastUnavailableError instanceof Error
        ? `Embedding queue is unavailable: ${lastUnavailableError.message}`
        : "Embedding queue is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function retryServiceProfileEmbedding(
  serviceProfileId: string | null,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  if (!serviceProfileId) {
    return actionError("This service profile is no longer available to retry.");
  }

  const result = await postEmbeddingTrigger(
    {
      tenantId: context.tenantId,
      userId: context.userId,
    },
    serviceProfileId,
  );

  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/onboarding/workspace");
  }

  return result;
}

export async function submitWebsiteForCrawl(
  formData: FormData,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(formData.get("website_url"));
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Invalid URL.");
  }

  try {
    await persistWebsiteUrl(context, websiteUrl);

    const triggerResult = await postCrawlerTrigger(
      {
        tenantId: context.tenantId,
        userId: context.userId,
      },
      websiteUrl,
    );

    if (!triggerResult.ok) {
      await markCrawlTriggerFailed(
        context,
        websiteUrl,
        "trigger_unavailable",
        triggerResult.message,
      );
      revalidatePath("/dashboard");
      revalidatePath("/onboarding/workspace");
      return triggerResult;
    }

    revalidatePath("/dashboard");
    revalidatePath("/onboarding/workspace");
    return actionOk("Website crawl queued. We are extracting your profile now.");
  } catch (error) {
    console.error("[ProspectDashboard] website submission failed", {
      tenant_id: context.tenantId,
      error,
    });
    return actionError("Could not submit this website. Please try again.");
  }
}

export async function createManualServiceProfile(
  formData: FormData,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(formData.get("website_url"));
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Invalid URL.");
  }

  try {
    await persistWebsiteUrl(context, websiteUrl);
  } catch (error) {
    console.error("[ProspectDashboard] manual profile website save failed", {
      tenant_id: context.tenantId,
      error,
    });
    return actionError("Could not save this website before manual setup.");
  }

  const values = SERVICE_PROFILE_SCHEMA.parse({});
  const existingProfileId = await latestServiceProfileId(context);
  let lastError: unknown = null;

  for (const payload of updatePayloads(values, "pending_review")) {
    const profilePayload = {
      ...payload,
      website_url: websiteUrl,
      extraction_status: "manual_entry",
    };
    const query = existingProfileId
      ? context.supabase
          .from("service_profiles")
          .update(profilePayload)
          .eq("tenant_id", context.tenantId)
          .eq("id", existingProfileId)
      : context.supabase
          .from("service_profiles")
          .insert({ ...profilePayload, tenant_id: context.tenantId });
    const result = await query.select("tenant_id").maybeSingle();

    if (!result.error && (result.data || !existingProfileId)) {
      await upsertCrawlJobStatus(context, websiteUrl, {
        status: "failed",
        phase: "manual_entry",
        failure_reason: "manual_profile_requested",
        error_type: null,
        error_message: null,
        error_context: { source: "dashboard_onboarding" },
      });
      revalidatePath("/dashboard");
      revalidatePath("/onboarding/workspace");
      return actionOk("Manual profile created. Fill in the matching brief below.");
    }

    lastError = result.error;
  }

  console.error("[ProspectDashboard] manual service profile insert failed", {
    tenant_id: context.tenantId,
    website_url: websiteUrl,
    error: lastError,
  });
  return actionError("Could not create a manual profile.");
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values.reduce<string[]>((items, value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      items.push(normalized);
    }

    return items;
  }, []);
}

function updatePayloads(
  values: z.infer<typeof SERVICE_PROFILE_SCHEMA>,
  status: "pending_review" | "approved",
) {
  const normalized = {
    target_audience: normalizeList(values.target_audience),
    core_problem: values.core_problem,
    unique_value_prop: values.unique_value_prop,
    use_cases: normalizeList(values.use_cases),
    pain_points: normalizeList(values.pain_points),
    buying_triggers: normalizeList(values.buying_triggers),
    negative_keywords: normalizeList(values.negative_keywords),
    excluded_audiences: normalizeList(values.excluded_audiences),
  };
  const now = new Date().toISOString();
  const profileJson = {
    ...normalized,
    core_problem_solved: normalized.core_problem,
    key_value_propositions: normalized.unique_value_prop
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    ideal_customer_pain_points: normalized.pain_points,
    review_status: status,
    status,
    extraction_status: "completed",
    ...(status === "approved" ? { embedding_status: "pending" } : {}),
    approved_at: status === "approved" ? now : null,
  };

  const payloads: DbRecord[] = [];

  payloads.push({
    ...normalized,
    status,
    ...(status === "approved" ? { embedding_status: "pending" } : {}),
    updated_at: now,
  });
  payloads.push({
    profile_json: profileJson,
    status,
    updated_at: now,
  });
  payloads.push({
    profile: profileJson,
    status,
    updated_at: now,
  });
  payloads.push({
    data: profileJson,
    status,
    updated_at: now,
  });
  payloads.push({
    profile_json: profileJson,
  });
  payloads.push({
    profile: profileJson,
  });

  return payloads;
}

export async function saveServiceProfile(
  profileId: string | null,
  hasProfile: boolean,
  values: unknown,
  intent: "save" | "approve" = "save",
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const parsed = SERVICE_PROFILE_SCHEMA.safeParse(values);
  if (!parsed.success) {
    return actionError("Check the service profile fields and try again.");
  }

  const status = intent === "approve" ? "approved" : "pending_review";
  let lastError: unknown = null;

  for (const payload of updatePayloads(parsed.data, status)) {
    const query = hasProfile
      ? context.supabase
          .from("service_profiles")
          .update(payload)
          .eq("tenant_id", context.tenantId)
      : context.supabase
          .from("service_profiles")
          .insert({ ...payload, tenant_id: context.tenantId })
          .eq("tenant_id", context.tenantId);

    const scopedQuery = profileId && hasProfile ? query.eq("id", profileId) : query;
    const result = await scopedQuery.select("tenant_id").maybeSingle();

    if (!result.error && (result.data || !hasProfile)) {
      revalidatePath("/dashboard");
      revalidatePath("/onboarding/workspace");
      if (intent === "approve") {
        const triggerResult = await postEmbeddingTrigger(
          {
            tenantId: context.tenantId,
            userId: context.userId,
          },
          profileId,
        );
        if (!triggerResult.ok) return triggerResult;
      }
      return actionOk(
        intent === "approve"
          ? "Service profile approved. Activation is warming up."
          : "Service profile saved.",
      );
    }

    lastError = result.error;
  }

  console.error("[ProspectDashboard] service profile save failed", {
    tenant_id: context.tenantId,
    profile_id: profileId,
    intent,
    error: lastError,
  });

  return actionError("Could not save the service profile.");
}

export async function submitLeadFeedback(
  leadMatchId: string,
  feedback: string,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const normalizedFeedback = feedback.trim();
  if (!FEEDBACK_VALUES.has(normalizedFeedback as LeadFeedbackValue)) {
    return actionError("Unsupported feedback value.");
  }

  const { data: lead, error: leadError } = await context.supabase
    .from("lead_matches")
    .select("id, tenant_id")
    .eq("tenant_id", context.tenantId)
    .eq("id", leadMatchId)
    .maybeSingle();

  if (leadError || !lead) {
    console.warn("[ProspectDashboard] feedback rejected for missing lead", {
      tenant_id: context.tenantId,
      lead_match_id: leadMatchId,
      error: leadError,
    });
    return actionError("This lead is no longer available.");
  }

  const now = new Date().toISOString();
  const payloads: DbRecord[] = [
    {
      tenant_id: context.tenantId,
      lead_match_id: leadMatchId,
      feedback_type: normalizedFeedback,
      user_id: context.userId,
      created_at: now,
    },
    {
      tenant_id: context.tenantId,
      lead_match_id: leadMatchId,
      feedback_type: normalizedFeedback,
      created_by: context.userId,
      created_at: now,
    },
    {
      tenant_id: context.tenantId,
      lead_match_id: leadMatchId,
      feedback: normalizedFeedback,
      user_id: context.userId,
      created_at: now,
    },
  ];

  let lastError: unknown = null;

  for (const payload of payloads) {
    const result = await context.supabase
      .from("lead_feedback")
      .insert(payload)
      .eq("tenant_id", context.tenantId)
      .select("tenant_id")
      .maybeSingle();

    if (!result.error) {
      revalidatePath("/dashboard");
      return actionOk("Feedback saved.");
    }

    lastError = result.error;
  }

  console.error("[ProspectDashboard] lead feedback insert failed", {
    tenant_id: context.tenantId,
    lead_match_id: leadMatchId,
    feedback: normalizedFeedback,
    error: lastError,
  });

  return actionError("Could not save feedback.");
}
