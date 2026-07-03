import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { WorkspaceSettingsSchema } from "@/lib/settings/schemas";

const normalizeOptionalString = (value: string | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function handleWorkspaceUpdate(req: Request) {
  try {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = WorkspaceSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Rule 18: Use SSR-safe Supabase server client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized session." }, { status: 401 });
    }

    // Rule 6: Tenant Isolation & Verification
    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tenantError) {
      console.error("[TENANT_CONTEXT_ERROR]", {
        userId: user.id,
        error: tenantError,
      });

      return NextResponse.json({ error: "Failed to resolve tenant context." }, { status: 500 });
    }

    if (!tenantUser) {
      return NextResponse.json({ error: "Tenant membership not found." }, { status: 403 });
    }

    // 🚨 CRITICAL FIX: Destructure senderEmail alongside companyName and replyToEmail
    const { companyName, replyToEmail, senderEmail } = parsed.data;

    // Explicit typing to satisfy Supabase v2 strict property definitions
    const updatePayload: {
      company_name?: string | null;
      reply_to_email?: string | null;
      sender_email?: string | null;
    } = {};

    if (companyName !== undefined) {
      updatePayload.company_name = normalizeOptionalString(companyName);
    }

    if (replyToEmail !== undefined) {
      updatePayload.reply_to_email = normalizeOptionalString(replyToEmail);
    }

    // Map senderEmail to sender_email database column for Campaign Delivery (Rule 15)
    if (senderEmail !== undefined) {
      updatePayload.sender_email = normalizeOptionalString(senderEmail);
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
    }

    // Rule 6: Strictly scope update by tenant_id
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