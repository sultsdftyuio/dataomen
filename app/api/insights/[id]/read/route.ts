// app/api/insights/[id]/read/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const ROUTE_LAYER = "next-app-router";
const ROUTE_HANDLER = "/api/insights/[id]/read";

const routeTraceHeaders = {
  "X-Route-Layer": ROUTE_LAYER,
  "X-Route-Handler": ROUTE_HANDLER,
};

const logRouteTrace = (event: string, data: Record<string, unknown> = {}) => {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event,
      layer: ROUTE_LAYER,
      handler: ROUTE_HANDLER,
      ...data,
    })
  );
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  logRouteTrace("route_trace", { method: request.method });
  try {
    const { id: insightId } = await context.params;
    
    // FIX: Add 'await' here
    const supabase = await createClient();
    
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: routeTraceHeaders });
    }

    // 2. Strict Tenant Validation
    const { data: userData } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404, headers: routeTraceHeaders });
    }

    // 3. Update the insight state (Ensuring tenant_id match prevents IDOR attacks)
    const { error: updateError } = await supabase
      .from("insights")
      .update({ is_read: true, is_dismissed: true })
      .eq("id", insightId)
      .eq("tenant_id", userData.organization_id);

    if (updateError) {
      console.error("Error updating insight:", updateError);
      return NextResponse.json({ error: "Failed to update insight" }, { status: 500, headers: routeTraceHeaders });
    }

    return NextResponse.json({ success: true }, { headers: routeTraceHeaders });
    
  } catch (error) {
    console.error("Insights PATCH Exception:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: routeTraceHeaders });
  }
}