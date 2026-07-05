// app/api/campaigns/dispatch/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-security";
import { getWorkspaceEntitlements, PRO_PLAN_REQUIRED_MESSAGE } from "@/lib/entitlements";
import crypto from "crypto";

export const runtime = "nodejs";

const dispatchSchema = z.object({
  templateId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  targets: z
    .array(
      z
        .object({
          id: z.string().trim().min(1),
          email: z.string().trim().toLowerCase().email(),
          signal: z.string().trim().optional().default("unknown"),
          riskScore: z.coerce.number().int().min(0).max(100).optional().default(0),
        })
        .passthrough()
    )
    .min(1)
    .max(500),
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashDispatchRequest = (
  templateId: string,
  targets: Array<{ id: string; email: string; signal: string; riskScore: number }>
) => {
  const canonicalTargets = targets
    .map((target) => ({
      id: target.id,
      email: target.email,
      signal: target.signal,
      riskScore: target.riskScore,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.email.localeCompare(b.email));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ templateId, targets: canonicalTargets }))
    .digest("hex");
};

const getRpcStatus = (data: unknown) => {
  const result = Array.isArray(data) ? data[0] : data;

  if (!result || typeof result !== "object") {
    return null;
  }

  return "status" in result ? (result as { status?: string }).status ?? null : null;
};

export const POST = withTenant(async (req, { supabase, tenantId }) => {
  try {
    const entitlements = await getWorkspaceEntitlements(supabase as any, tenantId);
    if (!entitlements.canSendEmails) {
      return NextResponse.json(
        { error: PRO_PLAN_REQUIRED_MESSAGE, code: "pro_plan_required" },
        { status: 403 }
      );
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = dispatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { templateId, targets, idempotencyKey } = parsed.data;
    const requestHash = hashDispatchRequest(templateId, targets);

    let data: unknown = null;
    let error: { message?: string } | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rpcResult = await (supabase as any).rpc("dispatch_campaign_atomic", {
        p_tenant_id: tenantId,
        p_template_id: templateId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_targets: targets,
      });

      data = rpcResult.data;
      error = rpcResult.error;

      if (error) {
        break;
      }

      if (getRpcStatus(data) === "pending") {
        if (attempt === 3) {
          return NextResponse.json(
            { error: "Campaign dispatch is already pending" },
            { status: 409 }
          );
        }

        await delay(200);
        continue;
      }

      break;
    }

    if (error) {
      console.error("[CAMPAIGN_DISPATCH] RPC failed:", error);
      return NextResponse.json(
        { error: "Failed to dispatch campaign" },
        { status: 500 }
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    const status = getRpcStatus(data);
    const deduplicated =
      (result &&
        typeof result === "object" &&
        "deduplicated" in result &&
        Boolean((result as { deduplicated?: boolean }).deduplicated)) ||
      status === "deduplicated";
    const queued =
      result &&
      typeof result === "object" &&
      "queued" in result &&
      typeof (result as { queued?: number }).queued === "number"
        ? (result as { queued: number }).queued
        : targets.length;

    if (deduplicated) {
      return NextResponse.json({ status: "success", note: "deduplicated", queued });
    }

    return NextResponse.json({ status: "success", queued });
  } catch (error) {
    console.error("[CAMPAIGN_DISPATCH] Fatal error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
