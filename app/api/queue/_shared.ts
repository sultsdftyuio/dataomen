import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceEntitlements } from "@/lib/entitlements";

export const queueItemBodySchema = z.object({
  item_id: z.string().uuid(),
});

const ALLOWED_ROLES = new Set(["owner", "admin", "operator"]);

export async function requireQueueOperator(
  supabase: any,
  tenantId: string,
  userId: string
): Promise<NextResponse | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 403 }
    );
  }

  const role = String(membership.role || "").toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json(
      { error: "Insufficient permissions", code: "insufficient_role" },
      { status: 403 }
    );
  }

  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);
  if (!entitlements.isPro) {
    return NextResponse.json(
      {
        error: entitlements.restrictionMessage ?? "Upgrade to Pro to manage customer operations.",
        code: "pro_plan_required",
      },
      { status: 403 }
    );
  }

  return null;
}

type ParseQueueItemBodyResult =
  | { itemId: string; error?: never }
  | { error: NextResponse; itemId?: never };

export async function parseQueueItemBody(req: Request): Promise<ParseQueueItemBodyResult> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }) };
  }

  const parsed = queueItemBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      ),
    };
  }

  return { itemId: parsed.data.item_id };
}

export async function resolveOperatorName(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return (
    profile?.full_name ||
    profile?.email ||
    userId
  );
}
