// app/actions/billing-test.ts
"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspaceBillingAdmin } from "@/lib/billing/authorization";
import {
  areBillingTestControlsEnabled,
  billingTestUpdateFromState,
  isBillingTestState,
  type BillingTestState,
} from "@/lib/billing/test-controls";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

type BillingTestStateResult = {
  status: "updated";
  tenantId: string;
  subscriptionStatus: BillingTestState;
  planTier: "free" | "pro";
};

/**
 * Local/testing-only subscription state override for exercising gated UI.
 * This intentionally preserves persisted Dodo customer/subscription IDs.
 */
export async function setBillingTestState(state: string): Promise<BillingTestStateResult> {
  if (!areBillingTestControlsEnabled()) {
    console.warn("[Billing] Blocked billing test state update outside allowed environment", {
      event: "billing_test_state_blocked",
      node_env: process.env.NODE_ENV,
    });
    throw new Error("Billing test controls are disabled in this environment.");
  }

  const normalizedState = state.trim().toLowerCase();

  if (!isBillingTestState(normalizedState)) {
    throw new Error("Unsupported billing test state.");
  }

  const tenantContextResult = await resolveTenantContext();
  if ("response" in tenantContextResult) {
    throw new Error("No valid workspace found for user.");
  }

  const { tenantId, userId } = tenantContextResult.context;
  await requireWorkspaceBillingAdmin(tenantId, userId);
  const update = billingTestUpdateFromState(normalizedState);
  const serviceSupabase = createServiceRoleClient();
  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", tenantId)
    .select("tenant_id, plan_tier, subscription_status")
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error("[Billing] Billing test state update failed", {
      event: "billing_test_state_update_failed",
      tenant_id: tenantId,
      user_id: userId,
      requested_state: normalizedState,
      error: updateError,
    });
    throw new Error("Unable to update billing test state.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  console.info("[Billing] Billing test state updated", {
    event: "billing_test_state_updated",
    tenant_id: tenantId,
    user_id: userId,
    requested_state: normalizedState,
    plan_tier: updatedTenant.plan_tier,
    subscription_status: updatedTenant.subscription_status,
  });

  return {
    status: "updated",
    tenantId,
    subscriptionStatus: normalizedState,
    planTier: updatedTenant.plan_tier === "pro" ? "pro" : "free",
  };
}
