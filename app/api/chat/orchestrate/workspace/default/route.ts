import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getDefaultExecutiveWidgets } from "@/lib/workspace-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ROUTE_LAYER = "next-app-router";
const ROUTE_HANDLER = "/api/chat/orchestrate/workspace/default";

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

export async function GET(req: NextRequest) {
  logRouteTrace("route_trace", { method: req.method });

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: routeTraceHeaders }
      );
    }

    return NextResponse.json(
      {
        workspaceId: null,
        narrative: "Default executive layout loaded.",
        widgets: getDefaultExecutiveWidgets(),
        createdAt: new Date().toISOString(),
      },
      { status: 200, headers: routeTraceHeaders }
    );
  } catch (error) {
    console.error("[Workspace Default] Route error:", error);
    return NextResponse.json(
      { error: "Failed to load default layout." },
      { status: 500, headers: routeTraceHeaders }
    );
  }
}
