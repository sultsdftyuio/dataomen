import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export async function POST(request: Request) {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const { notifyAnomalies, notifyWeekly } = (payload || {}) as {
    notifyAnomalies?: unknown;
    notifyWeekly?: unknown;
  };

  if (typeof notifyAnomalies !== "boolean" || typeof notifyWeekly !== "boolean") {
    return NextResponse.json(
      { error: "Invalid notification settings" },
      { status: 400 }
    );
  }

  const { supabase, tenantId } = tenantResult.context;

  const { error } = await supabase
    .from("tenant_settings")
    .upsert(
      {
        tenant_id: tenantId,
        notify_anomalies: notifyAnomalies,
        notify_weekly: notifyWeekly,
      },
      { onConflict: "tenant_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
