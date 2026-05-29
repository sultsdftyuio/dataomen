// app/api/campaigns/dispatch/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-security";
import type { Json } from "@/types/supabase";

const dispatchSchema = z.object({
  templateId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().max(128),
  targets: z
    .array(
      z
        .object({
          email: z.string().trim().toLowerCase().optional(),
        })
        .passthrough()
    )
    .min(1)
    .max(500),
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getRpcStatus = (data: unknown) => {
  const result = Array.isArray(data) ? data[0] : data;

  if (!result || typeof result !== "object") {
    return null;
  }

  return "status" in result ? (result as { status?: string }).status ?? null : null;
};

export const POST = withTenant(async (req, { supabase, tenantId }) => {
  try {
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

    let data: unknown = null;
    let error: { message?: string } | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rpcResult = await supabase.rpc("dispatch_campaign_atomic", {
        tenant_id: tenantId,
        template_id: templateId,
        idempotency_key: idempotencyKey,
        targets: targets as Json[],
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