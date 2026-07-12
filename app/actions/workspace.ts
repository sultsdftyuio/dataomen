"use server";

import { createHash } from "crypto";
import { z } from "zod";

import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type WorkspaceBrainActionResult =
  | { ok: true; data: JsonValue }
  | { ok: false; code: string; message: string };

const WorkspaceBrainRequestSchema = z.object({
  url: z.string().trim().min(1).optional(),
  websiteUrl: z.string().trim().min(1).optional(),
});

function actionError(code: string, message: string): WorkspaceBrainActionResult {
  return { ok: false, code, message };
}

async function requireTenant(): Promise<TenantContext | WorkspaceBrainActionResult> {
  const tenantResult = await resolveTenantContext();

  if (!("response" in tenantResult)) {
    return tenantResult.context;
  }

  if (tenantResult.response.status === 401) {
    return actionError(
      "unauthorized",
      "Sign in again before generating the Arcli Brain.",
    );
  }

  if (tenantResult.response.status === 202) {
    return actionError(
      "workspace_setup_pending",
      "Workspace setup is still finishing.",
    );
  }

  return actionError(
    "tenant_resolution_failed",
    "Workspace access could not be verified.",
  );
}

async function assertTenantMembership(
  context: TenantContext,
): Promise<WorkspaceBrainActionResult | null> {
  const { data, error } = await context.supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", context.tenantId)
    .eq("user_id", context.userId)
    .maybeSingle<{ tenant_id: string | null }>();

  if (!error && data?.tenant_id === context.tenantId) {
    return null;
  }

  console.warn("[WorkspaceBrain] generation rejected by tenant authorization", {
    tenant_id: context.tenantId,
    user_id: context.userId,
    reason: error ? "tenant_membership_lookup_failed" : "tenant_membership_missing",
    error,
  });

  return actionError(
    "tenant_authorization_failed",
    "Workspace access could not be verified.",
  );
}

function normalizeWebsiteUrl(value: string) {
  const parsed = new URL(value);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Enter a valid website URL, including https://.");
  }

  parsed.hash = "";
  return parsed.toString();
}

function requestedWebsiteUrl(input: unknown) {
  const parsed = WorkspaceBrainRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("A valid company website URL is required.");
  }

  const websiteUrl = parsed.data.url ?? parsed.data.websiteUrl;
  if (!websiteUrl) {
    throw new Error("A valid company website URL is required.");
  }

  return normalizeWebsiteUrl(websiteUrl);
}

function generationEndpoint() {
  const explicitEndpoint = process.env.WORKSPACE_BRAIN_GENERATE_URL?.trim();
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const internalApiUrl = process.env.INTERNAL_API_URL?.trim().replace(/\/$/, "");
  if (!internalApiUrl) {
    return null;
  }

  return `${internalApiUrl}/api/internal/workspace-brain/generate`;
}

function generationIdempotencyKey(tenantId: string, websiteUrl: string) {
  return createHash("sha256")
    .update(`workspace-brain:${tenantId}:${websiteUrl}`, "utf8")
    .digest("hex");
}

async function readPayload(response: Response): Promise<JsonValue> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return { error: text };
  }
}

function payloadMessage(payload: JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const message =
    "message" in payload
      ? payload.message
      : "error" in payload
        ? payload.error
        : null;

  return typeof message === "string" ? message : null;
}

export async function generateWorkspaceBrain(
  input: unknown,
): Promise<WorkspaceBrainActionResult> {
  const context = await requireTenant();
  if ("ok" in context) return context;

  const authorizationError = await assertTenantMembership(context);
  if (authorizationError) {
    return authorizationError;
  }

  let websiteUrl: string;
  try {
    websiteUrl = requestedWebsiteUrl(input);
  } catch (error) {
    return actionError(
      "invalid_website_url",
      error instanceof Error
        ? error.message
        : "A valid company website URL is required.",
    );
  }

  const endpoint = generationEndpoint();
  if (!endpoint) {
    console.warn("[WorkspaceBrain] generation endpoint not configured", {
      tenant_id: context.tenantId,
      user_id: context.userId,
      website_url: websiteUrl,
    });
    return actionError(
      "workspace_brain_not_configured",
      "Workspace brain generation is not configured.",
    );
  }

  const workerSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!workerSecret) {
    console.warn("[WorkspaceBrain] generation credentials missing", {
      tenant_id: context.tenantId,
      user_id: context.userId,
      website_url: websiteUrl,
    });
    return actionError(
      "workspace_brain_credentials_missing",
      "Workspace brain generation credentials are missing.",
    );
  }

  const idempotencyKey = generationIdempotencyKey(context.tenantId, websiteUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

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
      body: JSON.stringify({
        tenant_id: context.tenantId,
        url: websiteUrl,
        website_url: websiteUrl,
        requested_by: context.userId,
        source: "workspace_settings_brain_generator",
        idempotency_key: idempotencyKey,
      }),
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      console.warn("[WorkspaceBrain] generation worker rejected request", {
        tenant_id: context.tenantId,
        user_id: context.userId,
        website_url: websiteUrl,
        status: response.status,
        reason:
          payloadMessage(payload) ?? "workspace_brain_generation_worker_failed",
      });
      return actionError(
        "workspace_brain_failed",
        payloadMessage(payload) ?? "Workspace brain generation failed.",
      );
    }

    console.info("[WorkspaceBrain] generation completed", {
      tenant_id: context.tenantId,
      user_id: context.userId,
      website_url: websiteUrl,
    });

    return { ok: true, data: payload };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.warn("[WorkspaceBrain] generation service unavailable", {
      tenant_id: context.tenantId,
      user_id: context.userId,
      website_url: websiteUrl,
      reason: isTimeout ? "timeout" : "request_failed",
      error,
    });
    return actionError(
      isTimeout ? "workspace_brain_timeout" : "workspace_brain_unavailable",
      isTimeout
        ? "Workspace brain generation timed out."
        : "Workspace brain generation service is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
