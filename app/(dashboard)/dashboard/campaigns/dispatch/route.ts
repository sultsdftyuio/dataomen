import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";
import { z } from "zod";

// ============================================================================
// RUNTIME — explicit Node.js to avoid Edge incompatibilities with `crypto`
// ============================================================================
export const runtime = "nodejs";

// ============================================================================
// VALIDATION LAYER
// ============================================================================
const DispatchSchema = z.object({
  templateId: z.string().min(1),
  idempotencyKey: z.string().max(128),
  targets: z
    .array(
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
// RPC RESPONSE TYPE + VALIDATION
// Discriminated union prevents impossible states (e.g. status:"success" with
// no queued count, or a queued count on a deduplicated response).
// "pending" is intentionally excluded — it is handled by the retry loop before
// we ever reach schema validation.
// ============================================================================
type RpcResponse =
  | { status: "success"; queued: number }
  | { status: "deduplicated" }
  | { status: "pending" };

const RpcResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    queued: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("deduplicated"),
  }),
]);

// ============================================================================
// HELPERS — defined outside POST to avoid per-request allocations
// ============================================================================
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function getRpcStatus(value: unknown): string | null {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result || typeof result !== "object") return null;
  return "status" in result
    ? (result as { status?: string }).status ?? null
    : null;
}

// ============================================================================
// OPTIONAL: RATE LIMIT HOOK (plug Redis or Upstash here)
// ============================================================================
async function checkRateLimit(_tenantId: string): Promise<boolean> {
  // TODO: replace with real rate limiter (Redis / Upstash / etc.)
  return true;
}

// ============================================================================
// HANDLER
// ============================================================================
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
    // Message key is intentionally generated here — keeps hashing logic in the
    // application layer and the database focused on persistence.
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
    // The retry loop exists only to handle a "pending" status that your RPC can
    // legitimately return while a concurrent dispatch is in flight.
    // If dispatch_campaign_atomic can never return "pending", collapse this to a
    // single await supabase.rpc(...) call and remove getRpcStatus/delay.
    // =========================================================================
    let rpcResult: RpcResponse | null = null;
    let rpcError: { message?: string } | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await supabase.rpc("dispatch_campaign_atomic", {
        p_tenant_id: tenantId,
        p_idempotency_key: idempotencyKey,
        p_outbox_payloads: outboxPayloads,
      });

      rpcResult = response.data as RpcResponse | null;
      rpcError = response.error;

      if (rpcError) break;

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
        userId: user.id,
        templateId,
        targetCount: targets.length,
        idempotencyKey,
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
        tenantId,
        userId: user.id,
        templateId,
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
    // SUCCESS
    // TypeScript narrows validated.data to the "success" branch here, so
    // .queued is guaranteed to be a non-negative integer by the schema.
    // =========================================================================
    const { queued } = validated.data;

    console.info("[DISPATCH_SUCCESS]", {
      requestId,
      tenantId,
      userId: user.id,
      templateId,
      queued,
      targetCount: targets.length,
    });

    return NextResponse.json({ status: "success", queued, requestId });
  } catch (error) {
    console.error("[FATAL_ERROR]", { requestId, error });

    return NextResponse.json(
      { error: "Internal Server Error", requestId },
      { status: 500 }
    );
  }
}