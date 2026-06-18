// app/(dashboard)/dashboard/queue/action.ts
"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type InterventionResult =
  | { success: true; message: string }
  | { success: false; error: string };

const ALLOWED_ROLES = new Set(["owner", "admin", "operator"]);

const customerIdSchema = z.string().uuid("Invalid customer ID format.");

const interventionSchema = z.discriminatedUnion("action", [
  z.object({
    customerId: customerIdSchema,
    action: z.literal("suppress"),
    durationDays: z.null(),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: z.string().uuid(),
  }),
  z.object({
    customerId: customerIdSchema,
    action: z.literal("cooldown"),
    durationDays: z.coerce.number().int().positive("Cooldown requires a positive number of days."),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: z.string().uuid(),
  }),
]);

// ─── Shared Authorization Helper ────────────────────────────────────────────
async function getOperatorContext() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { authorized: false as const, error: "Unauthorized" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .returns<{ tenant_id: string; role: string }[]>()
    .single();

  if (membershipError || !membership) {
    console.error("Authorization lookup failed:", { userId: user.id, error: membershipError });
    return { authorized: false as const, error: "Authorization lookup failed." };
  }

  if (!ALLOWED_ROLES.has(membership.role)) {
    console.warn("Insufficient permissions attempt:", { userId: user.id, role: membership.role });
    return { authorized: false as const, error: "Insufficient permissions." };
  }

  return { authorized: true as const, supabase, user, membership };
}

// ─── 1. Apply Intervention ──────────────────────────────────────────────────
export async function applyInterventionAction(formData: FormData): Promise<InterventionResult> {
  const ctx = await getOperatorContext();
  if (!ctx.authorized) return { success: false, error: ctx.error };

  const { supabase, user, membership } = ctx;

  const rawDuration = formData.get("durationDays");
  const durationDays = (!rawDuration || rawDuration === "null") ? null : rawDuration;

  const parseResult = interventionSchema.safeParse({
    customerId: formData.get("customerId"),
    action: formData.get("action"),
    durationDays,
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parseResult.success) {
    return { success: false, error: parseResult.error.errors[0].message };
  }

  const { customerId, action, reason, idempotencyKey } = parseResult.data;
  
  const validDurationDays = parseResult.data.action === "cooldown" 
    ? parseResult.data.durationDays 
    : null;

  const { error } = await supabase.rpc("apply_manual_intervention", {
    p_tenant_id: membership.tenant_id,
    p_customer_id: customerId,
    p_action: action,
    p_duration_days: validDurationDays,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: true, message: "Action was already processed." };
    }
    console.error("Intervention failed:", {
      tenantId: membership.tenant_id,
      customerId,
      userId: user.id,
      error,
    });
    return { success: false, error: "Failed to apply intervention." };
  }

  console.info("Manual intervention applied", {
    tenantId: membership.tenant_id,
    customerId,
    action,
    reason,
    userId: user.id,
  });

  revalidatePath("/dashboard/queue");
  
  return { success: true, message: `Successfully applied ${action}.` };
}

// ─── 2. Claim Account ───────────────────────────────────────────────────────
export async function claimAccountAction(customerId: string): Promise<InterventionResult> {
  const ctx = await getOperatorContext();
  if (!ctx.authorized) return { success: false, error: ctx.error };

  const { supabase, user, membership } = ctx;

  const parseResult = customerIdSchema.safeParse(customerId);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error.errors[0].message };
  }
  const validCustomerId = parseResult.data;

  // NOTE: If you decide to move this to an RPC (e.g., `claim_queue_item`), 
  // you would replace this update block with `supabase.rpc(...)`. 
  // Doing it here via update with `.is("assigned_to", null)` prevents race conditions natively.
  const { data, error } = await supabase
    .from("risk_queue") 
    .update({ assigned_to: user.id })
    .eq("tenant_id", membership.tenant_id)
    .eq("customer_id", validCustomerId)
    .is("assigned_to", null) // Prevents last-writer-wins race conditions
    .select();

  if (error) {
    console.error("Failed to claim account (DB Error):", {
      tenantId: membership.tenant_id,
      customerId: validCustomerId,
      userId: user.id,
      error,
    });
    return { success: false, error: "Database error. Could not claim account." };
  }

  if (!data || data.length === 0) {
    console.warn("Claim account failed (Already claimed or not found):", {
      tenantId: membership.tenant_id,
      customerId: validCustomerId,
      userId: user.id,
    });
    return { success: false, error: "Account could not be claimed. It may not exist or is already assigned." };
  }

  revalidatePath("/dashboard/queue");
  return { success: true, message: "Account successfully claimed." };
}

// ─── 3. Requeue Dead Letter ─────────────────────────────────────────────────
export async function requeueDeadLetterAction(customerId: string): Promise<InterventionResult> {
  const ctx = await getOperatorContext();
  if (!ctx.authorized) return { success: false, error: ctx.error };

  const { supabase, user, membership } = ctx;

  const parseResult = customerIdSchema.safeParse(customerId);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error.errors[0].message };
  }
  const validCustomerId = parseResult.data;

  const { data, error } = await supabase
    .from("risk_queue")
    .update({ state: "pending" })
    .eq("tenant_id", membership.tenant_id)
    .eq("customer_id", validCustomerId)
    .eq("state", "dead_lettered") // Safety check
    .select();

  if (error) {
    console.error("Failed to requeue account (DB Error):", {
      tenantId: membership.tenant_id,
      customerId: validCustomerId,
      userId: user.id,
      error,
    });
    return { success: false, error: "Database error. Could not requeue." };
  }

  if (!data || data.length === 0) {
    console.warn("Requeue failed (Not found or not dead-lettered):", {
      tenantId: membership.tenant_id,
      customerId: validCustomerId,
      userId: user.id,
    });
    return { success: false, error: "Could not requeue. Account may not exist or is not in a dead-letter state." };
  }

  revalidatePath("/dashboard/queue");
  return { success: true, message: "Account requeued for dispatch." };
}