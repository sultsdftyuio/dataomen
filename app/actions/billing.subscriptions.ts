"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import type { Database } from "@/types/supabase";
import {
  sanitizeEnvSecret,
  asRecord,
  getSupabaseServiceClient,
  getDodoClient,
  findActiveDodoSubscriptionForTenant,
  tenantUpdateFromDodoSubscription,
  extractCustomerId,
  extractSubscriptionId,
  extractCurrentPeriodEnd,
  isBillingTestControlsEnabled,
  isBillingTestState,
  billingTestUpdateFromState,
  compact,
  serializeError,
  type DodoSubscriptionMatch,
  type VerifyAndSyncSubscriptionStatusResult,
  type CancelProPlanResult,
  type BillingTestState,
  type BillingTestStateResult,
  type TenantBillingLookupRow,
} from "./billing.utils";

/**
 * Synchronous checkout-return fallback.
 *
 * Webhooks remain the source of truth, but this closes the UX gap when the user
 * returns from Dodo before the async webhook has updated Supabase.
 */
export async function verifyAndSyncSubscriptionStatus(
  tenantId: string
): Promise<VerifyAndSyncSubscriptionStatusResult> {
  const normalizedTenantId = tenantId.trim();

  if (!normalizedTenantId) {
    throw new Error("A workspace is required to verify billing status.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", normalizedTenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "[Billing] Unauthorized subscription verification attempt",
      {
        event: "billing_sync_unauthorized",
        tenant_id: normalizedTenantId,
        user_id: user.id,
        error: membershipError,
      }
    );
    throw new Error("No valid workspace found for user.");
  }

  const serviceSupabase = getSupabaseServiceClient();
  const { data: tenant, error: tenantError } = await serviceSupabase
    .from("tenants")
    .select(
      "tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id, current_period_end"
    )
    .eq("tenant_id", normalizedTenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    console.error(
      "[Billing] Tenant lookup failed during subscription verification",
      {
        event: "billing_sync_tenant_lookup_failed",
        tenant_id: normalizedTenantId,
        user_id: user.id,
        error: tenantError,
      }
    );
    throw new Error("Unable to resolve workspace billing status.");
  }

  const { client: dodo, environment } = getDodoClient();
  const productId = sanitizeEnvSecret(process.env.DODO_PRO_PLAN_ID) || null;

  console.info(
    "[Billing] Starting synchronous Dodo subscription verification",
    {
      event: "billing_sync_started",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      environment,
      product_id: productId,
      has_dodo_customer_id: Boolean(tenant.dodo_customer_id),
      has_dodo_subscription_id: Boolean(tenant.dodo_subscription_id),
      current_plan_tier: tenant.plan_tier,
      current_subscription_status: tenant.subscription_status,
    }
  );

  let match: DodoSubscriptionMatch | null;

  try {
    match = await findActiveDodoSubscriptionForTenant(dodo, {
      tenantId: normalizedTenantId,
      customerId: tenant.dodo_customer_id,
      subscriptionId: tenant.dodo_subscription_id,
      productId,
    });
  } catch (error) {
    console.error("[Billing] Dodo subscription verification failed", {
      event: "billing_sync_dodo_lookup_failed",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      environment,
      product_id: productId,
      error: serializeError(error),
    });
    throw new Error("Unable to verify subscription status. Please try again.");
  }

  if (!match) {
    console.info(
      "[Billing] No active Dodo subscription found for workspace",
      {
        event: "billing_sync_no_active_subscription",
        tenant_id: normalizedTenantId,
        user_id: user.id,
        environment,
        product_id: productId,
      }
    );

    return {
      status: "no_active_subscription",
      tenantId: normalizedTenantId,
      planTier: tenant.plan_tier,
      subscriptionStatus: tenant.subscription_status,
      dodoCustomerId: tenant.dodo_customer_id,
      dodoSubscriptionId: tenant.dodo_subscription_id,
    };
  }

  const update = tenantUpdateFromDodoSubscription(match.subscription);
  const desiredSubscriptionId = update.dodo_subscription_id ?? null;
  const desiredCustomerId = update.dodo_customer_id ?? null;
  const desiredSubscriptionStatus =
    typeof update.subscription_status === "string"
      ? update.subscription_status
      : null;
  const desiredCurrentPeriodEnd =
    typeof update.current_period_end === "string" ? update.current_period_end : undefined;
  const shouldSync =
    tenant.plan_tier !== "pro" ||
    tenant.subscription_status?.toLowerCase() !== desiredSubscriptionStatus ||
    tenant.dodo_customer_id !== desiredCustomerId ||
    tenant.dodo_subscription_id !== desiredSubscriptionId ||
    (desiredCurrentPeriodEnd !== undefined &&
      tenant.current_period_end !== desiredCurrentPeriodEnd);

  if (!shouldSync) {
    console.info(
      "[Billing] Workspace billing state already matches Dodo",
      {
        event: "billing_sync_already_synced",
        tenant_id: normalizedTenantId,
        user_id: user.id,
        lookup_strategy: match.lookupStrategy,
        scanned_count: match.scannedCount,
        dodo_subscription_id: desiredSubscriptionId,
        dodo_customer_id: desiredCustomerId,
      }
    );

    return {
      status: "already_synced",
      tenantId: normalizedTenantId,
      planTier: tenant.plan_tier,
      subscriptionStatus: tenant.subscription_status,
      dodoCustomerId: tenant.dodo_customer_id,
      dodoSubscriptionId: tenant.dodo_subscription_id,
      lookupStrategy: match.lookupStrategy,
    };
  }

  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", normalizedTenantId)
    .select(
      "tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id"
    )
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error("[Billing] Tenant billing sync update failed", {
      event: "billing_sync_update_failed",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      lookup_strategy: match.lookupStrategy,
      dodo_subscription_id: desiredSubscriptionId,
      dodo_customer_id: desiredCustomerId,
      error: updateError,
    });
    throw new Error("Unable to sync workspace billing status.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  console.info("[Billing] Workspace billing state synced from Dodo", {
    event: "billing_sync_completed",
    tenant_id: normalizedTenantId,
    user_id: user.id,
    lookup_strategy: match.lookupStrategy,
    scanned_count: match.scannedCount,
    dodo_subscription_id: desiredSubscriptionId,
    dodo_customer_id: desiredCustomerId,
    subscription_status: desiredSubscriptionStatus,
  });

  return {
    status: "synced",
    tenantId: normalizedTenantId,
    planTier: updatedTenant.plan_tier,
    subscriptionStatus: updatedTenant.subscription_status,
    dodoCustomerId: updatedTenant.dodo_customer_id,
    dodoSubscriptionId: updatedTenant.dodo_subscription_id,
    lookupStrategy: match.lookupStrategy,
  };
}

/**
 * Schedules the current workspace's Dodo subscription cancellation at period end.
 * Pro access remains open until Dodo emits the final cancellation/expiry event.
 */
export async function cancelProPlan(): Promise<CancelProPlanResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "[Billing] Workspace membership lookup failed during cancellation",
      {
        event: "billing_cancel_membership_lookup_failed",
        user_id: user.id,
        error: membershipError,
      }
    );
    throw new Error("No valid workspace found for user.");
  }

  const tenantId = membership.tenant_id;
  const serviceSupabase = getSupabaseServiceClient();
  const { data: tenant, error: tenantError } = await serviceSupabase
    .from("tenants")
    .select(
      "tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id, current_period_end"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantBillingLookupRow>();

  if (tenantError || !tenant) {
    console.error(
      "[Billing] Tenant lookup failed during cancellation",
      {
        event: "billing_cancel_tenant_lookup_failed",
        tenant_id: tenantId,
        user_id: user.id,
        error: tenantError,
      }
    );
    throw new Error("Unable to resolve workspace billing status.");
  }

  if (tenant.subscription_status === "canceling") {
    return {
      status: "already_canceled",
      tenantId,
      subscriptionStatus: tenant.subscription_status,
      currentPeriodEnd: tenant.current_period_end,
    };
  }

  const entitlements = await getWorkspaceEntitlements(serviceSupabase, tenantId);
  const canCancel =
    entitlements.planTier === "pro" &&
    ["active", "trialing", "past_due"].includes(
      entitlements.subscriptionStatus ?? ""
    );

  if (!canCancel) {
    throw new Error("No active subscription found to cancel.");
  }

  const { client: dodo, environment } = getDodoClient();
  const productId = sanitizeEnvSecret(process.env.DODO_PRO_PLAN_ID) || null;

  let match: DodoSubscriptionMatch | null;

  try {
    match = await findActiveDodoSubscriptionForTenant(dodo, {
      tenantId,
      customerId: tenant.dodo_customer_id,
      subscriptionId: tenant.dodo_subscription_id,
      productId,
    });
  } catch (error) {
    console.error(
      "[Billing] Dodo subscription lookup failed during cancellation",
      {
        event: "billing_cancel_dodo_lookup_failed",
        tenant_id: tenantId,
        user_id: user.id,
        environment,
        product_id: productId,
        error: serializeError(error),
      }
    );
    throw new Error("Unable to verify subscription before cancellation.");
  }

  const subscriptionId = match
    ? extractSubscriptionId(match.subscription)
    : tenant.dodo_subscription_id;

  if (!subscriptionId) {
    console.error(
      "[Billing] Missing Dodo subscription id during cancellation",
      {
        event: "billing_cancel_subscription_id_missing",
        tenant_id: tenantId,
        user_id: user.id,
        has_dodo_customer_id: Boolean(tenant.dodo_customer_id),
      }
    );
    throw new Error("No Dodo subscription is linked to this workspace.");
  }

  let canceledSubscription: Record<string, unknown>;

  try {
    canceledSubscription =
      asRecord(
        await dodo.subscriptions.update(subscriptionId, {
          cancel_at_next_billing_date: true,
          cancel_reason: "cancelled_by_customer",
          cancellation_comment: "Canceled from Arcli workspace settings.",
        })
      ) ??
      match?.subscription ?? { subscription_id: subscriptionId };
  } catch (error) {
    console.error("[Billing] Dodo subscription cancellation failed", {
      event: "billing_cancel_dodo_update_failed",
      tenant_id: tenantId,
      user_id: user.id,
      environment,
      subscription_id: subscriptionId,
      error: serializeError(error),
    });
    throw new Error("Unable to cancel subscription. Please try again.");
  }

  const currentPeriodEnd =
    extractCurrentPeriodEnd(canceledSubscription) ?? tenant.current_period_end;

  const update = compact({
    plan_tier: "pro",
    subscription_status: "canceling",
    billing_status: "canceling",
    plan: "pro",
    status: "active",
    trial_ends_at: null,
    dodo_customer_id:
      extractCustomerId(canceledSubscription) ??
      tenant.dodo_customer_id ??
      undefined,
    dodo_subscription_id: subscriptionId,
    current_period_end: currentPeriodEnd ?? undefined,
    updated_at: new Date().toISOString(),
  }) as Database["public"]["Tables"]["tenants"]["Update"];

  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", tenantId)
    .select("tenant_id, subscription_status, current_period_end")
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error(
      "[Billing] Tenant cancellation sync update failed",
      {
        event: "billing_cancel_local_sync_failed",
        tenant_id: tenantId,
        user_id: user.id,
        subscription_id: subscriptionId,
        error: updateError,
      }
    );
    throw new Error(
      "Subscription was updated, but workspace billing state could not sync."
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  console.info("[Billing] Workspace subscription cancellation scheduled", {
    event: "billing_cancel_completed",
    tenant_id: tenantId,
    user_id: user.id,
    environment,
    subscription_id: subscriptionId,
    current_period_end: updatedTenant.current_period_end,
  });

  return {
    status: "cancellation_scheduled",
    tenantId,
    subscriptionStatus: updatedTenant.subscription_status,
    currentPeriodEnd: updatedTenant.current_period_end,
  };
}

/**
 * Local/testing-only subscription state override for exercising gated UI.
 * This intentionally preserves persisted Dodo customer/subscription IDs.
 */
export async function setBillingTestState(
  state: string
): Promise<BillingTestStateResult> {
  if (!isBillingTestControlsEnabled()) {
    console.warn(
      "[Billing] Blocked billing test state update outside allowed environment",
      {
        event: "billing_test_state_blocked",
        node_env: process.env.NODE_ENV,
      }
    );
    throw new Error("Billing test controls are disabled in this environment.");
  }

  const normalizedState = state.trim().toLowerCase();

  if (!isBillingTestState(normalizedState)) {
    throw new Error("Unsupported billing test state.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "[Billing] Workspace membership lookup failed during test state update",
      {
        event: "billing_test_state_membership_lookup_failed",
        user_id: user.id,
        error: membershipError,
      }
    );
    throw new Error("No valid workspace found for user.");
  }

  const tenantId = membership.tenant_id;
  const update = billingTestUpdateFromState(normalizedState);
  const serviceSupabase = getSupabaseServiceClient();

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
      user_id: user.id,
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
    user_id: user.id,
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