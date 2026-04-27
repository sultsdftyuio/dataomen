import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceDocument } from "@/lib/workspace-store";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ROUTE_LAYER = "next-app-router";
const ROUTE_HANDLER = "/api/chat/orchestrate/workspace/[workspaceId]";

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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  logRouteTrace("route_trace", { method: req.method });

  try {
    const { workspaceId } = await context.params;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing workspace id." },
        { status: 400, headers: routeTraceHeaders }
      );
    }

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

    const tenantId = user.app_metadata?.tenant_id || user.id;
    const workspace = await getWorkspaceDocument(workspaceId);

    if (!workspace || workspace.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404, headers: routeTraceHeaders }
      );
    }

    return NextResponse.json(
      {
        workspaceId: workspace.id,
        narrative: workspace.narrative,
        widgets: workspace.widgets,
        createdAt: workspace.createdAt,
      },
      { status: 200, headers: routeTraceHeaders }
    );
  } catch (error) {
    console.error("[Workspace Lookup] Route error:", error);
    return NextResponse.json(
      { error: "Failed to load workspace." },
      { status: 500, headers: routeTraceHeaders }
    );
  }
}
