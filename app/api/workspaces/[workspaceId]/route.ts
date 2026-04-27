import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceDocument } from "@/lib/workspace-store";

/**
 * Phase 3.2 — Workspace Fetch API Route
 *
 * Used by AnalyticsDashboard to hydrate a workspace from the URL parameter.
 * Checks the Redis/local workspace-store first, then falls back to the
 * FastAPI backend persistence layer.
 *
 * GET /api/workspaces/[workspaceId]
 */

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ROUTE_HANDLER = "/api/workspaces/[workspaceId]";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await context.params;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing workspace id." },
        { status: 400 }
      );
    }

    // ── Auth Guard ──
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = user.app_metadata?.tenant_id || user.id;

    // ── Strategy 1: Check Next.js workspace-store (Redis/local cache) ──
    const wsDoc = await getWorkspaceDocument(workspaceId);
    if (wsDoc && wsDoc.tenantId === tenantId) {
      return NextResponse.json(
        {
          workspace_id: wsDoc.id,
          tenant_id: wsDoc.tenantId,
          prompt: wsDoc.prompt,
          summary: wsDoc.narrative && typeof wsDoc.narrative === "object" ? String((wsDoc.narrative as Record<string, unknown>)?.summary ?? "") : "",
          chart_spec: wsDoc.widgets?.[0]?.chartSpec || wsDoc.widgets?.[0]?.vegaLiteSpec || null,
          sql_query: wsDoc.sql || wsDoc.widgets?.[0]?.query || null,
          insight_payload: wsDoc.insights || null,
          narrative: wsDoc.narrative || null,
          data_snapshot: wsDoc.widgets?.[0]?.data || [],
          created_at: wsDoc.createdAt,
        },
        { status: 200, headers: { "X-Route-Handler": ROUTE_HANDLER, "X-Source": "workspace-store" } }
      );
    }

    // ── Strategy 2: Fall back to FastAPI backend persistence layer ──
    const backendUrl = process.env.PYTHON_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
    if (backendUrl) {
      try {
        const backendRes = await fetch(
          `${backendUrl}/api/chat/orchestrate/workspace/${encodeURIComponent(workspaceId)}`,
          {
            headers: {
              "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
              "X-Tenant-ID": tenantId,
            },
            cache: "no-store",
          }
        );

        if (backendRes.ok) {
          const payload = await backendRes.json();
          return NextResponse.json(payload, {
            status: 200,
            headers: { "X-Route-Handler": ROUTE_HANDLER, "X-Source": "backend-persistence" },
          });
        }
      } catch (backendErr) {
        console.warn("[Workspace Fetch] Backend fallback failed:", backendErr);
      }
    }

    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404, headers: { "X-Route-Handler": ROUTE_HANDLER } }
    );
  } catch (error) {
    console.error("[Workspace Fetch] Route error:", error);
    return NextResponse.json(
      { error: "Failed to load workspace." },
      { status: 500 }
    );
  }
}
