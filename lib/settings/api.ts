import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { NotificationSettingsSchema, WorkspaceSettingsSchema } from "@/lib/settings/schemas";

const normalizeOptionalString = (value: string | undefined) => {
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

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized session." }, { status: 401 });
    }

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

    const { companyName, replyToEmail, timezone } = parsed.data;

    const updatePayload: Record<string, string | null> = {
      ...(companyName !== undefined && {
        company_name: normalizeOptionalString(companyName),
      }),
      ...(replyToEmail !== undefined && {
        reply_to_email: normalizeOptionalString(replyToEmail),
      }),
      ...(timezone !== undefined && {
        timezone,
      }),
    };

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
    }

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

export async function handleNotificationsUpdate(req: Request) {
  try {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = NotificationSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid notification settings payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { notifyAnomalies, notifyWeekly } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized session." }, { status: 401 });
    }

    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tenantError) {
      console.error("[NOTIFICATION_SETTINGS_TENANT_LOOKUP_ERROR]", {
        userId: user.id,
        error: tenantError,
      });

      return NextResponse.json({ error: "Failed to resolve tenant context." }, { status: 500 });
    }

    if (!tenantUser) {
      return NextResponse.json({ error: "Tenant membership not found." }, { status: 403 });
    }

    const { data: existingSettings, error: existingSettingsError } = await supabase
      .from("tenant_settings")
      .select("notify_anomalies, notify_weekly, updated_at")
      .eq("tenant_id", tenantUser.tenant_id)
      .maybeSingle();

    if (existingSettingsError) {
      console.error("[NOTIFICATION_SETTINGS_READ_ERROR]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
        error: existingSettingsError,
      });

      return NextResponse.json(
        { error: "Failed to retrieve existing notification settings." },
        { status: 500 }
      );
    }

    if (!existingSettings) {
      return NextResponse.json({ error: "Tenant settings record not found." }, { status: 404 });
    }

    const unchanged =
      existingSettings.notify_anomalies === notifyAnomalies &&
      existingSettings.notify_weekly === notifyWeekly;

    if (unchanged) {
      return NextResponse.json({
        success: true,
        message: "Notification settings already up to date.",
        metadata: {
          tenantId: tenantUser.tenant_id,
          updatedAt: existingSettings.updated_at,
          noChangesApplied: true,
        },
      });
    }

    const { data: updatedSettings, error: updateError } = await supabase
      .from("tenant_settings")
      .update({
        notify_anomalies: notifyAnomalies,
        notify_weekly: notifyWeekly,
      })
      .eq("tenant_id", tenantUser.tenant_id)
      .select("tenant_id, updated_at")
      .maybeSingle();

    if (updateError) {
      console.error("[NOTIFICATION_SETTINGS_UPDATE_ERROR]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
        error: updateError,
      });

      return NextResponse.json(
        { error: "Database failed to persist notification settings." },
        { status: 500 }
      );
    }

    if (!updatedSettings) {
      console.error("[NOTIFICATION_SETTINGS_UPDATE_EMPTY]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
      });

      return NextResponse.json(
        { error: "Notification settings could not be updated." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification settings updated successfully.",
      metadata: {
        tenantId: updatedSettings.tenant_id,
        updatedAt: updatedSettings.updated_at,
        noChangesApplied: false,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    console.error("[NOTIFICATION_SETTINGS_FATAL]", { message, stack });

    return NextResponse.json(
      { error: "Internal server error during notification settings update." },
      { status: 500 }
    );
  }
}
