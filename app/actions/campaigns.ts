"use server";

import { createClient } from "@/utils/supabase/server";
import { TemplateSaveSchema, TemplateSaveInput } from "@/lib/schemas/template";
import { revalidatePath } from "next/cache";
import { getWorkspaceEntitlements } from "@/lib/entitlements";

export interface NormalizedTemplateRecord {
  id: string;
  tenant_id: string;
  name: string;
  subject: string;
  type: string;
  is_active: boolean;
  updated_at: string;
}

/**
 * ARCLI RECOVERY INTELLIGENCE LAYER — TEMPLATE MANAGEMENT ACTION
 * Aligned with Arcli Engineering Constitution v3.0
 * Authoritative Table: public.email_templates
 */
export async function saveRecoveryTemplate(
  payload: TemplateSaveInput
): Promise<{ success: boolean; template?: NormalizedTemplateRecord }> {
  const supabase = await createClient();

  // --------------------------------------------------------------------------
  // STEP 1: Synchronous Authentication Check (Rule 1)
  // --------------------------------------------------------------------------
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: You must be signed in to perform this action.");
  }

  // --------------------------------------------------------------------------
  // STEP 2: Strict Schema & Syntax Validation (Rule 15)
  // --------------------------------------------------------------------------
  const parsed = TemplateSaveSchema.safeParse(payload);
  if (!parsed.success) {
    // Return clean, human-readable error without exposing schema internals
    const firstError = parsed.error.errors[0];
    throw new Error(`Validation Error: ${firstError.message}`);
  }

  const {
    id,
    tenant_id: requestedTenantId,
    name,
    subject,
    type,
    body_html,
    body_text,
    is_active,
  } = parsed.data;

  // --------------------------------------------------------------------------
  // STEP 3: Zero-Trust Tenant & Role Verification (Rule 6 Defense-in-Depth)
  // Never blindly trust a client-supplied tenant_id. Verify against membership.
  // Derive active workspace directly from membership if client omitted it.
  // --------------------------------------------------------------------------
  let membershipQuery = supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id);

  if (requestedTenantId) {
    membershipQuery = membershipQuery.eq("tenant_id", requestedTenantId);
  }

  const { data: membership, error: memberError } = await membershipQuery.limit(1).single();

  if (memberError || !membership) {
    // Sanitized error to prevent tenant enumeration (Feedback #9)
    throw new Error("You do not have access to this workspace.");
  }

  // Authorize based on explicit workspace roles (Feedback #2)
  const normalizedRole = String(membership.role || "").toLowerCase();
  const allowedRoles = ["owner", "admin", "member"];

  if (!allowedRoles.includes(normalizedRole)) {
    throw new Error("Forbidden: Insufficient permissions to modify recovery templates.");
  }

  // Authoritative server-verified tenant ID
  const verifiedTenantId = String(membership.tenant_id);

  const entitlements = await getWorkspaceEntitlements(supabase as any, verifiedTenantId);
  if (!entitlements.canCreateTemplates) {
    throw new Error(entitlements.restrictionMessage ?? "Upgrade to Pro to create recovery templates.");
  }

  // --------------------------------------------------------------------------
  // STEP 4: Authoritative Database Upsert (Rule 11 & Feedback #3)
  // Targets exact schema table and ensures all properties are persisted.
  // --------------------------------------------------------------------------
  const upsertPayload = {
    ...(id ? { id } : {}),
    tenant_id: verifiedTenantId, // Strictly bound to server-validated tenant
    name,
    subject,
    type: type || "recovery",
    body_html,
    body_text,                   // Auto-transformed/cleaned by Zod schema
    is_active: is_active ?? true, // Included explicitly (Feedback #3)
    updated_at: new Date().toISOString(),
  };

  const { data: rawTemplate, error: saveError } = await supabase
    .from("email_templates")
    .upsert(upsertPayload, {
      // Targets primary key; RLS simultaneously verifies workspace boundary (Feedback #6)
      onConflict: "id",
    })
    .select("id, tenant_id, name, subject, type, is_active, updated_at")
    .single();

  if (saveError || !rawTemplate) {
    // Structured observability logging for operators (Rule 17 & Feedback #5)
    console.error("[saveRecoveryTemplate] Database write failure", {
      tenantId: verifiedTenantId,
      userId: user.id,
      templateId: id || "new_insert",
      errorCode: saveError?.code,
      errorMessage: saveError?.message,
    });

    throw new Error("Failed to save recovery template. Please try again or contact support.");
  }

  // --------------------------------------------------------------------------
  // STEP 5: Strict Type Normalization (Resolves Supabase Json/Nullable Errors)
  // --------------------------------------------------------------------------
  const record = rawTemplate as Record<string, unknown>;
  const normalizedTemplate: NormalizedTemplateRecord = {
    id: String(record.id || ""),
    tenant_id: String(record.tenant_id || verifiedTenantId),
    name: String(record.name || name),
    subject: String(record.subject || subject),
    type: String(record.type || type),
    is_active: Boolean(record.is_active ?? true),
    updated_at: String(record.updated_at || new Date().toISOString()),
  };

  // --------------------------------------------------------------------------
  // STEP 6: Cache Invalidation (Feedback #7)
  // --------------------------------------------------------------------------
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/campaigns/templates");

  return { success: true, template: normalizedTemplate };
}
