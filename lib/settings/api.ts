import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { WorkspaceSettingsSchema } from "@/lib/settings/schemas";
import type { Database } from "@/types/supabase";

type TenantSettingsUpdate = Database["public"]["Tables"]["tenant_settings"]["Update"];

const normalizeOptionalString = (value: string | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function handleWorkspaceUpdate(req: Request) {
  try {
    // 1. Clean & Streamlined JSON Parsing
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    // 2. Strict Zod Schema Validation
    const parsed = WorkspaceSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 3. Rule 18: Use SSR-safe Supabase server client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized session." }, { status: 401 });
    }

    // 4. Rule 6: Tenant Isolation & Invariant Verification
    // Using .single() instead of .maybeSingle() to strictly enforce the membership invariant
    // 4. Rule 6: Tenant Isolation & Invariant Verification
    // 4. Rule 6: Tenant Isolation & Invariant Verification
    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    // PGRST116 indicates 0 rows matched .single() (i.e., membership missing)
    // Checking tenantError first prevents TypeScript discriminated union narrowing errors
    const isMissingMembership =
      Boolean(tenantError && tenantError.code === "PGRST116") || !tenantUser?.tenant_id;

    if (tenantError && !isMissingMembership) {
      console.error("[TENANT_CONTEXT_ERROR]", {
        userId: user.id,
        error: tenantError,
      });
      return NextResponse.json(
        { error: "Failed to resolve tenant context." },
        { status: 500 }
      );
    }

    if (isMissingMembership) {
      return NextResponse.json(
        { error: "Forbidden: Tenant membership not resolved." },
        { status: 403 }
      );
    }
    // 5. Destructure validated inputs (including senderEmail)
    const { companyName, replyToEmail, senderEmail } = parsed.data;

    // 6. Fully typed Supabase schema payload with explicit updated_at
    const updatePayload: TenantSettingsUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (companyName !== undefined) {
      updatePayload.company_name = normalizeOptionalString(companyName);
    }

    if (replyToEmail !== undefined) {
      updatePayload.reply_to_email = normalizeOptionalString(replyToEmail);
    }

    // Rule 15: Explicitly map senderEmail -> sender_email for Campaign Delivery
    if (senderEmail !== undefined) {
      updatePayload.sender_email = normalizeOptionalString(senderEmail);
    }

    // Ensure we are actually mutating at least one user-provided configuration field
    if (Object.keys(updatePayload).length <= 1) {
      return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
    }

    // 7. Rule 13 & Rule 6: Strictly scoped atomic update by tenant_id
    const { data: updatedSettings, error: updateError } = await supabase
      .from("tenant_settings")
      .update(updatePayload)
      .eq("tenant_id", tenantUser.tenant_id)
      .select("tenant_id, updated_at")
      .single();

    if (updateError) {
      console.error("[WORKSPACE_UPDATE_ERROR]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
        error: updateError,
      });

      return NextResponse.json(
        { error: "Database failed to persist workspace configuration." },
        { status: 500 }
      );
    }

    // 8. Rule 17: Structured Observability & Audit Logging
    console.info("[WORKSPACE_UPDATED]", {
      tenantId: tenantUser.tenant_id,
      userId: user.id,
      fieldsMutated: Object.keys(updatePayload).filter((k) => k !== "updated_at"),
      timestamp: updatedSettings.updated_at,
    });

    // 9. Instant Cache Invalidation across Next.js App Router
    // Guarantees page refreshes instantly pull the new database state
    revalidatePath("/settings");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/campaigns");

    return NextResponse.json({
      success: true,
      message: "Workspace configuration updated successfully.",
      metadata: {
        tenantId: updatedSettings.tenant_id,
        updatedAt: updatedSettings.updated_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    console.error("[WORKSPACE_API_FATAL]", { message, stack });

    return NextResponse.json(
      { error: "Internal server error during workspace synchronization." },
      { status: 500 }
    );
  }
}