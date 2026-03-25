// app/api/insights/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    // 1. Authenticate user via Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session." }, 
        { status: 401 }
      );
    }

    // 2. Security by Design: Resolve the Tenant ID (Organization)
    // We use maybeSingle() instead of single() to prevent PostgREST from throwing a 406 error 
    // if the user row doesn't exist yet (e.g., race condition right after signup).
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (userError) {
      console.error("[Insights API] User lookup error:", userError);
      // Do not hard-fail; proceed to fallback.
    }

    // Graceful Fallback: If no organization is assigned, the user's ID acts as their personal tenant space.
    const tenantId = userData?.organization_id || user.id;

    // 3. Parse limits safely
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    // Default to 5, clamp to a maximum of 50 to prevent accidental heavy loads
    const limit = Math.min(parseInt(limitParam || "5", 10), 50);

    // 4. Fetch the Dashboard Feed (Vectorized/Columnar prioritization)
    // Prioritizes Critical Business Impact first, then recency
    const { data: insights, error: insightsError } = await supabase
      .from("insights")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_read", false) 
      .eq("is_dismissed", false)
      .order("impact_score", { ascending: false }) // The autonomous ranking algorithm
      .order("created_at", { ascending: false })
      .limit(limit);

    if (insightsError) {
      console.error("[Insights API] Database retrieval error:", insightsError);
      return NextResponse.json(
        { error: "Failed to fetch autonomous insights from the engine." }, 
        { status: 500 }
      );
    }

    // Return the payload (ensuring an empty array is returned instead of null on zero results)
    return NextResponse.json(insights || [], { status: 200 });
    
  } catch (error) {
    console.error("[Insights API] Critical Exception:", error);
    return NextResponse.json(
      { error: "Internal Server Error during insight generation." }, 
      { status: 500 }
    );
  }
}