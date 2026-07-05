import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-security";
import { requireQueueOperator } from "../_shared";

const querySchema = z.object({
  item_id: z.string().uuid(),
});

export const GET = withTenant(async (req, { supabase, tenantId, userId }) => {
  const authError = await requireQueueOperator(supabase as any, tenantId, userId);
  if (authError) return authError;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    item_id: url.searchParams.get("item_id"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const itemId = parsed.data.item_id;
  const db = supabase as any;

  const { data: item, error: itemError } = await db
    .from("recovery_emails")
    .select("id, tenant_id, user_id, churn_risk_score")
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    console.error("[QUEUE_EXPLAINABILITY] item lookup failed", {
      tenantId,
      itemId,
      error: itemError,
    });
    return NextResponse.json({ error: "Failed to load queue item" }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  const [
    factorsResult,
    campaignEventsResult,
    manualByUserResult,
    manualByCustomerResult,
    manualByQueueResult,
  ] = await Promise.all([
    db
      .from("risk_score_explanations")
      .select("id, factor, weight, order_index")
      .eq("tenant_id", tenantId)
      .eq("queue_item_id", itemId)
      .order("order_index", { ascending: true }),
    db
      .from("campaign_events")
      .select("id, name, date, status")
      .eq("tenant_id", tenantId)
      .eq("queue_item_id", itemId)
      .order("date", { ascending: false })
      .limit(50),
    db
      .from("manual_interventions")
      .select("id, action, operator_name, date, notes")
      .eq("tenant_id", tenantId)
      .eq("user_id", item.user_id)
      .order("date", { ascending: false })
      .limit(50),
    db
      .from("manual_interventions")
      .select("id, action, operator_name, date, notes")
      .eq("tenant_id", tenantId)
      .eq("customer_id", item.user_id)
      .order("date", { ascending: false })
      .limit(50),
    db
      .from("manual_interventions")
      .select("id, action, operator_name, date, notes")
      .eq("tenant_id", tenantId)
      .eq("queue_item_id", itemId)
      .order("date", { ascending: false })
      .limit(50),
  ]);

  const queryError =
    factorsResult.error ||
    campaignEventsResult.error ||
    manualByUserResult.error ||
    manualByCustomerResult.error ||
    manualByQueueResult.error;

  if (queryError) {
    console.error("[QUEUE_EXPLAINABILITY] detail lookup failed", {
      tenantId,
      itemId,
      error: queryError,
    });
    return NextResponse.json({ error: "Failed to load explainability data" }, { status: 500 });
  }

  const interventionsById = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...(manualByUserResult.data ?? []),
    ...(manualByCustomerResult.data ?? []),
    ...(manualByQueueResult.data ?? []),
  ]) {
    if (row?.id) interventionsById.set(String(row.id), row);
  }

  const factors = factorsResult.data ?? [];
  const factorTotal = factors.reduce(
    (sum: number, factor: { weight?: number }) => sum + Number(factor.weight ?? 0),
    0
  );
  const currentScore = Number(item.churn_risk_score ?? 0);

  return NextResponse.json({
    factors,
    baseline_score: Math.max(0, currentScore - factorTotal),
    campaign_history: campaignEventsResult.data ?? [],
    manual_interventions: Array.from(interventionsById.values()),
  });
});
