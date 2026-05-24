import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";
import { z } from "zod";

// ============================================================================
// VALIDATION LAYER
// ============================================================================
const DispatchSchema = z.object({
  templateId: z.string().min(1),
  idempotencyKey: z.string().max(128),
  targets: z.array(
    z.object({
      id: z.string().min(1),
      email: z.string().trim().toLowerCase().email(),
      signal: z.string().optional().default("unknown"),
      riskScore: z.number().min(0).max(100).optional().default(0),
    })
  )
  .min(1)
  .max(500),
});

// ============================================================================
// RPC RESPONSE VALIDATION
// ============================================================================
const RpcResponseSchema = z.object({
  status: z.enum(["success", "deduplicated"]),
  queued: z.number().optional(),
});

// ============================================================================
// OPTIONAL: RATE LIMIT HOOK (plug Redis or Upstash here)
// ============================================================================
async function checkRateLimit(_tenantId: string): Promise<boolean> {
  // TODO: replace with real rate limiter (Redis / Upstash / etc.)
  return true;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();

    // =========================================================================
    // AUTH
    // =========================================================================
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", requestId },
        { status: 401 }
      );
    }

    // =========================================================================
    // TENANT RESOLUTION (ZERO TRUST)
    // =========================================================================
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (tenantError || !tenantData?.tenant_id) {
      return NextResponse.json(
        { error: "Tenant context not found", requestId },
        { status: 403 }
      );
    }

    const tenantId = tenantData.tenant_id;

    // =========================================================================
    // RATE LIMIT CHECK
    // =========================================================================
    const allowed = await checkRateLimit(tenantId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", requestId },
        { status: 429 }
      );
    }

    // =========================================================================
    // VALIDATION
    // =========================================================================
    const body = await req.json();
    const parsed = DispatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: parsed.error.format(),
          requestId,
        },
        { status: 400 }
      );
    }

    const { templateId, targets, idempotencyKey } = parsed.data;

    // =========================================================================
    // TRANSFORM PAYLOAD (WORKER-READY OUTBOX ROWS)
    // =========================================================================
    const outboxPayloads = targets.map((t) => {
      const messageKey = crypto
        .createHash("sha256")
        .update(`${tenantId}_${t.id}_${templateId}_${idempotencyKey}`)
        .digest("hex");

      return {
        tenant_id: tenantId,
        user_id: t.id,
        email: t.email,
        campaign_type: templateId,
        status: "queued",
        idempotency_key: idempotencyKey,
        message_key: messageKey,
        primary_risk_signal: t.signal,
        churn_risk_score: t.riskScore,
      };
    });

    // =========================================================================
    // ATOMIC RPC CALL
    // =========================================================================
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const getRpcStatus = (value: unknown) => {
      const result = Array.isArray(value) ? value[0] : value;

      if (!result || typeof result !== "object") {
        return null;
      }

      return "status" in result ? (result as { status?: string }).status ?? null : null;
    };

    let rpcResult: unknown = null;
    let rpcError: { message?: string } | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await supabase.rpc("dispatch_campaign_atomic", {
        p_tenant_id: tenantId,
        p_idempotency_key: idempotencyKey,
        p_outbox_payloads: outboxPayloads,
      });

      rpcResult = response.data;
      rpcError = response.error;

      if (rpcError) {
        break;
      }

      if (getRpcStatus(rpcResult) === "pending") {
        if (attempt === 3) {
          return NextResponse.json(
            { error: "Campaign dispatch is already pending", requestId },
            { status: 409 }
          );
        }

        await delay(200);
        continue;
      }

      break;
    }

    if (rpcError) {
      console.error("[RPC_ERROR]", {
        requestId,
        tenantId,
        error: rpcError,
      });

      return NextResponse.json(
        { error: "Queue dispatch failed", requestId },
        { status: 500 }
      );
    }

    // =========================================================================
    // STRICT RESPONSE VALIDATION (IMPORTANT SAFETY LAYER)
    // =========================================================================
    const validated = RpcResponseSchema.safeParse(rpcResult);

    if (!validated.success) {
      console.error("[RPC_INVALID_RESPONSE]", {
        requestId,
        rpcResult,
      });

      return NextResponse.json(
        { error: "Invalid RPC response", requestId },
        { status: 500 }
      );
    }

    // =========================================================================
    // IDEMPOTENCY HANDLING
    // =========================================================================
    if (validated.data.status === "deduplicated") {
      return NextResponse.json({
        status: "success",
        note: "deduplicated",
        requestId,
      });
    }

    // =========================================================================
    // SUCCESS RESPONSE
    // =========================================================================
    return NextResponse.json({
      status: "success",
      queued: validated.data.queued ?? targets.length,
      requestId,
    });
  } catch (error) {
    console.error("[FATAL_ERROR]", error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
        requestId,
      },
      { status: 500 }
    );
  }
}