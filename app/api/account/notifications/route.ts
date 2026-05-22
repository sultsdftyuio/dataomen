// app/api/settings/notifications/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

// ============================================================================
// STRICT VALIDATION SCHEMA
// ============================================================================

const NotificationSettingsSchema = z
  .object({
    notifyAnomalies: z.boolean({
      required_error: "notifyAnomalies flag is required.",
    }),

    notifyWeekly: z.boolean({
      required_error: "notifyWeekly flag is required.",
    }),
  })
  .strict();

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(req: Request) {
  try {
    // ==========================================================================
    // SAFE JSON PARSING
    // ==========================================================================

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON payload.",
        },
        { status: 400 }
      );
    }

    // ==========================================================================
    // STRICT PAYLOAD VALIDATION
    // ==========================================================================

    const parsed = NotificationSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid notification settings payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { notifyAnomalies, notifyWeekly } = parsed.data;

    // ==========================================================================
    // AUTHENTICATED SERVER CLIENT
    // ==========================================================================

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized session.",
        },
        { status: 401 }
      );
    }

    // ==========================================================================
    // RESOLVE TENANT CONTEXT SERVER-SIDE
    // NEVER trust tenant identifiers from the client
    // ==========================================================================

    const {
      data: tenantUser,
      error: tenantError,
    } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Infrastructure / database failure
    if (tenantError) {
      console.error("[NOTIFICATION_SETTINGS_TENANT_LOOKUP_ERROR]", {
        userId: user.id,
        error: tenantError,
      });

      return NextResponse.json(
        {
          error: "Failed to resolve tenant context.",
        },
        { status: 500 }
      );
    }

    // Authenticated but not attached to tenant
    if (!tenantUser) {
      return NextResponse.json(
        {
          error: "Tenant membership not found.",
        },
        { status: 403 }
      );
    }

    // ==========================================================================
    // OPTIONAL READ FOR IDEMPOTENT SHORT-CIRCUIT
    // Avoid unnecessary writes/triggers/realtime broadcasts
    // ==========================================================================

    const {
      data: existingSettings,
      error: existingSettingsError,
    } = await supabase
      .from("tenant_settings")
      .select(
        `
          notify_anomalies,
          notify_weekly,
          updated_at
        `
      )
      .eq("tenant_id", tenantUser.tenant_id)
      .maybeSingle();

    if (existingSettingsError) {
      console.error("[NOTIFICATION_SETTINGS_READ_ERROR]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
        error: existingSettingsError,
      });

      return NextResponse.json(
        {
          error: "Failed to retrieve existing notification settings.",
        },
        { status: 500 }
      );
    }

    // Tenant settings row missing
    if (!existingSettings) {
      return NextResponse.json(
        {
          error: "Tenant settings record not found.",
        },
        { status: 404 }
      );
    }

    // ==========================================================================
    // IDEMPOTENT NO-OP SHORT-CIRCUIT
    // ==========================================================================

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

    // ==========================================================================
    // EXECUTE DETERMINISTIC UPDATE
    // ==========================================================================

    const {
      data: updatedSettings,
      error: updateError,
    } = await supabase
      .from("tenant_settings")
      .update({
        notify_anomalies: notifyAnomalies,
        notify_weekly: notifyWeekly,
      })
      .eq("tenant_id", tenantUser.tenant_id)
      .select(
        `
          tenant_id,
          updated_at
        `
      )
      .maybeSingle();

    if (updateError) {
      console.error("[NOTIFICATION_SETTINGS_UPDATE_ERROR]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
        error: updateError,
      });

      return NextResponse.json(
        {
          error:
            "Database failed to persist notification settings.",
        },
        { status: 500 }
      );
    }

    // RLS blocked update OR row disappeared
    if (!updatedSettings) {
      console.error("[NOTIFICATION_SETTINGS_UPDATE_EMPTY]", {
        tenantId: tenantUser.tenant_id,
        userId: user.id,
      });

      return NextResponse.json(
        {
          error:
            "Notification settings could not be updated.",
        },
        { status: 404 }
      );
    }

    // ==========================================================================
    // SUCCESS RESPONSE
    // ==========================================================================

    return NextResponse.json({
      success: true,
      message:
        "Notification settings updated successfully.",
      metadata: {
        tenantId: updatedSettings.tenant_id,
        updatedAt: updatedSettings.updated_at,
        noChangesApplied: false,
      },
    });
  } catch (error: unknown) {
    // ==========================================================================
    // FATAL SAFETY NET
    // ==========================================================================

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error";

    const stack =
      error instanceof Error
        ? error.stack
        : undefined;

    console.error("[NOTIFICATION_SETTINGS_FATAL]", {
      message,
      stack,
    });

    return NextResponse.json(
      {
        error:
          "Internal server error during notification settings update.",
      },
      { status: 500 }
    );
  }
}