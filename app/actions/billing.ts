// app/actions/billing.ts
"use server"

import { createClient } from "@/utils/supabase/server";
import { DodoPayments } from "dodopayments";

// 1. Lazy Initialization
// Prevents module-level crashes on boot if env vars are missing,
// while ensuring the SDK is never constructed with an invalid/empty key.
function getDodoClient() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DODO_PAYMENTS_API_KEY environment variable.");
  }
  return new DodoPayments({ bearerToken: apiKey });
}

export async function upgradeToProPlan() {
  // 2. Strict Environment Variable Validation
  const productId = process.env.DODO_PRO_PLAN_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!productId || !siteUrl) {
    console.error("[Billing] Missing critical billing environment variables (DODO_PRO_PLAN_ID or NEXT_PUBLIC_SITE_URL).");
    throw new Error("Billing service is currently unavailable.");
  }

  // Safely initialize the SDK now that we know we have the key
  const dodo = getDodoClient();

  // 3. Authenticate User & Validate State
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  if (!user.email) {
    throw new Error("User account is missing an associated email address.");
  }

  // 4. Secure Tenant Authorization & Discovery
  const { data: tenant, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (tenantError || !tenant) {
    console.error("[Billing] Workspace lookup failed", { 
      event: "tenant_lookup_failed",
      user_id: user.id, 
      error: tenantError 
    });
    throw new Error("No valid workspace found for user.");
  }

  // 5. Prevent Duplicate Subscriptions & Handle Lookup Errors
  // NOTE: This prevents most double-purchases. To completely eliminate 
  // race conditions (e.g., rapid double-clicking), the frontend UI MUST 
  // disable the upgrade button immediately upon the first click.
  const { data: existingSub, error: subError } = await supabase
    .from("subscriptions") 
    .select("id, status")
    .eq("tenant_id", tenant.tenant_id)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  // Explicitly handle database read errors so we don't accidentally bypass the check
  if (subError) {
    console.error("[Billing] Subscription verification failed", {
      event: "subscription_lookup_error",
      tenant_id: tenant.tenant_id,
      error: subError
    });
    throw new Error("Unable to verify current subscription status.");
  }

  if (existingSub) {
    console.info("[Billing] Prevented duplicate checkout", {
      event: "duplicate_checkout_prevented",
      tenant_id: tenant.tenant_id,
      user_id: user.id
    });
    throw new Error("Workspace already has an active subscription.");
  }

  // 6. Resilient Checkout Creation with Structured Logging
  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ 
        product_id: productId,
        quantity: 1 
      }],
      customer: { 
        email: user.email
      },
      metadata: {
        tenant_id: tenant.tenant_id, // Mandatory: safe async routing for webhooks
        user_id: user.id             // Recommended: explicit tracking
      },
      // Note: return_url is merely for redirect. The async webhook is the ONLY source of truth.
      return_url: `${siteUrl}/dashboard?billing=success`, 
    });

    // 7. Validate Payload
    if (!session || !session.checkout_url) {
      throw new Error("Checkout session returned without a valid URL.");
    }

    return { url: session.checkout_url };

  } catch (error) {
    // 8. Operator-focused structured observability
    // Logging the complete 'error' object captures status codes, request IDs, and provider metadata
    console.error("[Billing] Checkout creation failed", {
      event: "checkout_creation_failed",
      tenant_id: tenant.tenant_id,
      user_id: user.id,
      error
    });
    
    throw new Error("Unable to create checkout session. Please try again later.");
  }
}