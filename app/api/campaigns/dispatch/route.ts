// app/api/campaigns/dispatch/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenantContext } from "@/utils/supabase/tenant";

const dispatchSchema = z.object({
  templateId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().max(128),
  targets: z.array(z.object({}).passthrough()).min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const tenantResult = await resolveTenantContext();
    if ("response" in tenantResult) {
      return tenantResult.response;
    }

    const { supabase, tenantId } = tenantResult.context;

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

    const { data, error } = await supabase.rpc("dispatch_campaign_atomic", {
      tenant_id: tenantId,
      template_id: templateId,
      idempotency_key: idempotencyKey,
      targets,
    });

    if (error) {
      console.error("[CAMPAIGN_DISPATCH] RPC failed:", error);
      return NextResponse.json(
        { error: "Failed to dispatch campaign" },
        { status: 500 }
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    const status =
      result && typeof result === "object" && "status" in result
        ? (result as { status?: string }).status
        : null;
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
}