import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveTenantContext } from "@/utils/supabase/tenant";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  url: z.string().trim().url().optional(),
  websiteUrl: z.string().trim().url().optional(),
});

function jsonError(error: string, status: number, code: string) {
  return NextResponse.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function POST(request: Request) {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON payload.", 400, "invalid_json");
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "A valid company website URL is required.",
      400,
      "invalid_website_url",
    );
  }

  const websiteUrl = parsed.data.url ?? parsed.data.websiteUrl;
  if (!websiteUrl) {
    return jsonError(
      "A valid company website URL is required.",
      400,
      "missing_website_url",
    );
  }

  const endpoint = generationEndpoint();
  if (!endpoint) {
    return jsonError(
      "Workspace brain generation is not configured.",
      503,
      "workspace_brain_not_configured",
    );
  }

  const { tenantId } = tenantResult.context;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
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
      body: JSON.stringify({
        tenant_id: tenantId,
        url: websiteUrl,
        website_url: websiteUrl,
      }),
      signal: controller.signal,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error)
          : "Workspace brain generation failed.";

      return jsonError(message, response.status, "workspace_brain_failed");
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return jsonError(
      isTimeout
        ? "Workspace brain generation timed out."
        : "Workspace brain generation service is unavailable.",
      isTimeout ? 504 : 502,
      isTimeout ? "workspace_brain_timeout" : "workspace_brain_unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
