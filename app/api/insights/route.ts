// app/api/insights/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    // FIX: Add 'await' here
    const supabase = await createClient();
    
    // 1. Authenticate user via Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Security by Design: Resolve the Tenant ID (Organization)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const tenantId = userData.organization_id;

    // 3. Parse limits
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    // 4. Fetch the Dashboard Feed
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
      console.error("Error fetching insights:", insightsError);
      return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
    }

    return NextResponse.json(insights || []);
    
  } catch (error) {
    console.error("Insights API Exception:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}