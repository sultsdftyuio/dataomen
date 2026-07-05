"use server";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceEntitlements, PRO_TRIAL_DAYS } from "@/lib/entitlements";
import {
  sanitizeEnvSecret,
  getSupabaseServiceClient,
  getDodoClient,
} from "./billing.utils";

/* ------------------------------------------------------------------ */
/* Re-exports — types                                                */
/* ------------------------------------------------------------------ */

export type {
  DodoSubscriptionLookupStrategy,
  DodoSubscriptionMatch,
  DodoSubscriptionListParams,
  VerifyAndSyncSubscriptionStatusResult,
  CancelProPlanResult,
  BillingTestState,
  BillingTestStateResult,
  TenantBillingLookupRow,
} from "./billing.utils";

/* ------------------------------------------------------------------ */
/* Re-exports — subscription actions                                 */
/* ------------------------------------------------------------------ */

export {
  verifyAndSyncSubscriptionStatus,
  cancelProPlan,
  setBillingTestState,
} from "./billing.subscriptions";

/* ------------------------------------------------------------------ */
/* Checkout & Upgrade Flows                                          */
/* ------------------------------------------------------------------ */

/**
 * Initiates a checkout session to upgrade the current tenant workspace to the Pro plan.
 * Enforces strict synchronous tenant isolation and prevents duplicate checkouts.
 */
export async function upgradeToProPlan() {
  // 1. Strict Environment Variable Validation
  const productId = process.env.DODO_PRO_PLAN_ID?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!productId || !siteUrl) {
    console.error(
      "[Billing] Missing critical billing environment variables (DODO_PRO_PLAN_ID or NEXT_PUBLIC_SITE_URL)."
    );
    throw new Error("Billing service is currently unavailable.");
  }

  const { client: dodo, environment } = getDodoClient();
  const supabase = await createClient();

  // 2. Authenticate User & Validate Identity
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  if (!user.email) {
    throw new Error("User account is missing an associated email address.");
  }

  // 3. Secure Tenant Authorization & Discovery (Rule 6: Scope by Tenant)
  const { data: tenantMembership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !tenantMembership) {
    console.error("[Billing] Workspace membership lookup failed", {
      event: "tenant_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  const tenantId = tenantMembership.tenant_id;

  // 4. Prevent Duplicate Subscriptions & Handle Lookup Errors (Rule 11: Idempotency)
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);

  // If already active or trialing, block new checkout generation
  if (entitlements.isPro && entitlements.subscriptionStatus !== "canceling") {
    console.info("[Billing] Prevented duplicate checkout attempt", {
      event: "duplicate_checkout_prevented",
      tenant_id: tenantId,
      user_id: user.id,
      current_status: entitlements.subscriptionStatus,
    });
    throw new Error("Workspace already has an active subscription.");
  }

  // 5. Resilient Checkout Creation
  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      allowed_payment_method_types: ["credit", "debit"],
      customer: {
        email: user.email,
      },
      metadata: {
        tenant_id: tenantId, // Mandatory: deterministic routing for asynchronous webhooks (Rule 14)
        user_id: user.id,
      },
      subscription_data: {
        trial_period_days: PRO_TRIAL_DAYS,
      },
      return_url: `${siteUrl}/dashboard?billing=trial_started`,
    });

    if (!session || !session.checkout_url) {
      throw new Error("Checkout session returned without a valid URL.");
    }

    return { url: session.checkout_url };
  } catch (error) {
    // 6. Operator-Focused Structured Observability (Rule 17)
    console.error("[Billing] Checkout creation failed", {
      event: "checkout_creation_failed",
      tenant_id: tenantId,
      user_id: user.id,
      environment, // Explicitly logs the active SDK routing environment
      product_id: productId,
      error,
    });

    throw new Error(
      "Unable to create checkout session. Please try again later."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Customer Portal Management                                        */
/* ------------------------------------------------------------------ */

/**
 * Generates a Dodo Payments Customer Portal session for active subscribers.
 * Eliminates live email scanning in favor of deterministic database resolution with 100% type safety.
 */
export async function manageBillingPortal() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    console.error(
      "[Billing] Missing NEXT_PUBLIC_SITE_URL environment variable."
    );
    throw new Error("Billing service is currently unavailable.");
  }

  const { client: dodo, environment } = getDodoClient();
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  // 1. Resolve Tenant Context (Rule 6: Scope by Tenant)
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    console.error(
      "[Billing] Workspace membership lookup failed during portal creation",
      {
        event: "tenant_membership_lookup_failed",
        user_id: user.id,
        error: membershipError,
      }
    );
    throw new Error("No valid workspace found for user.");
  }

  // 2. Deterministic Tenant & Billing Profile Resolution (Rule 11)
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("tenant_id, dodo_customer_id")
    .eq("tenant_id", membership.tenant_id)
    .single();

  if (tenantError || !tenant) {
    console.error("[Billing] Tenant lookup failed during portal creation", {
      event: "tenant_lookup_failed",
      tenant_id: membership.tenant_id,
      error: tenantError,
    });
    throw new Error("Unable to resolve workspace billing status.");
  }

  const entitlements = await getWorkspaceEntitlements(
    supabase,
    membership.tenant_id
  );

  // Guarantee case-insensitive comparison against schema variations ('PRO' vs 'pro')
  const isProTier =
    entitlements.isPro ||
    entitlements.planTier?.toUpperCase() === "PRO" ||
    entitlements.planTier?.toUpperCase() === "ENTERPRISE";

  const canManageBilling =
    isProTier &&
    ["active", "trialing", "past_due", "canceling"].includes(
      entitlements.subscriptionStatus?.toLowerCase() ?? ""
    );

  if (!canManageBilling) {
    throw new Error("No active subscription found to manage.");
  }

  const customerId = tenant.dodo_customer_id;

  if (!customerId) {
    console.error(
      "[Billing] Workspace missing persisted dodo_customer_id",
      {
        event: "portal_customer_id_missing",
        tenant_id: membership.tenant_id,
        user_id: user.id,
      }
    );
    throw new Error(
      "No billing profile linked to this workspace. Please contact support."
    );
  }

  try {
    // 3. Create Customer Portal session deterministically via canonical customer ID
    const portalSession = await dodo.customers.customerPortal.create(
      customerId
    );

    if (!portalSession || !portalSession.link) {
      throw new Error("Portal session returned without a valid link.");
    }

    return { url: portalSession.link };
  } catch (error) {
    console.error("[Billing] Customer portal creation failed", {
      event: "portal_creation_failed",
      tenant_id: membership.tenant_id,
      user_id: user.id,
      customer_id: customerId,
      environment, // Explicitly logs the active SDK routing environment
      error,
    });
    throw new Error(
      "Unable to open billing portal. Please try again later."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Graceful Cancellation & Card Removal Lifecycle                    */
/* ------------------------------------------------------------------ */

/**
 * Schedules subscription cancellation at period end when a user requests payment method removal or downgrade.
 * Prevents gateway state conflicts (HTTP 409) while preserving Pro entitlements until cycle expiration.
 * Aligned with Arcli Churn Churn Signal Directive (Rule 8 & 21).
 */
export async function scheduleSubscriptionCancellation() {
  const { client: dodo, environment } = getDodoClient();
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
    .single();

  if (membershipError || !membership) {
    throw new Error("No valid workspace found for user.");
  }

  const workspaceId = membership.tenant_id;

  // 1. Fetch current subscription ID and payment attachment state
  const { data: tenant, error: fetchErr } = await supabase
    .from("tenants")
    .select("subscription_id, payment_method_id, current_period_end, plan_tier")
    .eq("tenant_id", workspaceId)
    .single();

  if (fetchErr || !tenant?.subscription_id) {
    throw new Error("No active subscription found to modify.");
  }

  // 2. Schedule cancellation in Dodo/Stripe gateway rather than brute-force card deletion
  try {
    await dodo.subscriptions.update(tenant.subscription_id, {
      cancel_at_period_end: true, // Guarantees retention of paid benefits until cycle conclusion
    });
  } catch (error: any) {
    console.error("[Billing] Failed to schedule end-of-period cancellation", {
      event: "billing_schedule_cancel_failed",
      tenant_id: workspaceId,
      subscription_id: tenant.subscription_id,
      environment,
      error: error?.message || error,
    });
    throw new Error("Failed to schedule plan cancellation. Please try again or contact support.");
  }

  // 3. Synchronously mutate local workspace state (Rule 1 & Rule 6)
  // We keep plan_tier unchanged (uppercase enum safe) and transition status to 'canceling'
  const { error: updateErr } = await supabase
    .from("tenants")
    .update({
      subscription_status: "canceling",
      cancellation_intent_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", workspaceId);

  if (updateErr) {
    console.error("[Billing] Database state sync failed after gateway update", {
      event: "tenant_cancellation_sync_error",
      tenant_id: workspaceId,
      error: updateErr,
    });
    throw new Error("Subscription scheduled to end, but local workspace synchronization delayed.");
  }

  // 4. Track signal explicitly for operator observability (Rule 8: Churn Scoring Indicator)
  console.info("[Billing] Cancellation intent tracked successfully", {
    event: "cancellation_intent_detected",
    tenant_id: workspaceId,
    user_id: user.id,
    current_plan: tenant.plan_tier,
    effective_end_date: tenant.current_period_end,
  });

  return { 
    success: true, 
    periodEnd: tenant.current_period_end 
  };
}