"use server";

import { createClient } from "@/utils/supabase/server";
import { TemplateSaveSchema, type TemplateSaveInput } from "@/lib/schemas/template";
import { revalidatePath } from "next/cache";
import { getWorkspaceEntitlements } from "@/lib/entitlements";

export interface NormalizedTemplateRecord {
  id: string;
  tenant_id: string;
  name: string;
  subject: string;
  type: string;
  campaign_type: string;
  body_html: string;
  body_text: string | null;
  is_active: boolean;
  updated_at: string;
}

export type SaveRecoveryTemplateResult =
  | { success: true; template: NormalizedTemplateRecord }
  | { success: false; error: string };

/**
 * ARCLI RECOVERY INTELLIGENCE LAYER — TEMPLATE MANAGEMENT ACTION
 * Aligned with Arcli Engineering Constitution v3.0
 * Authoritative Table: public.email_templates
 */
export async function saveRecoveryTemplate(
  payload: TemplateSaveInput
): Promise<SaveRecoveryTemplateResult> {
  const supabase = await createClient();

  // --------------------------------------------------------------------------
  // STEP 1: Synchronous Authentication Check (Rule 1)
  // --------------------------------------------------------------------------
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Unauthorized: You must be signed in to perform this action.",
    };
  }

  // --------------------------------------------------------------------------
  // STEP 2: Strict Schema & Syntax Validation (Rule 15)
  // --------------------------------------------------------------------------
  const parsed = TemplateSaveSchema.safeParse(payload);
  if (!parsed.success) {
    // Return clean, human-readable error without exposing schema internals
    const firstError = parsed.error.errors[0];
    return { success: false, error: `Validation Error: ${firstError.message}` };
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
    return { success: false, error: "You do not have access to this workspace." };
  }

  // Authorize based on explicit workspace roles (Feedback #2)
  const normalizedRole = String(membership.role || "").toLowerCase();
  const allowedRoles = ["owner", "admin", "member"];

  if (!allowedRoles.includes(normalizedRole)) {
    return {
      success: false,
      error: "Forbidden: Insufficient permissions to modify recovery templates.",
    };
  }

  // Authoritative server-verified tenant ID
  const verifiedTenantId = String(membership.tenant_id);

  const entitlements = await getWorkspaceEntitlements(supabase as any, verifiedTenantId);
  if (!entitlements.canCreateTemplates) {
    return {
      success: false,
      error:
        entitlements.restrictionMessage ??
        "Upgrade to Pro to create recovery templates.",
    };
  }

  // --------------------------------------------------------------------------
  // STEP 4: Authoritative Database Insert/Update (Rule 11 & Feedback #3)
  // Inserts and updates are intentionally split so RLS checks are explicit and
  // brand-new templates do not require an UPDATE policy.
  // --------------------------------------------------------------------------
  const writePayload = {
    tenant_id: verifiedTenantId, // Strictly bound to server-validated tenant
    name,
    subject,
    type,
    body_html,
    body_text,                   // Auto-transformed/cleaned by Zod schema
    is_active: is_active ?? true, // Included explicitly (Feedback #3)
    updated_at: new Date().toISOString(),
  };

  const saveQuery = id
    ? supabase
        .from("email_templates")
        .update(writePayload)
        .eq("tenant_id", verifiedTenantId)
        .eq("id", id)
    : supabase
        .from("email_templates")
        .insert(writePayload);

  const { data: rawTemplate, error: saveError } = await saveQuery
    .select("id, tenant_id, name, subject, type, body_html, body_text, is_active, updated_at")
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

    const rlsFailure =
      saveError?.code === "42501" ||
      saveError?.message?.toLowerCase().includes("row-level security");

    return {
      success: false,
      error: rlsFailure
        ? "Template save was blocked by workspace security policy. Please confirm email template INSERT/UPDATE RLS policies are deployed for this tenant."
        : "Failed to save recovery template. Please try again or contact support.",
    };
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
    campaign_type: String(record.type || type),
    body_html: String(record.body_html || body_html),
    body_text:
      record.body_text === null || record.body_text === undefined
        ? null
        : String(record.body_text),
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
