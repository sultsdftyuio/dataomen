"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type InterventionResult =
  | { success: true; message: string }
  | { success: false; error: string };

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "operator",
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

// ─── Zod Validation Schemas ─────────────────────────────────────────────────
const uuidSchema = z.string().uuid("Invalid ID format.");

// Schema for simple item actions (Claim, Requeue)
const actionPayloadSchema = z.object({
  itemId: uuidSchema,
  tenantId: uuidSchema,
});

// Schema for complex form actions (Cooldown, Suppress)
const interventionSchema = z.discriminatedUnion("action", [
  z.object({
    itemId: uuidSchema,
    customerId: z.string().min(1, "Customer ID is required."), // String to support external IDs (e.g. cus_123)
    tenantId: uuidSchema,
    action: z.literal("suppress"),
    durationDays: z.null().optional(),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: uuidSchema,
  }),
  z.object({
    itemId: uuidSchema,
    customerId: z.string().min(1, "Customer ID is required."),
    tenantId: uuidSchema,
    action: z.literal("cooldown"),
    durationDays: z.coerce.number().int().positive("Cooldown requires a positive number of days."),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: uuidSchema,
  }),
]);

// ─── Helpers ────────────────────────────────────────────────────────────────
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// ─── Shared Authorization Helper (Rule 6: Strict Tenant Isolation) ──────────
async function getOperatorContext(expectedTenantId: string) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { authorized: false as const, error: "Unauthorized" };
  }

  // CRITICAL: We explicitly verify the user belongs to the tenantId passed in the payload
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .eq("tenant_id", expectedTenantId) // Strict validation against incoming payload
    .single();

  if (membershipError || !membership) {
    console.error("security_violation", { 
      userId: user.id, 
      expectedTenantId, 
      error: membershipError 
    });
    return { authorized: false as const, error: "Authorization lookup failed or invalid tenant." };
  }

  if (!ALLOWED_ROLES.includes(membership.role as AllowedRole)) {
    console.warn("auth_warning", { userId: user.id, role: membership.role });
    return { authorized: false as const, error: "Insufficient permissions." };
  }

  // Fetch operator profile for explainability audit logs
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("profile_lookup_failed", { userId: user.id, error: profileError });
  }

  return { authorized: true as const, supabase, user, membership, profile };
}

// ─── 1. Apply Intervention ──────────────────────────────────────────────────
export async function applyInterventionAction(formData: FormData): Promise<InterventionResult> {
  const rawDuration = formData.get("durationDays");
  const durationDays = (!rawDuration || rawDuration === "null") ? null : rawDuration;

  const parseResult = interventionSchema.safeParse({
    itemId: formData.get("itemId"),
    customerId: formData.get("customerId"),
    tenantId: formData.get("tenantId"),
    action: formData.get("action"),
    durationDays,
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parseResult.success) {
    return { success: false, error: parseResult.error.errors[0].message };
  }

  const { customerId, action, reason, idempotencyKey } = parseResult.data;
  
  const ctx = await getOperatorContext(parseResult.data.tenantId);
  if (!ctx.authorized) return { success: false, error: ctx.error };
  const { supabase, user, membership, profile } = ctx;

  try {
    // Fast-path idempotency check (not sufficient under concurrency; unique constraint is the real guard)
    const { data: existing, error: idempotencyCheckError } = await supabase
      .from("manual_interventions")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (idempotencyCheckError) {
      console.error("idempotency_check_failed", { tenantId: membership.tenant_id, error: idempotencyCheckError });
      return { success: false, error: "Failed to verify idempotency." };
    }

    if (existing) {
      return { success: true, message: "Action was already processed." };
    }

    // TODO: Move multi-step writes into a single database transaction (RPC/stored procedure)
    // to guarantee atomicity and eliminate idempotency races.
    if (action === "suppress") {
      // 1. Mark state as suppressed
      const { error: suppressError } = await supabase
        .from("churn_risk_state")
        .update({ is_suppressed: true })
        .eq("tenant_id", membership.tenant_id)
        .eq("user_id", customerId);

      if (suppressError) {
        console.error("suppress_state_failed", { tenantId: membership.tenant_id, customerId, error: suppressError });
        return { success: false, error: "Failed to suppress churn risk state." };
      }

      // 2. Kill pending emails in queue
      const { error: cancelError } = await supabase
        .from("recovery_emails")
        .update({ status: "suppressed" })
        .eq("tenant_id", membership.tenant_id)
        .eq("user_id", customerId)
        .in("status", ["pending_dispatch", "queued"]);

      if (cancelError) {
        console.error("suppress_emails_failed", { tenantId: membership.tenant_id, customerId, error: cancelError });
        return { success: false, error: "Failed to cancel pending emails." };
      }

    } else if (action === "cooldown") {
      // Push the lease expiration out by X days
      const days = parseResult.data.durationDays;
      const cooldownDate = new Date();
      cooldownDate.setDate(cooldownDate.getDate() + days);

      const { error: cooldownError } = await supabase
        .from("recovery_emails")
        .update({ 
          status: "cooldown",
          lease_expires_at: cooldownDate.toISOString() 
        })
        .eq("tenant_id", membership.tenant_id)
        .eq("user_id", customerId)
        .in("status", ["pending_dispatch", "queued", "failed"]);

      if (cooldownError) {
        console.error("cooldown_apply_failed", { tenantId: membership.tenant_id, customerId, error: cooldownError });
        return { success: false, error: "Failed to apply cooldown." };
      }
    }

    // Rule 17: Write to Explainability Audit Trail
    const { error: auditError } = await supabase.from("manual_interventions").insert({
      tenant_id: membership.tenant_id,
      user_id: customerId,
      action: action === "suppress" ? "Suppressed" : `Cooldown Applied (${parseResult.data.durationDays} days)`,
      operator_name: profile?.full_name || user.email,
      notes: reason,
      idempotency_key: idempotencyKey
    });

    if (auditError) {
      // Gracefully handle idempotency race via unique constraint on idempotency_key
      if (auditError.code === "23505") {
        return { success: true, message: "Action was already processed." };
      }
      console.error("audit_insert_failed", { tenantId: membership.tenant_id, customerId, action, error: auditError });
      return { success: false, error: "Failed to write audit log." };
    }

    console.info("intervention_applied", {
      tenantId: membership.tenant_id,
      customerId,
      action,
      operatorId: user.id,
    });
    revalidatePath("/dashboard/queue");
    
    return { success: true, message: `Successfully applied ${action}.` };

  } catch (error) {
    console.error("intervention_failed", { tenantId: membership.tenant_id, customerId, operatorId: user.id, error: getErrorMessage(error) });
    return { success: false, error: "Failed to apply intervention." };
  }
}

// ─── 2. Claim Account ───────────────────────────────────────────────────────
export async function claimAccountAction(payload: { itemId: string; tenantId: string }): Promise<InterventionResult> {
  const parseResult = actionPayloadSchema.safeParse(payload);
  if (!parseResult.success) return { success: false, error: parseResult.error.errors[0].message };

  const { itemId, tenantId } = parseResult.data;

  const ctx = await getOperatorContext(tenantId);
  if (!ctx.authorized) return { success: false, error: ctx.error };
  const { supabase, user, membership, profile } = ctx;

  // Phase 1 Schema Alignment: Update recovery_emails
  const { data, error } = await supabase
    .from("recovery_emails") 
    .update({ claimed_by_operator: user.id })
    .eq("tenant_id", membership.tenant_id)
    .eq("id", itemId)
    .is("claimed_by_operator", null) // Prevents last-writer-wins race conditions
    .select("user_id");

  if (error) {
    console.error("claim_db_error", { tenantId: membership.tenant_id, itemId, operatorId: user.id, error });
    return { success: false, error: "Database error. Could not claim account." };
  }

  if (!data || data.length === 0) {
    return { success: false, error: "Account could not be claimed. It may not exist or is already assigned." };
  }

  // Rule 17: Write to Explainability Audit Trail
  // Without transactions, audit is treated as best-effort: the primary operation already succeeded,
  // so we log audit failures critically but still return success to the caller.
  const { error: auditError } = await supabase.from("manual_interventions").insert({
    tenant_id: membership.tenant_id,
    user_id: data[0].user_id,
    action: "Account Claimed",
    operator_name: profile?.full_name || user.email,
  });

  if (auditError) {
    console.error("claim_audit_failed", { 
      tenantId: membership.tenant_id, 
      itemId, 
      operatorId: user.id, 
      userId: data[0].user_id,
      error: auditError 
    });
    // Intentionally not returning failure — the claim succeeded; audit is best-effort without transactions.
  }

  console.info("account_claimed", {
    tenantId: membership.tenant_id,
    itemId,
    operatorId: user.id,
  });
  revalidatePath("/dashboard/queue");
  return { success: true, message: "Account successfully claimed." };
}

// ─── 3. Requeue Dead Letter ─────────────────────────────────────────────────
export async function requeueDeadLetterAction(payload: { itemId: string; tenantId: string }): Promise<InterventionResult> {
  const parseResult = actionPayloadSchema.safeParse(payload);
  if (!parseResult.success) return { success: false, error: parseResult.error.errors[0].message };

  const { itemId, tenantId } = parseResult.data;

  const ctx = await getOperatorContext(tenantId);
  if (!ctx.authorized) return { success: false, error: ctx.error };
  const { supabase, user, membership, profile } = ctx;

  // Phase 1 Schema Alignment: Update recovery_emails
  const { data, error } = await supabase
    .from("recovery_emails")
    .update({ 
      status: "pending_dispatch",
      error_logs: null, 
      next_retry_at: new Date().toISOString()
    })
    .eq("tenant_id", membership.tenant_id)
    .eq("id", itemId)
    .eq("status", "dead_lettered") // Safety check
    .select("user_id");

  if (error) {
    console.error("requeue_db_error", { tenantId: membership.tenant_id, itemId, operatorId: user.id, error });
    return { success: false, error: "Database error. Could not requeue." };
  }

  if (!data || data.length === 0) {
    return { success: false, error: "Could not requeue. Account may not exist or is not in a dead-letter state." };
  }

  // Rule 17: Write to Explainability Audit Trail
  // Without transactions, audit is treated as best-effort: the primary operation already succeeded,
  // so we log audit failures critically but still return success to the caller.
  const { error: auditError } = await supabase.from("manual_interventions").insert({
    tenant_id: membership.tenant_id,
    user_id: data[0].user_id,
    action: "Dead Letter Requeued",
    operator_name: profile?.full_name || user.email,
  });

  if (auditError) {
    console.error("requeue_audit_failed", { 
      tenantId: membership.tenant_id, 
      itemId, 
      operatorId: user.id, 
      userId: data[0].user_id,
      error: auditError 
    });
    // Intentionally not returning failure — the requeue succeeded; audit is best-effort without transactions.
  }

  console.info("dead_letter_requeued", {
    tenantId: membership.tenant_id,
    itemId,
    operatorId: user.id,
  });
  revalidatePath("/dashboard/queue");
  return { success: true, message: "Account requeued for dispatch." };
}