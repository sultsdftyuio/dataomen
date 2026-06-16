"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Formalized return type for predictable client handling
export type InterventionResult =
  | { success: true; message: string }
  | { success: false; error: string };

// Discriminated union enforces strict duration rules based on the action type
const interventionSchema = z.discriminatedUnion("action", [
  z.object({
    customerId: z.string().uuid(),
    action: z.literal("suppress"),
    durationDays: z.null(),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: z.string().uuid(),
  }),
  z.object({
    customerId: z.string().uuid(),
    action: z.literal("cooldown"),
    durationDays: z.coerce.number().int().positive("Cooldown requires a positive number of days."),
    reason: z.string().min(5, "Reason must be at least 5 characters long."),
    idempotencyKey: z.string().uuid(),
  }),
]);

export async function applyInterventionAction(formData: FormData): Promise<InterventionResult> {
  // 1. Await createClient (required for async App Router Supabase helpers)
  const supabase = await createClient();

  // 2. Authenticate user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: "Unauthorized" };
  }

  // 3. Resolve tenant and handle lookup errors explicitly
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships") // Standardized table name
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (membershipError) {
    console.error("Authorization lookup failed:", membershipError);
    return { success: false, error: "Authorization lookup failed." };
  }

  if (!membership || !['owner', 'admin', 'operator'].includes(membership.role)) {
    return { success: false, error: "Insufficient permissions." };
  }

  // 4. Extract & Format Input for Validation
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
  
  // Isolate durationDays cleanly via type inference from the discriminated union
  const validDurationDays = parseResult.data.action === "cooldown" 
    ? parseResult.data.durationDays 
    : null;

  // 5. Execute atomic RPC
  // IMPORTANT: The RPC `apply_manual_intervention` MUST enforce `customer.tenant_id = p_tenant_id` internally!
  const { error } = await supabase.rpc("apply_manual_intervention", {
    p_tenant_id: membership.tenant_id,
    p_customer_id: customerId,
    p_action: action,
    p_duration_days: validDurationDays,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    // 23505 is PostgreSQL's unique violation code (Idempotency catch)
    if (error.code === "23505") {
      return { success: true, message: "Action was already processed." };
    }
    console.error("Intervention failed:", error);
    return { success: false, error: "Failed to apply intervention." };
  }

  // 6. Success Logging (Operational Observability)
  console.info("Manual intervention applied", {
    tenantId: membership.tenant_id,
    customerId,
    action,
    userId: user.id,
  });

  // 7. Invalidate Cache
  revalidatePath("/dashboard/queue");
  
  return { success: true, message: `Successfully applied ${action}.` };
}