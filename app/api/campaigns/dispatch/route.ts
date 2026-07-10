// app/api/campaigns/dispatch/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-security";
import { getWorkspaceEntitlements, PRO_PLAN_REQUIRED_MESSAGE } from "@/lib/entitlements";
import crypto from "crypto";

export const runtime = "nodejs";

const riskScoreSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  z.coerce.number().int().min(0).max(100).nullable()
);

const targetSchema = z
  .object({
    id: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().email(),
    signal: z.string().trim().optional().default("Green / Healthy"),
    riskScore: riskScoreSchema.optional().default(null),
  })
  .passthrough();

const dispatchSchema = z.object({
  templateId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  audienceSegment: z.enum(["all", "at_risk"]).optional().default("all"),
  targets: z
    .array(targetSchema)
    .min(1)
    .max(500),
});

type DispatchTarget = z.infer<typeof targetSchema>;
type CanonicalDispatchTarget = {
  id: string;
  email: string;
  signal: string;
  riskScore: number | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashDispatchRequest = (
  templateId: string,
  audienceSegment: string,
  targets: CanonicalDispatchTarget[]
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
    .update(JSON.stringify({ templateId, audienceSegment, targets: canonicalTargets }))
    .digest("hex");
};

async function canonicalizeTenantTargets(
  supabase: any,
  tenantId: string,
  targets: DispatchTarget[]
): Promise<{ targets: CanonicalDispatchTarget[] } | { response: NextResponse }> {
  const targetIds = Array.from(new Set(targets.map((target) => target.id)));

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .in("id", targetIds)
    .limit(targetIds.length);

  if (error) {
    console.error("[CAMPAIGN_DISPATCH] Target validation failed:", {
      tenantId,
      error,
    });
    return {
      response: NextResponse.json(
        { error: "Failed to validate campaign targets" },
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
        { error: "One or more campaign targets do not belong to this workspace" },
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

    const { templateId, targets, idempotencyKey, audienceSegment } = parsed.data;
    const canonicalized = await canonicalizeTenantTargets(
      supabase,
      tenantId,
      targets
    );

    if ("response" in canonicalized) {
      return canonicalized.response;
    }

    const canonicalTargets = canonicalized.targets;
    const requestHash = hashDispatchRequest(
      templateId,
      audienceSegment,
      canonicalTargets
    );

    let data: unknown = null;
    let error: { message?: string } | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rpcResult = await (supabase as any).rpc("dispatch_campaign_atomic", {
        p_tenant_id: tenantId,
        p_template_id: templateId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_targets: canonicalTargets,
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
        : canonicalTargets.length;

    if (deduplicated) {
      return NextResponse.json({ status: "success", note: "deduplicated", queued });
    }

    return NextResponse.json({ status: "success", queued });
  } catch (error) {
    console.error("[CAMPAIGN_DISPATCH] Fatal error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
