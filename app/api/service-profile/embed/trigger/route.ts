import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createServiceRoleClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryResult<T> = { data: T | null; error: unknown };

const TriggerSchema = z.object({
  tenant_id: z.string().trim().uuid(),
  service_profile_id: z.string().trim().uuid().nullable().optional(),
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

async function validateServiceProfile(
  supabase: ReturnType<typeof db>,
  tenantId: string,
  serviceProfileId: string | null,
) {
  if (!serviceProfileId) return null;

  const profile = (await supabase
    .from("service_profiles")
    .select("id,tenant_id")
    .eq("tenant_id", tenantId)
    .eq("id", serviceProfileId)
    .maybeSingle()) as QueryResult<{
    id: string | null;
    tenant_id: string | null;
  }>;

  if (profile.error) throw profile.error;
  if (
    profile.data?.id !== serviceProfileId ||
    profile.data?.tenant_id !== tenantId
  ) {
    return jsonResponse(
      {
        error: "Service profile not found for this tenant.",
        code: "service_profile_not_found",
      },
      { status: 404 },
    );
  }

  return null;
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
      ? joinBackendPath(
          process.env.ARCLI_WORKER_API_URL,
          "/api/service-profile/embed/trigger",
        )
      : null,
    process.env.PYTHON_BACKEND_URL
      ? joinBackendPath(
          process.env.PYTHON_BACKEND_URL,
          "/api/service-profile/embed/trigger",
        )
      : null,
    process.env.ARCLI_PROFILE_EMBEDDING_TRIGGER_URL?.trim() || null,
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
  serviceProfileId: string | null,
) {
  const endpoint = workerEndpoint(request);
  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();

  if (!endpoint || !workerSecret) {
    return {
      ok: false as const,
      status: 503,
      message: "Embedding worker endpoint is not configured.",
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
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        tenant_id: payload.tenant_id,
        service_profile_id: serviceProfileId,
        requested_by: payload.requested_by,
        source: payload.source ?? "next_service_profile_embedding_trigger",
      }),
    });
    const workerMessage = await readWorkerMessage(response);

    return response.ok
      ? {
          ok: true as const,
          messageId: workerMessage?.messageId ?? null,
        }
      : {
          ok: false as const,
          status: response.status,
          message: workerMessage?.error ?? "Embedding queue rejected the request.",
        };
  } catch (error) {
    return {
      ok: false as const,
      status: error instanceof Error && error.name === "AbortError" ? 504 : 503,
      message:
        error instanceof Error
          ? `Embedding queue is unavailable: ${error.message}`
          : "Embedding queue is unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  const parsed = TriggerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid embedding trigger payload.", code: "invalid_request" },
      { status: 400 },
    );
  }

  const serviceProfileId = parsed.data.service_profile_id ?? null;
  const supabase = db();

  try {
    const tenantError = await validateTenant(
      supabase,
      parsed.data.tenant_id,
      parsed.data.requested_by,
    );
    if (tenantError) return tenantError;

    const profileError = await validateServiceProfile(
      supabase,
      parsed.data.tenant_id,
      serviceProfileId,
    );
    if (profileError) return profileError;

    const workerResult = await triggerWorker(request, parsed.data, serviceProfileId);
    if (!workerResult.ok) {
      return jsonResponse(
        { error: workerResult.message, code: "embedding_queue_unavailable" },
        { status: workerResult.status },
      );
    }

    return jsonResponse(
      {
        status: "queued",
        tenant_id: parsed.data.tenant_id,
        service_profile_id: serviceProfileId,
        message_id: workerResult.messageId,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[ServiceProfileEmbeddingTrigger] request failed", {
      tenant_id: parsed.data.tenant_id,
      service_profile_id: serviceProfileId,
      error,
    });
    return jsonResponse(
      { error: "Embedding trigger failed.", code: "embedding_trigger_failed" },
      { status: 500 },
    );
  }
}
