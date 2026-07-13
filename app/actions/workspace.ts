"use server";

import { createHash } from "crypto";
import { z } from "zod";

import { createClient } from "@/utils/supabase/server";

type GenerateWorkspaceBrainResult =
  | {
      ok: true;
      status: "pending";
      tenantId: string;
      websiteUrl: string;
      idempotencyKey: string;
      messageId: string | null;
    }
  | { ok: false; code: string; message: string };

type WorkerQueuePayload = {
  status?: unknown;
  tenant_id?: unknown;
  website_url?: unknown;
  message_id?: unknown;
  idempotency_key?: unknown;
  message?: unknown;
  error?: unknown;
  detail?: unknown;
};

type GenerationQueueTarget = {
  endpoint: string;
  kind: "workspace_brain" | "crawl_trigger";
};

const GenerateWorkspaceBrainSchema = z.object({
  tenantId: z.string().trim().uuid(),
  websiteUrl: z.string().trim().min(1),
});

function actionError(
  code: string,
  message: string,
): GenerateWorkspaceBrainResult {
  return { ok: false, code, message };
}

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Enter a valid website URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

function crawlTriggerTarget(): GenerationQueueTarget | null {
  const explicitCrawlerEndpoint = process.env.ARCLI_CRAWLER_TRIGGER_URL?.trim();
  if (explicitCrawlerEndpoint) {
    return { endpoint: explicitCrawlerEndpoint, kind: "crawl_trigger" };
  }

  const legacyCrawlerEndpoint = process.env.ARCLI_CRAWLER_INGEST_URL?.trim();
  if (legacyCrawlerEndpoint) {
    return { endpoint: legacyCrawlerEndpoint, kind: "crawl_trigger" };
  }

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  if (!internalApiUrl) {
    return null;
  }

  return {
    endpoint: joinBackendPath(internalApiUrl, "/api/crawl/trigger"),
    kind: "crawl_trigger",
  };
}

function generationQueueTargets(): GenerationQueueTarget[] {
  const targets: GenerationQueueTarget[] = [];
  const explicitEndpoint = process.env.WORKSPACE_BRAIN_GENERATE_URL?.trim();
  if (explicitEndpoint) {
    targets.push({ endpoint: explicitEndpoint, kind: "workspace_brain" });
  }

  const crawlTarget = crawlTriggerTarget();
  if (
    crawlTarget &&
    !targets.some((target) => target.endpoint === crawlTarget.endpoint)
  ) {
    targets.push(crawlTarget);
  }

  return targets;
}

function joinBackendPath(baseUrl: string, path: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
}

function endpointPath(endpoint: string) {
  try {
    return new URL(endpoint).pathname;
  } catch {
    return "unparseable_endpoint";
  }
}

function generationIdempotencyKey(tenantId: string, websiteUrl: string) {
  return createHash("sha256")
    .update(`workspace-brain:${tenantId}:${websiteUrl}`, "utf8")
    .digest("hex");
}

async function readPayload(response: Response): Promise<WorkerQueuePayload> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as WorkerQueuePayload;
  } catch {
    return { error: text };
  }
}

function payloadMessage(payload: WorkerQueuePayload) {
  const message = payload.message ?? payload.error ?? payload.detail;
  return typeof message === "string" ? message : null;
}

function generationRequestBody(
  target: GenerationQueueTarget,
  {
    tenantId,
    websiteUrl,
    userId,
    idempotencyKey,
  }: {
    tenantId: string;
    websiteUrl: string;
    userId: string;
    idempotencyKey: string;
  },
) {
  const basePayload = {
    tenant_id: tenantId,
    website_url: websiteUrl,
    requested_by: userId,
    source: "workspace_settings_brain_generator",
  };

  if (target.kind === "workspace_brain") {
    return {
      ...basePayload,
      idempotency_key: idempotencyKey,
    };
  }

  return basePayload;
}

async function authorizeTenantAccess(tenantId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      result: actionError(
        "unauthorized",
        "Sign in again before generating the Arcli Brain.",
      ),
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id,user_id,role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle<{ tenant_id: string | null; user_id: string | null; role: string | null }>();

  if (
    membershipError ||
    membership?.tenant_id !== tenantId ||
    membership?.user_id !== user.id
  ) {
    console.warn("[WorkspaceBrain] tenant authorization failed", {
      tenant_id: tenantId,
      user_id: user.id,
      reason: membershipError ? "tenant_membership_lookup_failed" : "tenant_membership_missing",
      error: membershipError,
    });

    return {
      ok: false as const,
      result: actionError(
        "tenant_authorization_failed",
        "Workspace access could not be verified.",
      ),
    };
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("tenant_id,status")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ tenant_id: string | null; status: string | null }>();

  if (tenantError || tenant?.tenant_id !== tenantId) {
    console.warn("[WorkspaceBrain] tenant status verification failed", {
      tenant_id: tenantId,
      user_id: user.id,
      reason: tenantError ? "tenant_lookup_failed" : "tenant_missing",
      error: tenantError,
    });

    return {
      ok: false as const,
      result: actionError(
        "tenant_verification_failed",
        "Workspace access could not be verified.",
      ),
    };
  }

  if (["deleted", "suspended"].includes((tenant.status ?? "").toLowerCase())) {
    return {
      ok: false as const,
      result: actionError(
        "tenant_not_operational",
        "Workspace is not available for brain generation.",
      ),
    };
  }

  return { ok: true as const, userId: user.id };
}

export async function generateWorkspaceBrain(
  tenantId: string,
  websiteUrl: string,
): Promise<GenerateWorkspaceBrainResult> {
  const parsed = GenerateWorkspaceBrainSchema.safeParse({ tenantId, websiteUrl });
  if (!parsed.success) {
    return actionError(
      "invalid_request",
      "A valid workspace and company website URL are required.",
    );
  }

  let normalizedWebsiteUrl: string;
  try {
    normalizedWebsiteUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
  } catch (error) {
    return actionError(
      "invalid_website_url",
      error instanceof Error ? error.message : "A valid company website URL is required.",
    );
  }

  const authorization = await authorizeTenantAccess(parsed.data.tenantId);
  if (!authorization.ok) {
    return authorization.result;
  }

  const targets = generationQueueTargets();
  if (targets.length === 0) {
    console.warn("[WorkspaceBrain] generation endpoint not configured", {
      tenant_id: parsed.data.tenantId,
      user_id: authorization.userId,
      website_url: normalizedWebsiteUrl,
    });
    return actionError(
      "workspace_brain_not_configured",
      "Workspace brain generation is not configured.",
    );
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[WorkspaceBrain] generation credentials missing", {
      tenant_id: parsed.data.tenantId,
      user_id: authorization.userId,
      website_url: normalizedWebsiteUrl,
    });
    return actionError(
      "workspace_brain_credentials_missing",
      "Workspace brain generation credentials are missing.",
    );
  }

  const idempotencyKey = generationIdempotencyKey(
    parsed.data.tenantId,
    normalizedWebsiteUrl,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let lastFailure:
      | { response: Response; payload: WorkerQueuePayload; target: GenerationQueueTarget }
      | null = null;

    for (const target of targets) {
      const response = await fetch(target.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerSecret}`,
          "Idempotency-Key": idempotencyKey,
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(
          generationRequestBody(target, {
            tenantId: parsed.data.tenantId,
            websiteUrl: normalizedWebsiteUrl,
            userId: authorization.userId,
            idempotencyKey,
          }),
        ),
      });
      const payload = await readPayload(response);

      if (!response.ok && [404, 405].includes(response.status)) {
        lastFailure = { response, payload, target };
        console.warn("[WorkspaceBrain] generation queue target unavailable", {
          tenant_id: parsed.data.tenantId,
          user_id: authorization.userId,
          website_url: normalizedWebsiteUrl,
          status: response.status,
          endpoint_path: endpointPath(target.endpoint),
          queue_target: target.kind,
          fallback_available: targets.length > 1,
          reason: payloadMessage(payload) ?? "workspace_brain_enqueue_target_missing",
        });
        continue;
      }

      if (!response.ok) {
        lastFailure = { response, payload, target };
        break;
      }

      console.info("[WorkspaceBrain] generation queued", {
        tenant_id: parsed.data.tenantId,
        user_id: authorization.userId,
        website_url: normalizedWebsiteUrl,
        queue_target: target.kind,
        message_id: typeof payload.message_id === "string" ? payload.message_id : null,
      });

      return {
        ok: true,
        status: "pending",
        tenantId: parsed.data.tenantId,
        websiteUrl: normalizedWebsiteUrl,
        idempotencyKey,
        messageId: typeof payload.message_id === "string" ? payload.message_id : null,
      };
    }

    if (lastFailure) {
      const { response, payload, target } = lastFailure;
      console.warn("[WorkspaceBrain] generation worker rejected enqueue request", {
        tenant_id: parsed.data.tenantId,
        user_id: authorization.userId,
        website_url: normalizedWebsiteUrl,
        status: response.status,
        endpoint_path: endpointPath(target.endpoint),
        queue_target: target.kind,
        reason: payloadMessage(payload) ?? "workspace_brain_enqueue_failed",
      });
      return actionError(
        "workspace_brain_enqueue_failed",
        payloadMessage(payload) ?? "Workspace brain generation could not be queued.",
      );
    }

    return actionError(
      "workspace_brain_enqueue_failed",
      "Workspace brain generation could not be queued.",
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const primaryTarget = targets[0];
    console.warn("[WorkspaceBrain] generation queue unavailable", {
      tenant_id: parsed.data.tenantId,
      user_id: authorization.userId,
      website_url: normalizedWebsiteUrl,
      endpoint_path: primaryTarget
        ? endpointPath(primaryTarget.endpoint)
        : "unconfigured_endpoint",
      queue_target: primaryTarget?.kind ?? "unconfigured",
      reason: isTimeout ? "timeout" : "request_failed",
      error,
    });
    return actionError(
      isTimeout ? "workspace_brain_queue_timeout" : "workspace_brain_queue_unavailable",
      isTimeout
        ? "Workspace brain generation timed out before it could be queued."
        : "Workspace brain generation queue is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
