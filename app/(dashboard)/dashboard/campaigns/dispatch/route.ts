import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";
import { z } from "zod";
import { getWorkspaceEntitlements, PRO_PLAN_REQUIRED_MESSAGE } from "@/lib/entitlements";

// ============================================================================
// RUNTIME — explicit Node.js to avoid Edge incompatibilities with `crypto`
// ============================================================================
export const runtime = "nodejs";

// ============================================================================
// VALIDATION LAYER
// ============================================================================
const RiskScoreSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  z.coerce.number().int().min(0).max(100).nullable()
);

const TargetSchema = z.object({
  id: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  signal: z.string().optional().default("Green / Healthy"),
  riskScore: RiskScoreSchema.optional().default(null),
});

const DispatchSchema = z.object({
  templateId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  audienceSegment: z.enum(["all", "at_risk"]).optional().default("all"),
  targets: z
    .array(TargetSchema)
    .min(1)
    .max(500),
});

type DispatchTarget = z.infer<typeof TargetSchema>;
type CanonicalDispatchTarget = {
  id: string;
  email: string;
  signal: string;
  riskScore: number | null;
};

// ============================================================================
// RPC RESPONSE TYPE + VALIDATION
// Discriminated union prevents impossible states (e.g. status:"success" with
// no queued count, or a queued count on a deduplicated response).
// "pending" is intentionally excluded — it is handled by the retry loop before
// we ever reach schema validation.
// ============================================================================
type RpcResponse =
  | { status: "success"; queued: number }
  | { status: "queued"; queued: number }
  | { status: "deduplicated" }
  | { status: "pending" };

const RpcResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    queued: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("queued"),
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

    const entitlements = await getWorkspaceEntitlements(supabase as any, tenantId);
    if (!entitlements.canSendEmails) {
      return NextResponse.json(
        { error: PRO_PLAN_REQUIRED_MESSAGE, code: "pro_plan_required", requestId },
        { status: 403 }
      );
    }

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

    const { templateId, targets, idempotencyKey, audienceSegment } = parsed.data;
    const canonicalized = await canonicalizeTenantTargets(
      supabase,
      tenantId,
      targets,
      requestId
    );

    if ("response" in canonicalized) {
      return canonicalized.response;
    }

    const canonicalTargets = canonicalized.targets;

    // =========================================================================
    // TRANSFORM PAYLOAD (WORKER-READY OUTBOX ROWS)
    // Message key is intentionally generated here — keeps hashing logic in the
    // application layer and the database focused on persistence.
    // =========================================================================
    const requestHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          templateId,
          audienceSegment,
          targets: canonicalTargets
            .map((target) => ({
              id: target.id,
              email: target.email,
              signal: target.signal,
              riskScore: target.riskScore,
            }))
            .sort((a, b) => a.id.localeCompare(b.id) || a.email.localeCompare(b.email)),
        })
      )
      .digest("hex");

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
        p_template_id: templateId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_targets: canonicalTargets,
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
        targetCount: canonicalTargets.length,
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
      targetCount: canonicalTargets.length,
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

async function canonicalizeTenantTargets(
  supabase: any,
  tenantId: string,
  targets: DispatchTarget[],
  requestId: string
): Promise<{ targets: CanonicalDispatchTarget[] } | { response: NextResponse }> {
  const targetIds = Array.from(new Set(targets.map((target) => target.id)));

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .in("id", targetIds)
    .limit(targetIds.length);

  if (error) {
    console.error("[TARGET_VALIDATION_ERROR]", {
      requestId,
      tenantId,
      error,
    });
    return {
      response: NextResponse.json(
        { error: "Failed to validate campaign targets", requestId },
        { status: 500 }
      ),
    };
  }

  const profilesById = new Map(
    ((data || []) as Array<{ id?: string | null; email?: string | null }>)
      .filter((row) => row.id)
      .map((row) => [String(row.id), row])
  );
  const missingIds = targetIds.filter((id) => !profilesById.has(id));

  if (missingIds.length > 0) {
    return {
      response: NextResponse.json(
        {
          error: "One or more campaign targets do not belong to this workspace",
          requestId,
        },
        { status: 400 }
      ),
    };
  }

  return {
    targets: targets.map((target) => {
      const profile = profilesById.get(target.id);
      const canonicalEmail = profile?.email?.trim().toLowerCase() || target.email;

      return {
        id: target.id,
        email: canonicalEmail,
        signal: target.signal?.trim() || "Green / Healthy",
        riskScore: target.riskScore ?? null,
      };
    }),
  };
}
