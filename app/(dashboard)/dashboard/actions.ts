"use server";

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

function workerEndpoint() {
  const explicit = process.env.ARCLI_CRAWLER_INGEST_URL?.trim();
  if (explicit) return explicit;

  const brainEndpoint = process.env.WORKSPACE_BRAIN_GENERATE_URL?.trim();
  if (brainEndpoint) return brainEndpoint;

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  return internalApiUrl
    ? `${internalApiUrl}/api/internal/workspace-brain/generate`
    : null;
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

async function callCrawlerWorker(context: TenantContext, websiteUrl: string) {
  const endpoint = workerEndpoint();
  if (!endpoint) return false;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (workerSecret) {
    headers.Authorization = `Bearer ${workerSecret}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      url: websiteUrl,
      requested_by: context.userId,
      source: "dashboard_onboarding",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn("[ProspectDashboard] crawler worker endpoint failed", {
      tenant_id: context.tenantId,
      status: response.status,
      body: text.slice(0, 500),
    });
    return false;
  }

  return true;
}

async function enqueueCrawlerJob(context: TenantContext, websiteUrl: string) {
  const queueTable =
    process.env.WEBSITE_CRAWL_QUEUE_TABLE?.trim() || "website_crawl_jobs";
  const now = new Date().toISOString();
  const payloads: DbRecord[] = [
    {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      url: websiteUrl,
      job_type: "service_profile_crawl",
      status: "queued",
      requested_by: context.userId,
      payload: {
        tenant_id: context.tenantId,
        website_url: websiteUrl,
        source: "dashboard_onboarding",
      },
      created_at: now,
      updated_at: now,
    },
    {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      status: "queued",
      payload: {
        tenant_id: context.tenantId,
        website_url: websiteUrl,
      },
      created_at: now,
    },
    {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      status: "queued",
      created_at: now,
    },
    {
      tenant_id: context.tenantId,
      url: websiteUrl,
      status: "queued",
      created_at: now,
    },
  ];

  let lastError: unknown = null;

  for (const payload of payloads) {
    const result = await context.supabase
      .from(queueTable)
      .insert(payload)
      .eq("tenant_id", context.tenantId)
      .select("tenant_id")
      .maybeSingle();

    if (!result.error) return true;
    lastError = result.error;
  }

  console.error("[ProspectDashboard] crawler queue insert failed", {
    tenant_id: context.tenantId,
    queue_table: queueTable,
    error: lastError,
  });

  return false;
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

    const calledWorker = await callCrawlerWorker(context, websiteUrl);
    const queuedJob = calledWorker
      ? true
      : await enqueueCrawlerJob(context, websiteUrl);

    if (!queuedJob) {
      return actionError("Website saved, but the crawler trigger is not configured.");
    }

    revalidatePath("/dashboard");
    return actionOk("Website submitted for profile extraction.");
  } catch (error) {
    console.error("[ProspectDashboard] website submission failed", {
      tenant_id: context.tenantId,
      error,
    });
    return actionError("Could not submit this website. Please try again.");
  }
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
  status: "draft" | "approved",
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
    approved_at: status === "approved" ? now : null,
  };

  const payloads: DbRecord[] = [];

  payloads.push({
    ...normalized,
    status,
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

  const status = intent === "approve" ? "approved" : "draft";
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
      return actionOk(
        intent === "approve"
          ? "Service profile approved."
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
