// app/api/settings/workspace/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

// ============================================================================
// VALID TIMEZONE REGISTRY
// ============================================================================
const VALID_TIMEZONES = Intl.supportedValuesOf("timeZone");

// ============================================================================
// STRICT VALIDATION SCHEMA
// - Rejects unknown fields
// - Prevents oversized payloads
// - Enforces domain integrity
// ============================================================================
const WorkspaceSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(1, "Company name cannot be empty")
      .max(100, "Company name is too long")
      .optional(),

    // Allows either:
    // - valid email
    // - empty string (unset state)
    replyToEmail: z
      .union([
        z.string().trim().email("Invalid email address"),
        z.literal(""),
      ])
      .optional(),

    timezone: z
      .string()
      .refine(
        (tz) => VALID_TIMEZONES.includes(tz),
        "Invalid timezone"
      )
      .optional(),
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
        { error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    // ==========================================================================
    // PAYLOAD VALIDATION
    // ==========================================================================
    const parsed = WorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

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
        { error: "Unauthorized session." },
        { status: 401 }
      );
    }

    // ==========================================================================
    // RESOLVE TENANT CONTEXT SERVER-SIDE
    // NEVER trust tenant_id from frontend payloads
    // ==========================================================================
    const {
      data: tenantUser,
      error: tenantError,
    } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tenantError) {
      console.error("[TENANT_CONTEXT_ERROR]", {
        userId: user.id,
        error: tenantError,
      });

      return NextResponse.json(
        { error: "Failed to resolve tenant context." },
        { status: 500 }
      );
    }

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant membership not found." },
        { status: 403 }
      );
    }

    // ==========================================================================
    // BUILD SAFE PARTIAL UPDATE PAYLOAD
    // Prevents accidental null/undefined overwrites
    // ==========================================================================
    const {
      companyName,
      replyToEmail,
      timezone,
    } = parsed.data;

    const updatePayload: Record<string, unknown> = {
      ...(companyName !== undefined && {
        company_name: companyName,
      }),

      ...(replyToEmail !== undefined && {
        reply_to_email: replyToEmail,
      }),

      ...(timezone !== undefined && {
        timezone,
      }),
    };

    // ==========================================================================
    // NO-OP PROTECTION
    // ==========================================================================
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update." },
        { status: 400 }
      );
    }

    // ==========================================================================
    // EXECUTE DETERMINISTIC UPDATE
    // .select().single() guarantees:
    // - exactly one row updated
    // - no silent RLS failures
    // - no silent no-op updates
    // ==========================================================================
    const {
      data: updatedSettings,
      error: updateError,
    } = await supabase
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
        {
          error:
            "Database failed to persist workspace configuration.",
        },
        { status: 500 }
      );
    }

    // ==========================================================================
    // SUCCESS RESPONSE
    // ==========================================================================
    return NextResponse.json({
      success: true,
      message: "Workspace configuration updated successfully.",
      metadata: {
        tenantId: updatedSettings.tenant_id,
        updatedAt: updatedSettings.updated_at,
      },
    });
  } catch (error: any) {
    // ==========================================================================
    // FATAL SAFETY NET
    // ==========================================================================
    console.error("[WORKSPACE_API_FATAL]", {
      message: error?.message,
      stack: error?.stack,
    });

    return NextResponse.json(
      {
        error:
          "Internal server error during workspace synchronization.",
      },
      { status: 500 }
    );
  }
}