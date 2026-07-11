"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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

function crawlerTriggerEndpoint() {
  const explicit = process.env.ARCLI_CRAWLER_TRIGGER_URL?.trim();
  if (explicit) return explicit;

  const legacy = process.env.ARCLI_CRAWLER_INGEST_URL?.trim();
  if (legacy) return legacy;

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  return internalApiUrl ? `${internalApiUrl}/api/crawl/trigger` : null;
}

function embeddingTriggerEndpoint() {
  const explicit = process.env.ARCLI_PROFILE_EMBEDDING_TRIGGER_URL?.trim();
  if (explicit) return explicit;

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  return internalApiUrl
    ? `${internalApiUrl}/api/service-profile/embed/trigger`
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

async function postCrawlerTrigger(
  context: CrawlerTriggerContext,
  websiteUrl: string,
) {
  const endpoint = crawlerTriggerEndpoint();
  if (!endpoint) {
    console.warn("[ProspectDashboard] crawler trigger not configured", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
    return;
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[ProspectDashboard] crawler trigger secret missing", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${workerSecret}`,
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
      return;
    }

    console.info("[ProspectDashboard] crawler trigger posted", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
    });
  } catch (error) {
    console.warn("[ProspectDashboard] crawler trigger unavailable", {
      tenant_id: context.tenantId,
      website_url: websiteUrl,
      error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleCrawlerTrigger(context: TenantContext, websiteUrl: string) {
  const triggerContext: CrawlerTriggerContext = {
    tenantId: context.tenantId,
    userId: context.userId,
  };

  after(async () => {
    await postCrawlerTrigger(triggerContext, websiteUrl);
  });
}

async function postEmbeddingTrigger(
  context: EmbeddingTriggerContext,
  serviceProfileId: string | null,
) {
  const endpoint = embeddingTriggerEndpoint();
  if (!endpoint) {
    console.warn("[ProspectOnboarding] profile embedding trigger not configured", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return;
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[ProspectOnboarding] profile embedding trigger secret missing", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[ProspectOnboarding] profile embedding trigger failed", {
        tenant_id: context.tenantId,
        service_profile_id: serviceProfileId,
        status: response.status,
        body: text.slice(0, 500),
      });
      return;
    }

    console.info("[ProspectOnboarding] profile embedding trigger posted", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
  } catch (error) {
    console.warn("[ProspectOnboarding] profile embedding trigger unavailable", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
      error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleEmbeddingTrigger(
  context: TenantContext,
  serviceProfileId: string | null,
) {
  const triggerContext: EmbeddingTriggerContext = {
    tenantId: context.tenantId,
    userId: context.userId,
  };

  after(async () => {
    await postEmbeddingTrigger(triggerContext, serviceProfileId);
  });
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
    scheduleCrawlerTrigger(context, websiteUrl);

    revalidatePath("/dashboard");
    revalidatePath("/onboarding/workspace");
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
        scheduleEmbeddingTrigger(context, profileId);
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
