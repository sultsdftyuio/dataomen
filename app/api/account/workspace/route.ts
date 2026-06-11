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

    // 2. Race Condition Safe: Active Self-Healing Protocol
    // If the user is polling but has no mapping, do not passively wait for a timeout.
    // Enforce Architecture Rule 1 and heal the state synchronously.
    if (!mapping?.tenant_id) {
        console.info("[Workspace API] Missing mapping detected during poll. Initiating active self-healing.", { userId: user.id });

        // Deterministic company name derivation matching the auth callback logic
        const email = user.email || '';
        const rawCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace';
        const fallbackCompany = rawCompany.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace';
        const workspaceName = `${fallbackCompany.charAt(0).toUpperCase() + fallbackCompany.slice(1)} Workspace`;

        // Execute idempotent RPC to enforce synchronous identity mapping
        const { error: healError } = await supabase.rpc('provision_initial_workspace', {
            target_user_id: user.id,
            default_name: workspaceName,
        });

        if (healError) {
            console.error("[Workspace API] CRITICAL: Self-healing RPC failed", {
                userId: user.id,
                error: healError
            });
        }

        // Return a 200 so the frontend continues to poll safely. The next cycle will find the created mapping.
        return jsonResponse(
            {
                status: "PROVISIONING" as WorkspacePhase,
                phase: "PROVISIONING" as WorkspacePhase,
                message: "Securing your workspace...",
            },
            { status: 200 } 
        );
    }

    // 3. Status Query
    // Note: Kept as 'status' based on types/supabase.ts availability. 
    // Ensure this perfectly aligns with the actual column name in your production database.
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