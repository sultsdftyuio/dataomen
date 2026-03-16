// app/api/insights/[id]/read/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const insightId = params.id;
    
    // FIX: Add 'await' here
    const supabase = await createClient();
    
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Strict Tenant Validation
    const { data: userData } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // 3. Update the insight state (Ensuring tenant_id match prevents IDOR attacks)
    const { error: updateError } = await supabase
      .from("insights")
      .update({ is_read: true, is_dismissed: true })
      .eq("id", insightId)
      .eq("tenant_id", userData.organization_id);

    if (updateError) {
      console.error("Error updating insight:", updateError);
      return NextResponse.json({ error: "Failed to update insight" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("Insights PATCH Exception:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}