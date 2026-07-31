"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DISCOVERY_QUERY_TYPES,
  discoveryQueryPlanValidationError,
} from "@/lib/discovery-queries";
import type { Json } from "@/types/supabase";
import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";
import {
  FEEDBACK_OPTIONS,
  type LeadFeedbackValue,
  type ProspectActionResult,
  type WatchlistCreateInput,
} from "./prospect-types";

type DbRecord = Record<string, Json>;
type CrawlerTriggerContext = Pick<TenantContext, "tenantId" | "userId">;
type EmbeddingTriggerContext = Pick<TenantContext, "tenantId" | "userId">;
type BuyerLanguageResearchTriggerContext = Pick<TenantContext, "tenantId" | "userId">;

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
  urgency_signals: z.array(z.string().trim().min(1)).default([]),
  discovery_queries: z
    .array(
      z
        .object({
          query_type: z.enum(DISCOVERY_QUERY_TYPES),
          phrase: z.string().trim().min(1),
        })
        .strict(),
    )
    .max(DISCOVERY_QUERY_TYPES.length)
    .default([])
    .superRefine((queries, context) => {
      const issue = discoveryQueryPlanValidationError(queries);
      if (issue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue,
        });
      }
    }),
  search_terms: z.array(z.string().trim().min(1)).max(6).default([]),
  negative_keywords: z.array(z.string().trim().min(1)).default([]),
  excluded_audiences: z.array(z.string().trim().min(1)).default([]),
});

const WATCHLIST_SOURCES = [
  "hackernews",
  "bluesky",
  "lemmy",
  "stackexchange",
  "github",
  "x",
] as const;

const WATCHLIST_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
  targetBuyer: z.string().trim().min(3).max(500),
  problemToSolve: z.string().trim().min(3).max(700),
  includeTerms: z.array(z.string().trim().min(2).max(180)).max(6).default([]),
  excludeTerms: z.array(z.string().trim().min(2).max(180)).max(12).default([]),
  sourcePreferences: z
    .array(z.enum(WATCHLIST_SOURCES))
    .min(1)
    .max(WATCHLIST_SOURCES.length),
  suggestedPlaces: z.array(z.string().trim().min(2).max(250)).max(12).default([]),
});

const FEEDBACK_VALUES = new Set(FEEDBACK_OPTIONS.map((option) => option.value));

// Keep older browser tabs from failing after the feedback contract moved from
// vague lead labels to calibrated matching-brief signals. All persistence is
// canonical, tenant-scoped, and reviewed by a human before any profile edit.
const LEGACY_FEEDBACK_ALIASES: Record<string, LeadFeedbackValue> = {
  good_lead: "good_fit",
  bad_lead: "not_relevant",
  wrong_audience: "wrong_buyer",
};

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

async function latestApprovedServiceProfileId(context: TenantContext) {
  const result = await context.supabase
    .from("service_profiles")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string | null }>();
  if (result.error) {
    console.warn("[Watchlists] approved profile lookup failed", {
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

function buyerLanguageResearchTriggerEndpoints() {
  const explicit = process.env.ARCLI_BUYER_LANGUAGE_RESEARCH_TRIGGER_URL?.trim();
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
            ? joinBackendPath(baseUrl, "/api/buyer-language-research/trigger")
            : null,
        ),
      ].filter((endpoint): endpoint is string => Boolean(endpoint)),
    ),
  );
}

function watchlistTriggerEndpoints() {
  const explicit = process.env.ARCLI_WATCHLIST_TRIGGER_URL?.trim();
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
          baseUrl ? joinBackendPath(baseUrl, "/api/watchlists/trigger") : null,
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

async function postBuyerLanguageResearchTrigger(
  context: BuyerLanguageResearchTriggerContext,
  serviceProfileId: string,
): Promise<ProspectActionResult> {
  const endpoints = buyerLanguageResearchTriggerEndpoints();
  if (endpoints.length === 0) {
    console.warn("[BuyerLanguageResearch] trigger not configured", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return actionError("Buyer-language research is not configured.");
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[BuyerLanguageResearch] trigger secret missing", {
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
    });
    return actionError("Buyer-language research credentials are missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let lastUnavailableError: unknown = null;
    let sawNotFound = false;

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
            source: "dashboard_buyer_language_research",
          }),
        });

        if (response.ok) {
          console.info("[BuyerLanguageResearch] trigger posted", {
            tenant_id: context.tenantId,
            service_profile_id: serviceProfileId,
            endpoint,
          });
          return actionOk(
            "Buyer-language research is queued. It will appear as source-grounded research, not as leads.",
          );
        }

        const body = await response.text().catch(() => "");
        console.warn("[BuyerLanguageResearch] trigger failed", {
          tenant_id: context.tenantId,
          service_profile_id: serviceProfileId,
          endpoint,
          status: response.status,
          body: body.slice(0, 500),
        });
        if (response.status === 404) {
          sawNotFound = true;
          continue;
        }
        if (response.status === 429) {
          return actionError("Research is rate limited for this workspace. Try again later.");
        }
        return actionError(
          `Buyer-language research was not accepted (HTTP ${response.status}).`,
        );
      } catch (error) {
        lastUnavailableError = error;
        console.warn("[BuyerLanguageResearch] trigger unavailable", {
          tenant_id: context.tenantId,
          service_profile_id: serviceProfileId,
          endpoint,
          error,
        });
      }
    }

    if (sawNotFound && !lastUnavailableError) {
      return actionError(
        "Buyer-language research is not enabled on this deployment yet.",
      );
    }

    return actionError(
      lastUnavailableError instanceof Error
        ? `Buyer-language research is unavailable: ${lastUnavailableError.message}`
        : "Buyer-language research is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function postWatchlistDiscoveryTrigger(
  context: Pick<TenantContext, "tenantId" | "userId">,
  watchlistId: string,
  serviceProfileId: string,
): Promise<ProspectActionResult> {
  const endpoints = watchlistTriggerEndpoints();
  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (endpoints.length === 0 || !workerSecret) {
    return actionError(
      "Watchlist saved, but the discovery worker is not configured on this deployment.",
    );
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
            "Idempotency-Key": `watchlist-${watchlistId}`,
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            tenant_id: context.tenantId,
            watchlist_id: watchlistId,
            service_profile_id: serviceProfileId,
            requested_by: context.userId,
            source: "dashboard_watchlist",
          }),
        });
        if (response.ok) {
          return actionOk(
            "Watchlist saved. Cached conversations are being checked first, then selected public sources.",
          );
        }
        if (response.status === 404) continue;
        if (response.status === 429) {
          return actionError("This workspace has reached its Watchlist scan limit. Try again later.");
        }
        return actionError(
          `Watchlist was saved, but the scan was not accepted (HTTP ${response.status}).`,
        );
      } catch (error) {
        lastUnavailableError = error;
      }
    }

    return actionError(
      lastUnavailableError instanceof Error
        ? `Watchlist was saved, but discovery is unavailable: ${lastUnavailableError.message}`
        : "Watchlist was saved, but discovery is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function createWatchlist(
  input: WatchlistCreateInput,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const parsed = WATCHLIST_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Check the Watchlist details and try again.",
    );
  }
  const serviceProfileId = await latestApprovedServiceProfileId(context);
  if (!serviceProfileId) {
    return actionError("Create and approve a website matching brief before adding a Watchlist.");
  }

  const values = parsed.data;
  const result = await context.supabase
    .from("watchlists")
    .insert({
      tenant_id: context.tenantId,
      service_profile_id: serviceProfileId,
      name: values.name.trim(),
      target_buyer: values.targetBuyer.trim(),
      problem_to_solve: values.problemToSolve.trim(),
      include_terms: normalizeList(values.includeTerms),
      exclude_terms: normalizeList(values.excludeTerms),
      source_preferences: values.sourcePreferences,
      suggested_places: normalizeList(values.suggestedPlaces),
      is_active: true,
      created_by: context.userId,
    })
    .select("id, service_profile_id")
    .maybeSingle();

  if (result.error || !result.data) {
    console.error("[Watchlists] creation failed", {
      tenant_id: context.tenantId,
      error: result.error,
    });
    return actionError(
      "Could not save the Watchlist. Apply the Watchlists database contract and try again.",
    );
  }

  const triggerResult = await postWatchlistDiscoveryTrigger(
    context,
    result.data.id,
    result.data.service_profile_id,
  );
  revalidatePath("/dashboard");
  return triggerResult;
}

export async function runWatchlistDiscovery(
  watchlistId: string,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const normalizedId = watchlistId.trim();
  if (!normalizedId) return actionError("This Watchlist is no longer available.");
  const watchlist = await context.supabase
    .from("watchlists")
    .select("id, service_profile_id, is_active")
    .eq("tenant_id", context.tenantId)
    .eq("id", normalizedId)
    .maybeSingle();
  if (watchlist.error || !watchlist.data || !watchlist.data.is_active) {
    return actionError("This Watchlist is not active in your workspace.");
  }
  const result = await postWatchlistDiscoveryTrigger(
    context,
    watchlist.data.id,
    watchlist.data.service_profile_id,
  );
  if (result.ok) revalidatePath("/dashboard");
  return result;
}

export async function setWatchlistActive(
  watchlistId: string,
  isActive: boolean,
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;
  const normalizedId = watchlistId.trim();
  if (!normalizedId) return actionError("This Watchlist is no longer available.");

  const result = await context.supabase
    .from("watchlists")
    .update({ is_active: isActive })
    .eq("tenant_id", context.tenantId)
    .eq("id", normalizedId)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    return actionError("Could not update this Watchlist.");
  }
  revalidatePath("/dashboard");
  return actionOk(isActive ? "Watchlist resumed." : "Watchlist paused.");
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

/**
 * Starts the explicitly separate research product. Its worker can only write
 * tenant-scoped discovery evidence; it cannot create or qualify a lead.
 */
export async function requestBuyerLanguageResearch(
): Promise<ProspectActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  // Do not accept tenant or profile scope from the browser. The active profile
  // is resolved under the authenticated tenant context immediately before the
  // internal worker handoff.
  const serviceProfileId = await latestServiceProfileId(context);
  if (!serviceProfileId) {
    return actionError("Create and approve a matching brief before starting research.");
  }

  const result = await postBuyerLanguageResearchTrigger(
    {
      tenantId: context.tenantId,
      userId: context.userId,
    },
    serviceProfileId,
  );

  if (result.ok) {
    revalidatePath("/dashboard");
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

function normalizeDiscoveryQueries(
  values: Array<{ query_type: string; phrase: string }>,
) {
  const seen = new Set<string>();

  return values.reduce<Array<{ query_type: string; phrase: string }>>(
    (queries, value) => {
      const queryType = value.query_type.trim();
      const phrase = value.phrase.trim().replace(/\s+/g, " ");
      const key = `${queryType}:${phrase.toLowerCase()}`;

      if (!queryType || !phrase || seen.has(key)) return queries;

      seen.add(key);
      queries.push({ query_type: queryType, phrase });
      return queries;
    },
    [],
  );
}

function updatePayloads(
  values: z.infer<typeof SERVICE_PROFILE_SCHEMA>,
  status: "pending_review" | "approved",
) {
  const discoveryQueries = normalizeDiscoveryQueries(values.discovery_queries);
  const normalized = {
    target_audience: normalizeList(values.target_audience),
    core_problem: values.core_problem,
    unique_value_prop: values.unique_value_prop,
    use_cases: normalizeList(values.use_cases),
    pain_points: normalizeList(values.pain_points),
    buying_triggers: normalizeList(values.buying_triggers),
    urgency_signals: normalizeList(values.urgency_signals),
    discovery_queries: discoveryQueries,
    search_terms:
      discoveryQueries.length > 0
        ? discoveryQueries.map((query) => query.phrase)
        : normalizeList(values.search_terms),
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
    return actionError(
      parsed.error.issues[0]?.message ??
        "Check the service profile fields and try again.",
    );
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

  const requestedFeedback = feedback.trim();
  const normalizedFeedback =
    LEGACY_FEEDBACK_ALIASES[requestedFeedback] ?? requestedFeedback;
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

  const result = await context.supabase
    .from("lead_feedback")
    .insert({
      tenant_id: context.tenantId,
      lead_match_id: leadMatchId,
      feedback_type: normalizedFeedback,
      user_id: context.userId,
    })
    .select("tenant_id")
    .maybeSingle();

  if (!result.error) {
    revalidatePath("/dashboard");
    return actionOk("Feedback saved. It will inform your next matching-brief review.");
  }

  const errorCode =
    result.error && typeof result.error === "object" && "code" in result.error
      ? String((result.error as { code?: unknown }).code ?? "")
      : "";
  if (errorCode === "23505") {
    return actionOk("That feedback is already saved.");
  }

  console.error("[ProspectDashboard] lead feedback insert failed", {
    tenant_id: context.tenantId,
    lead_match_id: leadMatchId,
    feedback: normalizedFeedback,
    error: result.error,
  });

  return actionError("Could not save feedback.");
}
