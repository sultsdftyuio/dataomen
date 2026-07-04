"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getWorkspaceEntitlements } from "@/lib/entitlements";

export type InterventionResult =
  | { success: true; message: string }
  | { success: false; error: string };

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "operator",
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

// ─── Explicit Discriminated Union for Context ───────────────────────────────
type OperatorContext =
  | { authorized: false; error: string }
  | {
      authorized: true;
      supabase: SupabaseClient<Database>;
      user: User;
      membership: { tenant_id: string; role: AllowedRole };
      profile: { full_name: string | null } | null;
    };

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
async function getOperatorContext(expectedTenantId: string): Promise<OperatorContext> {
  // 1. Create an untyped client locally. This completely stops TypeScript from 
  // assigning 'never' if a table is currently missing from your global Database types.
  const supabaseUntyped = (await createClient()) as SupabaseClient<any, any, any>;

  const { data: { user }, error: userError } = await supabaseUntyped.auth.getUser();
  if (userError || !user) {
    return { authorized: false, error: "Unauthorized" };
  }

  // 2. Fetch and manually cast membership (bypasses all type interference)
  const { data: rawMembership, error: membershipError } = await supabaseUntyped
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .eq("tenant_id", expectedTenantId)
    .single();

  const membership = rawMembership as { tenant_id: string; role: string } | null;

  if (membershipError || !membership) {
    console.error("security_violation", { 
      userId: user.id, 
      expectedTenantId, 
      error: membershipError 
    });
    return { authorized: false, error: "Authorization lookup failed or invalid tenant." };
  }

  if (!(ALLOWED_ROLES as readonly string[]).includes(membership.role)) {
    console.warn("auth_warning", { userId: user.id, role: membership.role });
    return { authorized: false, error: "Insufficient permissions." };
  }

  const entitlements = await getWorkspaceEntitlements(supabaseUntyped, expectedTenantId);
  if (!entitlements.isPro) {
    return {
      authorized: false,
      error: entitlements.restrictionMessage ?? "Upgrade to Pro to manage customer operations.",
    };
  }

  // 3. Fetch and manually cast profile
  const { data: rawProfile, error: profileError } = await supabaseUntyped
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile = rawProfile as { full_name: string | null } | null;

  if (profileError) {
    console.error("profile_lookup_failed", { userId: user.id, error: profileError });
  }

  return { 
    authorized: true, 
    // Return the strictly typed client for your safe RPC transactions downstream
    supabase: supabaseUntyped as SupabaseClient<Database>, 
    user, 
    membership: { tenant_id: membership.tenant_id, role: membership.role as AllowedRole }, 
    profile 
  };
}

// ─── 1. Apply Intervention ──────────────────────────────────────────────────
export async function applyInterventionAction(formData: FormData): Promise<InterventionResult> {
  const rawDuration = formData.get("durationDays");
  const durationDays = rawDuration === "null" ? null : rawDuration;

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
    // Rule 11 & Rule 13: Execute multi-table updates securely inside an atomic PostgreSQL RPC.
    const { error: rpcError } = await supabase.rpc("apply_queue_intervention", {
      p_tenant_id: membership.tenant_id,
      p_user_id: customerId,
      p_action: action,
      p_duration_days: parseResult.data.action === "cooldown" ? parseResult.data.durationDays : null,
      p_operator_name: profile?.full_name ?? user.email ?? "Unknown Operator",
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      console.error("intervention_rpc_failed", { 
        tenantId: membership.tenant_id, 
        customerId, 
        action, 
        error: rpcError 
      });
      return { success: false, error: rpcError.message || "Failed to apply intervention atomically." };
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
    console.error("intervention_failed", { 
      tenantId: membership.tenant_id, 
      customerId, 
      operatorId: user.id, 
      error: getErrorMessage(error) 
    });
    return { success: false, error: "Failed to apply intervention due to server error." };
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

  try {
    // Rule 11 & Rule 13: Atomic transaction via RPC guarantees account is claimed AND audit log is written.
    const { error: rpcError } = await supabase.rpc("claim_account_intervention", {
      p_tenant_id: membership.tenant_id,
      p_item_id: itemId,
      p_operator_id: user.id,
      p_operator_name: profile?.full_name ?? user.email ?? "Unknown Operator"
    });

    if (rpcError) {
      console.error("claim_rpc_failed", { tenantId: membership.tenant_id, itemId, operatorId: user.id, error: rpcError });
      return { success: false, error: rpcError.message || "Failed to claim account atomically." };
    }

    console.info("account_claimed", { tenantId: membership.tenant_id, itemId, operatorId: user.id });
    revalidatePath("/dashboard/queue");
    return { success: true, message: "Account successfully claimed." };

  } catch (error) {
    console.error("claim_failed", { tenantId: membership.tenant_id, itemId, error: getErrorMessage(error) });
    return { success: false, error: "Server error while claiming account." };
  }
}

// ─── 3. Requeue Dead Letter ─────────────────────────────────────────────────
export async function requeueDeadLetterAction(payload: { itemId: string; tenantId: string }): Promise<InterventionResult> {
  const parseResult = actionPayloadSchema.safeParse(payload);
  if (!parseResult.success) return { success: false, error: parseResult.error.errors[0].message };

  const { itemId, tenantId } = parseResult.data;

  const ctx = await getOperatorContext(tenantId);
  if (!ctx.authorized) return { success: false, error: ctx.error };
  const { supabase, user, membership, profile } = ctx;

  try {
    // Rule 11 & Rule 13: Atomic transaction via RPC guarantees dead letter state resets AND audit log is written.
    const { error: rpcError } = await supabase.rpc("requeue_dead_letter_intervention", {
      p_tenant_id: membership.tenant_id,
      p_item_id: itemId,
      p_operator_name: profile?.full_name ?? user.email ?? "Unknown Operator"
    });

    if (rpcError) {
      console.error("requeue_rpc_failed", { tenantId: membership.tenant_id, itemId, operatorId: user.id, error: rpcError });
      return { success: false, error: rpcError.message || "Failed to requeue account atomically." };
    }

    console.info("dead_letter_requeued", { tenantId: membership.tenant_id, itemId, operatorId: user.id });
    revalidatePath("/dashboard/queue");
    return { success: true, message: "Account requeued for dispatch." };

  } catch (error) {
    console.error("requeue_failed", { tenantId: membership.tenant_id, itemId, error: getErrorMessage(error) });
    return { success: false, error: "Server error while requeuing account." };
  }
}
