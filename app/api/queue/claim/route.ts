import { NextResponse } from "next/server";
import { withTenant } from "@/lib/api-security";
import { parseQueueItemBody, requireQueueOperator, resolveOperatorName } from "../_shared";

export const POST = withTenant(async (req, { supabase, tenantId, userId }) => {
  const authError = await requireQueueOperator(supabase as any, tenantId, userId);
  if (authError) return authError;

  const parsed = await parseQueueItemBody(req);
  if (parsed.error) return parsed.error;
  const itemId = parsed.itemId;
  if (!itemId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const operatorName = await resolveOperatorName(supabase as any, userId);
  const { error } = await (supabase as any).rpc("claim_account_intervention", {
    p_tenant_id: tenantId,
    p_item_id: itemId,
    p_operator_id: userId,
    p_operator_name: operatorName,
  });

  if (error) {
    console.error("[QUEUE_CLAIM] failed", { tenantId, itemId, userId, error });
    return NextResponse.json(
      { error: error.message ?? "Failed to claim queue item" },
      { status: 409 }
    );
  }

  return NextResponse.json({ status: "success" });
});
