// app/actions/billing.ts
"use server";

import { createClient } from "@/utils/supabase/server";
import { DodoPayments } from "dodopayments";

/**
 * Helper function to evaluate if a workspace is actively entitled to Pro features.
 * Prevents treating canceled or past_due workspaces as active if their plan field remains "pro".
 */
function isSubscriptionActive(status?: string | null, plan?: string | null): boolean {
  if (!status) return false;
  const activeStatuses = ["active", "trialing"];
  return activeStatuses.includes(status.toLowerCase()) && plan?.toLowerCase() === "pro";
}

/**
 * 1. Environment-Aware SDK Initialization (Rule 11: Determinism & Rule 17: Observability)
 * Prevents 401 Unauthorized errors by dynamically routing to 'test_mode' or 'live_mode'
 * based on explicit config or key prefix inference.
 */
function getDodoClient(): DodoPayments {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DODO_PAYMENTS_API_KEY environment variable.");
  }

  const explicitEnv = process.env.DODO_PAYMENTS_ENV;
  const isTestKey = apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
  const environment = explicitEnv === "test_mode" || isTestKey ? "test_mode" : "live_mode";

  return new DodoPayments({
    bearerToken: apiKey,
    environment,
  });
}

/**
 * Initiates a checkout session to upgrade the current tenant workspace to the Pro plan.
 * Enforces strict synchronous tenant isolation and prevents duplicate checkouts.
 */
export async function upgradeToProPlan() {
  // 2. Strict Environment Variable Validation
  const productId = process.env.DODO_PRO_PLAN_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!productId || !siteUrl) {
    console.error("[Billing] Missing critical billing environment variables (DODO_PRO_PLAN_ID or NEXT_PUBLIC_SITE_URL).");
    throw new Error("Billing service is currently unavailable.");
  }

  const dodo = getDodoClient();
  const supabase = await createClient();

  // 3. Authenticate User & Validate Identity
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  if (!user.email) {
    throw new Error("User account is missing an associated email address.");
  }

  // 4. Secure Tenant Authorization & Discovery (Rule 6: Scope by Tenant)
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

  // 5. Prevent Duplicate Subscriptions & Handle Lookup Errors (Rule 11: Idempotency)
  const { data: currentTenant, error: tenantLookupError } = await supabase
    .from("tenants")
    .select("tenant_id, status, plan")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (tenantLookupError) {
    console.error("[Billing] Tenant subscription verification failed", {
      event: "subscription_lookup_error",
      tenant_id: tenantId,
      error: tenantLookupError,
    });
    throw new Error("Unable to verify current subscription status.");
  }

  if (currentTenant && isSubscriptionActive(currentTenant.status, currentTenant.plan)) {
    console.info("[Billing] Prevented duplicate checkout attempt", {
      event: "duplicate_checkout_prevented",
      tenant_id: tenantId,
      user_id: user.id,
    });
    throw new Error("Workspace already has an active subscription.");
  }

  // 6. Resilient Checkout Creation
  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      customer: {
        email: user.email,
      },
      metadata: {
        tenant_id: tenantId, // Mandatory: deterministic routing for asynchronous webhooks (Rule 14)
        user_id: user.id,
      },
      return_url: `${siteUrl}/dashboard?billing=success`,
    });

    if (!session || !session.checkout_url) {
      throw new Error("Checkout session returned without a valid URL.");
    }

    return { url: session.checkout_url };
  } catch (error) {
    // 7. Operator-Focused Structured Observability (Rule 17)
    console.error("[Billing] Checkout creation failed", {
      event: "checkout_creation_failed",
      tenant_id: tenantId,
      user_id: user.id,
      environment: process.env.DODO_PAYMENTS_ENV || "inferred",
      error,
    });

    throw new Error("Unable to create checkout session. Please try again later.");
  }
}

/**
 * Generates a Dodo Payments Customer Portal session for active subscribers.
 * Eliminates live email scanning in favor of deterministic database resolution with 100% type safety.
 */
export async function manageBillingPortal() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error("[Billing] Missing NEXT_PUBLIC_SITE_URL environment variable.");
    throw new Error("Billing service is currently unavailable.");
  }

  const dodo = getDodoClient();
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
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
    console.error("[Billing] Workspace membership lookup failed during portal creation", {
      event: "tenant_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  // 2. Deterministic Tenant & Billing Profile Resolution (Rule 11)
  // Fully type-safe select query without runtime type casting.
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("tenant_id, status, plan, dodo_customer_id")
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

  if (!isSubscriptionActive(tenant.status, tenant.plan)) {
    throw new Error("No active subscription found to manage.");
  }

  // Fully typed access directly verified by the TypeScript compiler
  const customerId = tenant.dodo_customer_id;

  if (!customerId) {
    console.error("[Billing] Workspace missing persisted dodo_customer_id", {
      event: "portal_customer_id_missing",
      tenant_id: membership.tenant_id,
      user_id: user.id,
    });
    throw new Error("No billing profile linked to this workspace. Please contact support.");
  }

  try {
    // 3. Create Customer Portal session deterministically via canonical customer ID
    const portalSession = await dodo.customers.customerPortal.create(customerId);

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
      environment: process.env.DODO_PAYMENTS_ENV || "inferred",
      error,
    });
    throw new Error("Unable to open billing portal. Please try again later.");
  }
}