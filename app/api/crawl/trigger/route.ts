import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { Json } from "@/types/supabase";
import { createServiceRoleClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["pending", "processing"] as const;
const TERMINAL_STATUSES = ["completed", "failed", "dead_lettered"] as const;

type DbRecord = Record<string, Json>;
type QueryResult<T> = { data: T | null; error: unknown };
type CrawlJobRow = {
  id: string;
  status: string | null;
  message_id: string | null;
};

const TriggerSchema = z.object({
  tenant_id: z.string().trim().uuid(),
  website_url: z.string().trim().min(1),
  requested_by: z.string().trim().uuid().optional(),
  source: z.string().trim().max(120).optional(),
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function db() {
  return createServiceRoleClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => any;
      insert: (payload: DbRecord) => any;
      update: (payload: DbRecord) => any;
    };
  };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

function verifyInternalRequest(request: Request) {
  const expected = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!expected) {
    return jsonResponse(
      {
        error: "Internal worker authentication is not configured.",
        code: "internal_auth_unconfigured",
      },
      { status: 503 },
    );
  }

  const token = bearerToken(request);
  const left = Buffer.from(token ?? "");
  const right = Buffer.from(expected);
  const valid = left.length === right.length && timingSafeEqual(left, right);

  return valid
    ? null
    : jsonResponse(
        { error: "Invalid internal worker credentials.", code: "forbidden" },
        { status: 403 },
      );
}

function normalizeWebsiteUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(candidate);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("website_url must be a valid HTTP(S) URL");
  }

  if (parsed.username || parsed.password) {
    throw new Error("website_url must not include credentials");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function crawlJobId(tenantId: string, websiteUrl: string) {
  return createHash("sha256")
    .update(`${tenantId}:${websiteUrl}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

async function validateTenant(
  supabase: ReturnType<typeof db>,
  tenantId: string,
  requestedBy?: string,
) {
  const tenant = (await supabase
    .from("tenants")
    .select("tenant_id,status,provisioning_status")
    .eq("tenant_id", tenantId)
    .maybeSingle()) as QueryResult<{
    tenant_id: string | null;
    status: string | null;
    provisioning_status: string | null;
  }>;

  if (tenant.error) throw tenant.error;
  if (tenant.data?.tenant_id !== tenantId) {
    return jsonResponse(
      { error: "Tenant not found.", code: "tenant_not_found" },
      { status: 404 },
    );
  }

  const tenantStatus = (tenant.data.status ?? "").toLowerCase();
  const provisioningStatus = (tenant.data.provisioning_status ?? "").toUpperCase();
  if (
    ["deleted", "suspended"].includes(tenantStatus) ||
    ["DELETED", "SUSPENDED", "ARCHIVED", "FAILED"].includes(provisioningStatus)
  ) {
    return jsonResponse(
      { error: "Tenant is not operational.", code: "tenant_not_operational" },
      { status: 403 },
    );
  }

  if (!requestedBy) return null;

  const membership = (await supabase
    .from("tenant_users")
    .select("tenant_id,user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", requestedBy)
    .maybeSingle()) as QueryResult<{
    tenant_id: string | null;
    user_id: string | null;
  }>;

  if (
    membership.error ||
    membership.data?.tenant_id !== tenantId ||
    membership.data?.user_id !== requestedBy
  ) {
    return jsonResponse(
      {
        error: "Requester is not a member of this tenant.",
        code: "requester_not_in_tenant",
      },
      { status: 403 },
    );
  }

  return null;
}

async function findActiveJob(
  supabase: ReturnType<typeof db>,
  tenantId: string,
  websiteUrl: string,
) {
  const result = (await supabase
    .from("crawl_jobs")
    .select("id,status,message_id")
    .eq("tenant_id", tenantId)
    .eq("website_url", websiteUrl)
    .in("status", ACTIVE_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<CrawlJobRow>;

  if (result.error) throw result.error;
  return result.data;
}

async function createPendingJob(
  supabase: ReturnType<typeof db>,
  tenantId: string,
  websiteUrl: string,
) {
  const now = new Date().toISOString();
  const id = crawlJobId(tenantId, websiteUrl);
  const payload: DbRecord = {
    id,
    tenant_id: tenantId,
    website_url: websiteUrl,
    status: "pending",
    phase: "queued",
    message_id: null,
    failure_reason: null,
    error_type: null,
    error_message: null,
    error_context: {},
    queued_at: now,
    last_heartbeat_at: now,
    updated_at: now,
  };

  const inserted = (await supabase
    .from("crawl_jobs")
    .insert(payload)
    .select("id,status,message_id")
    .maybeSingle()) as QueryResult<CrawlJobRow>;

  if (!inserted.error && inserted.data) return { job: inserted.data, created: true };

  const activeJob = await findActiveJob(supabase, tenantId, websiteUrl);
  if (activeJob) return { job: activeJob, created: false };

  const retried = (await supabase
    .from("crawl_jobs")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .in("status", TERMINAL_STATUSES)
    .select("id,status,message_id")
    .maybeSingle()) as QueryResult<CrawlJobRow>;

  if (retried.error) throw retried.error;
  if (retried.data) return { job: retried.data, created: true };

  const recheckedJob = await findActiveJob(supabase, tenantId, websiteUrl);
  if (recheckedJob) return { job: recheckedJob, created: false };

  throw inserted.error ?? new Error("Unable to create crawl job.");
}

function joinBackendPath(baseUrl: string, path: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
}

function workerEndpoint(request: Request) {
  const currentUrl = new URL(request.url);
  const candidates = [
    process.env.ARCLI_WORKER_API_URL
      ? joinBackendPath(process.env.ARCLI_WORKER_API_URL, "/api/crawl/trigger")
      : null,
    process.env.PYTHON_BACKEND_URL
      ? joinBackendPath(process.env.PYTHON_BACKEND_URL, "/api/crawl/trigger")
      : null,
    process.env.ARCLI_CRAWLER_TRIGGER_URL?.trim() || null,
    process.env.ARCLI_CRAWLER_INGEST_URL?.trim() || null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const endpoint = new URL(candidate, currentUrl);
      if (
        endpoint.origin !== currentUrl.origin ||
        endpoint.pathname !== currentUrl.pathname
      ) {
        return endpoint.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function readWorkerMessage(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    const payload = JSON.parse(text) as {
      message_id?: unknown;
      message?: unknown;
      error?: unknown;
      detail?: unknown;
    };
    return {
      messageId: typeof payload.message_id === "string" ? payload.message_id : null,
      error:
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : typeof payload.detail === "string"
              ? payload.detail
              : null,
    };
  } catch {
    return { messageId: null, error: text };
  }
}

async function triggerWorker(
  request: Request,
  payload: z.infer<typeof TriggerSchema>,
  websiteUrl: string,
  jobId: string,
) {
  const endpoint = workerEndpoint(request);
  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();

  if (!endpoint || !workerSecret) {
    return {
      ok: false as const,
      status: 503,
      message: "Crawler worker endpoint is not configured.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": jobId,
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        tenant_id: payload.tenant_id,
        website_url: websiteUrl,
        requested_by: payload.requested_by,
        source: payload.source ?? "next_crawl_trigger",
      }),
    });
    const workerMessage = await readWorkerMessage(response);

    return response.ok
      ? {
          ok: true as const,
          messageId: workerMessage?.messageId ?? jobId,
        }
      : {
          ok: false as const,
          status: response.status,
          message: workerMessage?.error ?? "Crawler queue rejected the request.",
        };
  } catch (error) {
    return {
      ok: false as const,
      status: error instanceof Error && error.name === "AbortError" ? 504 : 503,
      message:
        error instanceof Error
          ? `Crawler queue is unavailable: ${error.message}`
          : "Crawler queue is unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function markTriggerFailed(
  supabase: ReturnType<typeof db>,
  jobId: string,
  tenantId: string,
  message: string,
) {
  await supabase
    .from("crawl_jobs")
    .update({
      status: "failed",
      phase: "trigger_failed",
      failure_reason: "trigger_unavailable",
      error_type: "CrawlerTriggerError",
      error_message: message.slice(0, 2000),
      error_context: { source: "next_crawl_trigger" },
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);
}

function accepted(
  tenantId: string,
  websiteUrl: string,
  job: CrawlJobRow,
  deduped: boolean,
  messageId = job.message_id ?? job.id,
) {
  return jsonResponse(
    {
      status: "queued",
      tenant_id: tenantId,
      website_url: websiteUrl,
      crawl_job_id: job.id,
      job_id: job.id,
      job_status: job.status ?? "pending",
      message_id: messageId,
      deduped,
    },
    { status: 202 },
  );
}

export async function POST(request: Request) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  const parsed = TriggerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid crawl trigger payload.", code: "invalid_request" },
      { status: 400 },
    );
  }

  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(parsed.data.website_url);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "website_url must be a valid HTTP(S) URL",
        code: "invalid_website_url",
      },
      { status: 400 },
    );
  }

  const supabase = db();

  try {
    const tenantError = await validateTenant(
      supabase,
      parsed.data.tenant_id,
      parsed.data.requested_by,
    );
    if (tenantError) return tenantError;

    const activeJob = await findActiveJob(
      supabase,
      parsed.data.tenant_id,
      websiteUrl,
    );
    if (activeJob) {
      return accepted(parsed.data.tenant_id, websiteUrl, activeJob, true);
    }

    const { job, created } = await createPendingJob(
      supabase,
      parsed.data.tenant_id,
      websiteUrl,
    );
    if (!created) return accepted(parsed.data.tenant_id, websiteUrl, job, true);

    const workerResult = await triggerWorker(request, parsed.data, websiteUrl, job.id);
    if (!workerResult.ok) {
      await markTriggerFailed(
        supabase,
        job.id,
        parsed.data.tenant_id,
        workerResult.message,
      );
      return jsonResponse(
        { error: workerResult.message, code: "crawler_queue_unavailable" },
        { status: workerResult.status },
      );
    }

    await supabase
      .from("crawl_jobs")
      .update({
        message_id: workerResult.messageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("tenant_id", parsed.data.tenant_id);

    return accepted(
      parsed.data.tenant_id,
      websiteUrl,
      job,
      false,
      workerResult.messageId,
    );
  } catch (error) {
    console.error("[CrawlTrigger] request failed", {
      tenant_id: parsed.data.tenant_id,
      website_url: websiteUrl,
      error,
    });
    return jsonResponse(
      { error: "Crawler trigger failed.", code: "crawler_trigger_failed" },
      { status: 500 },
    );
  }
}
