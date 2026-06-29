import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveTenantContext } from "@/utils/supabase/tenant";

interface StripeOAuthResponse {
  stripe_user_id?: string;
  error?: string;
  error_description?: string;
}

// Helper: Ensure authentication redirects are never cached by intermediaries
function noStoreRedirect(url: string | URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

// ---------------------------------------------------------------------------
// POST: Initialize the Stripe OAuth Flow (Synchronous)
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;
  const STRIPE_CONNECT_REDIRECT_URL =
    process.env.STRIPE_CONNECT_REDIRECT_URL || process.env.STRIPE_CONNECT_REDIRECT_URI;
  const STRIPE_CONNECT_SCOPE = process.env.STRIPE_CONNECT_SCOPE || "read_only";
  const STRIPE_CONNECT_BASE_URL =
    process.env.STRIPE_CONNECT_BASE_URL || "https://connect.stripe.com/oauth/authorize";

  if (!STRIPE_CONNECT_CLIENT_ID || !STRIPE_CONNECT_REDIRECT_URL) {
    return NextResponse.json(
      { error: "Stripe Connect is not configured." },
      { status: 500 }
    );
  }

  // Security Defense: Generate a cryptographically random nonce for CSRF protection
  const stateNonce = crypto.randomUUID();

  // Store the nonce in a secure, HTTP-only cookie (Next.js 15 requires await)
  const cookieStore = await cookies();
  cookieStore.set("stripe_oauth_state", stateNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15, // 15 minutes expiration
    path: "/",
  });

  const connectUrl = new URL(STRIPE_CONNECT_BASE_URL);
  connectUrl.searchParams.set("response_type", "code");
  connectUrl.searchParams.set("client_id", STRIPE_CONNECT_CLIENT_ID);
  connectUrl.searchParams.set("scope", STRIPE_CONNECT_SCOPE);
  connectUrl.searchParams.set("redirect_uri", STRIPE_CONNECT_REDIRECT_URL);
  connectUrl.searchParams.set("state", stateNonce);

  return NextResponse.json(
    { url: connectUrl.toString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

// ---------------------------------------------------------------------------
// GET: Handle the Stripe OAuth Callback (Synchronous to UI -> Async Worker)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // 1. Synchronous Identity Boundary
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }
  const { supabase, tenantId } = tenantResult.context;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle user cancellation or Stripe API errors gracefully
  if (errorParam || !code) {
    console.error("[STRIPE_CALLBACK] stripe_error_returned", {
      tenantId,
      error: errorParam,
      description: errorDescription,
    });
    return noStoreRedirect(new URL("/dashboard?error=stripe_connect_failed", request.url));
  }

  // 2. Security Defense: Validate CSRF Nonce State (Next.js 15 requires await)
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("stripe_oauth_state")?.value;

  // Always consume (delete) the nonce immediately to prevent replay attacks, 
  // even if validation fails.
  cookieStore.delete("stripe_oauth_state");

  if (!state || !expectedState || state !== expectedState) {
    console.error("[STRIPE_CALLBACK] csrf_state_mismatch", { 
      provided: state, 
      expected: expectedState,
      tenantId 
    });
    return noStoreRedirect(new URL("/dashboard?error=invalid_state", request.url));
  }

  // 3. Configuration Validation
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const workerSecret = process.env.INTERNAL_WORKER_SECRET;
  const pythonBackendUrl = process.env.INTERNAL_API_URL;

  if (!stripeSecret || !workerSecret || !pythonBackendUrl) {
    console.error("[STRIPE_CALLBACK] missing_env_vars", { 
      stripeSecret: !!stripeSecret, 
      workerSecret: !!workerSecret, 
      pythonBackendUrl: !!pythonBackendUrl 
    });
    return noStoreRedirect(new URL("/dashboard?error=configuration_error", request.url));
  }

  // 4. Token Exchange with strict timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_secret: stripeSecret,
        code,
        grant_type: "authorization_code",
      }),
      signal: controller.signal,
    });

    const tokenData: StripeOAuthResponse = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.stripe_user_id) {
      console.error("[STRIPE_CALLBACK] token_exchange_failed", {
        tenantId,
        status: tokenResponse.status,
        stripeError: tokenData.error,
        stripeErrorDescription: tokenData.error_description,
      });
      return noStoreRedirect(new URL("/dashboard?error=stripe_connect_failed", request.url));
    }

    const stripeAccountId = tokenData.stripe_user_id;

    // 5. Database RPC Transaction: Save Integration & Advance State to 'SYNCING'
    const { error: rpcError } = await supabase.rpc("upsert_stripe_integration", {
      p_tenant_id: tenantId,
      p_stripe_account_id: stripeAccountId,
    });

    if (rpcError) {
      console.error("[STRIPE_CALLBACK] db_rpc_failed", {
        tenantId,
        stripeAccountId,
        error: rpcError.message,
        code: rpcError.code,
      });
      return noStoreRedirect(new URL("/dashboard?error=internal_error", request.url));
    }

    // 6. Async Enrichment Boundary (Rule 2) - Robust Fire-and-Forget
    void (async () => {
      // Internal worker timeout protection to prevent hanging detached promises
      const workerController = new AbortController();
      const workerTimeout = setTimeout(() => workerController.abort(), 5000);

      try {
        const response = await fetch(`${pythonBackendUrl}/api/internal/workers/trigger-stripe-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${workerSecret}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            stripe_account_id: stripeAccountId,
          }),
          signal: workerController.signal,
        });

        if (!response.ok) {
          const textBody = await response.text().catch(() => "No body");
          console.error("[STRIPE_CALLBACK] async_trigger_http_error", {
            tenantId,
            stripeAccountId,
            status: response.status,
            body: textBody,
          });
        }
      } catch (err) {
        console.error("[STRIPE_CALLBACK] async_trigger_failed", {
          tenantId,
          stripeAccountId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearTimeout(workerTimeout);
      }
    })();

    // 7. Synchronous Exit: Release the user to the UI immediately
    return noStoreRedirect(new URL("/dashboard?success=stripe_connected", request.url));
    
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[STRIPE_CALLBACK] token_exchange_timeout", { tenantId });
    } else {
      console.error("[STRIPE_CALLBACK] fatal_exception", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return noStoreRedirect(new URL("/dashboard?error=internal_error", request.url));
  } finally {
    clearTimeout(timeout);
  }
}