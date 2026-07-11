import { after } from "next/server";
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
  };
};

function crawlTriggerEndpoint() {
  const explicit = process.env.ARCLI_CRAWLER_TRIGGER_URL?.trim();
  if (explicit) return explicit;

  const legacy = process.env.ARCLI_CRAWLER_INGEST_URL?.trim();
  if (legacy) return legacy;

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  return internalApiUrl ? `${internalApiUrl}/api/crawl/trigger` : null;
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

    return payload.success && tenantId ? { tenantId } : null;
  } catch {
    return null;
  }
}

async function postCrawlTrigger(tenantId: string, websiteUrl: string) {
  const endpoint = crawlTriggerEndpoint();
  if (!endpoint) {
    console.warn("[WORKSPACE_CRAWL_TRIGGER_SKIPPED]", {
      event: "workspace_crawl_trigger_not_configured",
      tenant_id: tenantId,
      website_url: websiteUrl,
    });
    return;
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[WORKSPACE_CRAWL_TRIGGER_SKIPPED]", {
      event: "workspace_crawl_trigger_secret_missing",
      tenant_id: tenantId,
      website_url: websiteUrl,
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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
        website_url: websiteUrl,
        source: "settings_workspace",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("[WORKSPACE_CRAWL_TRIGGER_FAILED]", {
        event: "workspace_crawl_trigger_failed",
        tenant_id: tenantId,
        website_url: websiteUrl,
        status: response.status,
        body: body.slice(0, 500),
      });
      return;
    }

    console.info("[WORKSPACE_CRAWL_TRIGGERED]", {
      event: "workspace_crawl_triggered",
      tenant_id: tenantId,
      website_url: websiteUrl,
    });
  } catch (error) {
    console.warn("[WORKSPACE_CRAWL_TRIGGER_FAILED]", {
      event: "workspace_crawl_trigger_unavailable",
      tenant_id: tenantId,
      website_url: websiteUrl,
      error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleWorkspaceUpdateWithCrawler(request: Request) {
  const triggerRequestPromise = readTriggerRequest(request.clone());
  const response = await handleWorkspaceUpdate(request);
  const [triggerRequest, triggerResponse] = await Promise.all([
    triggerRequestPromise,
    readTriggerResponse(response),
  ]);

  if (triggerRequest && triggerResponse) {
    after(async () => {
      await postCrawlTrigger(triggerResponse.tenantId, triggerRequest.websiteUrl);
    });
  }

  return response;
}

export const POST = handleWorkspaceUpdateWithCrawler;
export const PATCH = handleWorkspaceUpdateWithCrawler;
