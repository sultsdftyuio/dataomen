import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleWorkspaceUpdate } from "@/lib/settings/api";

const TriggerRequestSchema = z.object({
  websiteUrl: z.string().trim().url().optional(),
  website_url: z.string().trim().url().optional(),
});

type WorkspaceUpdateResponse = {
  success?: boolean;
  metadata?: {
    tenantId?: unknown;
    serviceProfileUpdated?: unknown;
    serviceProfileId?: unknown;
  };
};

type TriggerResult = {
  accepted: boolean;
  reason: string | null;
};

type WorkerEndpointEnvironment = Record<string, string | undefined>;

async function triggerFailureReason(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return null;

  try {
    const payload = JSON.parse(body) as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    for (const value of [payload.error, payload.message, payload.detail]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // Fall through to the bounded raw response below.
  }

  return body.trim().slice(0, 500) || null;
}

function joinBackendPath(baseUrl: string, path: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
}

function uniqueEndpoints(candidates: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      candidates
        .map((endpoint) => endpoint?.trim())
        .filter((endpoint): endpoint is string => Boolean(endpoint)),
    ),
  );
}

function backendEndpoints(
  path: string,
  environment: WorkerEndpointEnvironment,
) {
  return [
    environment.ARCLI_WORKER_API_URL,
    environment.PYTHON_BACKEND_URL,
    environment.INTERNAL_API_URL,
  ].map((baseUrl) => (baseUrl ? joinBackendPath(baseUrl, path) : null));
}

export function crawlTriggerEndpoints(
  environment: WorkerEndpointEnvironment = process.env,
) {
  return uniqueEndpoints([
    environment.ARCLI_CRAWLER_TRIGGER_URL,
    environment.ARCLI_CRAWLER_INGEST_URL,
    ...backendEndpoints("/api/crawl/trigger", environment),
  ]);
}

export function embeddingTriggerEndpoints(
  environment: WorkerEndpointEnvironment = process.env,
) {
  return uniqueEndpoints([
    environment.ARCLI_PROFILE_EMBEDDING_TRIGGER_URL,
    ...backendEndpoints("/api/service-profile/embed/trigger", environment),
  ]);
}

function crawlJobId(tenantId: string, websiteUrl: string) {
  return createHash("sha256")
    .update(`${tenantId}:${websiteUrl}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

async function readTriggerRequest(request: Request) {
  try {
    const parsed = TriggerRequestSchema.safeParse(await request.json());
    if (!parsed.success) return null;

    const websiteUrl = parsed.data.websiteUrl ?? parsed.data.website_url;
    return websiteUrl ? { websiteUrl } : null;
  } catch {
    return null;
  }
}

async function readTriggerResponse(response: Response) {
  if (!response.ok) return null;

  try {
    const payload = (await response.clone().json()) as WorkspaceUpdateResponse;
    const tenantId =
      typeof payload.metadata?.tenantId === "string"
        ? payload.metadata.tenantId
        : null;

    const serviceProfileUpdated =
      payload.metadata?.serviceProfileUpdated === true;
    const serviceProfileId =
      typeof payload.metadata?.serviceProfileId === "string"
        ? payload.metadata.serviceProfileId
        : null;

    return payload.success && tenantId
      ? { tenantId, serviceProfileUpdated, serviceProfileId }
      : null;
  } catch {
    return null;
  }
}

async function postCrawlTrigger(
  tenantId: string,
  websiteUrl: string,
): Promise<TriggerResult> {
  const endpoints = crawlTriggerEndpoints();
  if (endpoints.length === 0) {
    console.warn("[WORKSPACE_CRAWL_TRIGGER_SKIPPED]", {
      event: "workspace_crawl_trigger_not_configured",
      tenant_id: tenantId,
      website_url: websiteUrl,
    });
    return {
      accepted: false,
      reason: "the crawl worker endpoint is not configured",
    };
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[WORKSPACE_CRAWL_TRIGGER_SKIPPED]", {
      event: "workspace_crawl_trigger_secret_missing",
      tenant_id: tenantId,
      website_url: websiteUrl,
    });
    return {
      accepted: false,
      reason: "the crawl worker secret is not configured",
    };
  }

  const deadline = Date.now() + 5000;

  for (const endpoint of endpoints) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crawlJobId(tenantId, websiteUrl),
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          tenant_id: tenantId,
          website_url: websiteUrl,
          source: "settings_workspace",
        }),
      });

      if (!response.ok) {
        const reason = await triggerFailureReason(response);
        console.warn("[WORKSPACE_CRAWL_TRIGGER_FAILED]", {
          event: "workspace_crawl_trigger_failed",
          tenant_id: tenantId,
          website_url: websiteUrl,
          endpoint,
          status: response.status,
          body: reason,
        });
        return {
          accepted: false,
          reason:
            reason ?? `the crawl worker returned HTTP ${response.status}`,
        };
      }

      console.info("[WORKSPACE_CRAWL_TRIGGERED]", {
        event: "workspace_crawl_triggered",
        tenant_id: tenantId,
        website_url: websiteUrl,
        endpoint,
      });
      return { accepted: true, reason: null };
    } catch (error) {
      console.warn("[WORKSPACE_CRAWL_TRIGGER_FAILED]", {
        event: "workspace_crawl_trigger_unavailable",
        tenant_id: tenantId,
        website_url: websiteUrl,
        endpoint,
        error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { accepted: false, reason: "the crawl worker could not be reached" };
}

async function postEmbeddingTrigger(
  tenantId: string,
  serviceProfileId: string | null,
): Promise<TriggerResult> {
  const endpoints = embeddingTriggerEndpoints();
  if (endpoints.length === 0) {
    console.warn("[WORKSPACE_PROFILE_EMBEDDING_TRIGGER_SKIPPED]", {
      event: "workspace_profile_embedding_trigger_not_configured",
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
    });
    return {
      accepted: false,
      reason: "the lead-discovery worker endpoint is not configured",
    };
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[WORKSPACE_PROFILE_EMBEDDING_TRIGGER_SKIPPED]", {
      event: "workspace_profile_embedding_trigger_secret_missing",
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
    });
    return {
      accepted: false,
      reason: "the lead-discovery worker secret is not configured",
    };
  }

  const deadline = Date.now() + 5000;

  for (const endpoint of endpoints) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          tenant_id: tenantId,
          service_profile_id: serviceProfileId,
          source: "settings_service_profile_update",
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn("[WORKSPACE_PROFILE_EMBEDDING_TRIGGER_FAILED]", {
          event: "workspace_profile_embedding_trigger_failed",
          tenant_id: tenantId,
          service_profile_id: serviceProfileId,
          endpoint,
          status: response.status,
          body: body.slice(0, 500),
        });
        return {
          accepted: false,
          reason: `the lead-discovery worker returned HTTP ${response.status}`,
        };
      }

      console.info("[WORKSPACE_PROFILE_EMBEDDING_TRIGGERED]", {
        event: "workspace_profile_embedding_triggered",
        tenant_id: tenantId,
        service_profile_id: serviceProfileId,
        endpoint,
      });
      return { accepted: true, reason: null };
    } catch (error) {
      console.warn("[WORKSPACE_PROFILE_EMBEDDING_TRIGGER_FAILED]", {
        event: "workspace_profile_embedding_trigger_unavailable",
        tenant_id: tenantId,
        service_profile_id: serviceProfileId,
        endpoint,
        error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    accepted: false,
    reason: "the lead-discovery worker could not be reached",
  };
}

function savedButScanNotStartedResponse(reasons: string[]) {
  const detail = reasons.filter(Boolean).join("; ");
  console.warn("[WORKSPACE_SCAN_START_REQUIRES_ATTENTION]", {
    event: "workspace_scan_start_requires_attention",
    reasons,
  });

  // The settings write has already succeeded.  Use 202 rather than reporting
  // a false persistence failure, but make the missing scan explicit to the
  // client instead of hiding a dropped background trigger behind success.
  return NextResponse.json(
    {
      success: true,
      scanStarted: false,
      message: `Configuration was saved, but lead discovery did not start: ${detail}. Check the worker configuration, then save the matching brief again.`,
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}

async function handleWorkspaceUpdateWithCrawler(request: Request) {
  const triggerRequestPromise = readTriggerRequest(request.clone());
  const response = await handleWorkspaceUpdate(request);
  const [triggerRequest, triggerResponse] = await Promise.all([
    triggerRequestPromise,
    readTriggerResponse(response),
  ]);

  if (!triggerResponse) return response;

  const triggerResults = await Promise.all([
    triggerRequest
      ? postCrawlTrigger(triggerResponse.tenantId, triggerRequest.websiteUrl)
      : null,
    triggerResponse.serviceProfileUpdated
      ? postEmbeddingTrigger(
          triggerResponse.tenantId,
          triggerResponse.serviceProfileId,
        )
      : null,
  ]);
  const failures = triggerResults.flatMap((result) =>
    result && !result.accepted && result.reason ? [result.reason] : [],
  );

  if (failures.length > 0) {
    return savedButScanNotStartedResponse(failures);
  }

  return response;
}

export const POST = handleWorkspaceUpdateWithCrawler;
export const PATCH = handleWorkspaceUpdateWithCrawler;
