import { NextResponse } from "next/server";
import { handleWorkspaceUpdate } from "@/lib/settings/api";
import { createClient } from "@/utils/supabase/server";

// Expanded to match the comprehensive DB schema phases used by the worker pipeline
type WorkspacePhase = 
  | "PENDING" 
  | "PROVISIONING" 
  | "SYNCING" 
  | "INDEXING" 
  | "INTEGRATION" 
  | "BACKFILLING" 
  | "READY" 
  | "FAILED"
  | "SUSPENDED"
  | "ARCHIVED"
  | "DELETED";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
    NextResponse.json(body, {
        ...init,
        headers: {
            "Cache-Control": "no-store",
            ...(init?.headers ?? {}),
        },
    });

export async function GET() {
    const supabase = await createClient();
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // 1. Resolve User -> Tenant Mapping safely
    const { data: mapping, error: mappingError } = await supabase
        .from("tenant_users")
        .select("tenant_id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (mappingError) {
        return jsonResponse({ error: "Failed to resolve workspace mapping." }, { status: 500 });
    }

    // 2. Race Condition Safe: Mapping not committed yet
    if (!mapping?.tenant_id) {
        return jsonResponse(
            {
                status: "PROVISIONING" as WorkspacePhase,
                phase: "PROVISIONING" as WorkspacePhase,
                message: "Provisioning your workspace.",
            },
            { status: 200 }
        );
    }

    // 3. FIX: Reverted to 'status' as 'provisioning_status' is not in types/supabase.ts
    const { data: tenantRow, error: tenantError } = await supabase
        .from("tenants")
        .select("status")
        .eq("tenant_id", String(mapping.tenant_id))
        .maybeSingle();

    if (tenantError) {
        return jsonResponse({ error: "Failed to resolve workspace phase." }, { status: 500 });
    }

    // 4. Cast using the correct column
    const phase = (tenantRow?.status as WorkspacePhase | undefined) ?? "PROVISIONING";
    
    // 5. Semantic Messaging
    let message = "Provisioning your workspace.";
    switch (phase) {
        case "INTEGRATION":
            message = "Waiting for the Stripe connection to be completed.";
            break;
        case "BACKFILLING":
            message = "Building your baseline from recent Stripe history.";
            break;
        case "SYNCING":
        case "INDEXING":
            message = "Connecting integrations and preparing intelligence baseline...";
            break;
        case "FAILED":
            message = "Provisioning failed. Please contact support.";
            break;
        case "READY":
            message = "Workspace ready.";
            break;
    }

    return jsonResponse({
        status: phase, // Legacy fallback field, consider deprecating in frontend
        phase,
        message,
        tenantId: String(mapping.tenant_id),
        userId: String(mapping.user_id ?? user.id),
    });
}

// Retain the POST handler for settings API compatibility
export const POST = handleWorkspaceUpdate;