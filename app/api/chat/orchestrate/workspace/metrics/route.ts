import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

// Optional: Point to your Python backend when you are ready to wire up DuckDB/Supabase
// const BACKEND_URL = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  try {
    // 1. Authentication & Tenant Isolation
    // Validate session on the edge to prevent unauthorized data access
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      return NextResponse.json(
        { error: "Unauthorized: Session expired or invalid." }, 
        { status: 401 }
      );
    }

    const tenant_id = session.user.id;

    // 2. Data Aggregation (Currently returning the real "Empty State")
    // TODO: In the future, replace this payload by fetching real aggregations 
    // for this specific tenant_id from your Python Engine or Supabase directly.
    
    const payload = {
      metrics: {
        totalDatasets: 0,
        activeAgents: 0,
        queriesRun: 0,
        healthScore: 100, // System is online and healthy, just empty
      },
      chartData: [],
      agents: [],
      alerts: []
    };

    // 3. Return Clean Data
    return NextResponse.json(payload, { status: 200 });

  } catch (error: any) {
    console.error("[Workspace Metrics] Edge Route Error:", error);
    return NextResponse.json(
      { error: "A critical error occurred while fetching workspace metrics." },
      { status: 500 }
    );
  }
}