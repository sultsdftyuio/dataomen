// lib/settings/api.ts
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
      // Rule 17: Structured observability with sanitized payload inspection (prevents PII leakage)
      const receivedKeys =
        body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body as Record<string, unknown>)
          : typeof body;

      console.warn("[WORKSPACE_UPDATE_VALIDATION_FAILED]", {
        errors: parsed.error.flatten(),
        receivedKeys,
      });

      return NextResponse.json(
        { error: "Invalid configuration payload.", details: parsed.error.flatten() },
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
    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

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

    // 5. Destructure validated inputs
    const { companyName, replyToEmail, senderEmail, fullName } = parsed.data;

    let profileUpdated = false;

    // Synchronize user profile full name in Supabase Auth Metadata if provided
    if (fullName !== undefined) {
      const normalizedIncomingName = normalizeOptionalString(fullName) ?? "";
      
      // REFINED: Normalize stored full name to prevent redundant updates on trailing spaces
      const currentStoredName =
        normalizeOptionalString(user.user_metadata?.full_name ?? user.user_metadata?.name) ?? "";

      if (normalizedIncomingName !== currentStoredName) {
        const { error: authUpdateError } = await supabase.auth.updateUser({
          data: {
            full_name: normalizedIncomingName,
            name: normalizedIncomingName,
          },
        });

        if (authUpdateError) {
          console.error("[USER_PROFILE_UPDATE_ERROR]", {
            userId: user.id,
            error: authUpdateError,
          });
          return NextResponse.json(
            { error: "Failed to update personal profile information." },
            { status: 500 }
          );
        }

        profileUpdated = true;
      }
    }

    // 6. Fully typed Supabase schema payload for workspace settings
    const updatePayload: TenantSettingsUpdate = {};

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

    // REFINED: Compute mutated field names cleanly before attaching updated_at
    const mutatedFields = Object.keys(updatePayload);
    const hasTenantMutations = mutatedFields.length > 0;

    // Handle no-op updates gracefully with a 200 response instead of throwing a 400 error
    if (!hasTenantMutations && !profileUpdated) {
      return NextResponse.json(
        {
          success: true,
          message: "No modifications required.",
          metadata: { tenantId: tenantUser.tenant_id },
        },
        { status: 200 }
      );
    }

    let updatedTimestamp = new Date().toISOString();

    // 7. Rule 13 & Rule 6: Strictly scoped atomic update by tenant_id (only if tenant settings changed)
    if (hasTenantMutations) {
      updatePayload.updated_at = updatedTimestamp;

      const { data: updatedSettings, error: updateError } = await supabase
        .from("tenant_settings")
        .update(updatePayload)
        .eq("tenant_id", tenantUser.tenant_id)
        .select("tenant_id, updated_at")
        .single();

      if (updateError) {
        // REFINED: Explicitly distinguish between missing database row (404) vs internal error (500)
        if (updateError.code === "PGRST116") {
          console.error("[WORKSPACE_UPDATE_NOT_FOUND]", {
            tenantId: tenantUser.tenant_id,
            userId: user.id,
          });
          return NextResponse.json(
            { error: "Workspace settings record not found." },
            { status: 404 }
          );
        }

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

      updatedTimestamp = updatedSettings.updated_at ?? updatedTimestamp;
    }

    // 8. Rule 17: Structured Observability & Audit Logging
    console.info("[WORKSPACE_UPDATED]", {
      tenantId: tenantUser.tenant_id,
      userId: user.id,
      profileUpdated,
      fieldsMutated: mutatedFields,
      timestamp: updatedTimestamp,
    });

    // 9. Instant Cache Invalidation across Next.js App Router
    // Guarantees page refreshes instantly pull the new database and auth state
    revalidatePath("/settings");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/campaigns");

    return NextResponse.json({
      success: true,
      message: "Configuration updated successfully.",
      metadata: {
        tenantId: tenantUser.tenant_id,
        updatedAt: updatedTimestamp,
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