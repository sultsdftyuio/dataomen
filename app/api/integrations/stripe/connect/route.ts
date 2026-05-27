import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;
const STRIPE_CONNECT_REDIRECT_URL =
  process.env.STRIPE_CONNECT_REDIRECT_URL || process.env.STRIPE_CONNECT_REDIRECT_URI;
const STRIPE_CONNECT_SCOPE = process.env.STRIPE_CONNECT_SCOPE || "read_only";
const STRIPE_CONNECT_BASE_URL =
  process.env.STRIPE_CONNECT_BASE_URL || "https://connect.stripe.com/oauth/authorize";

export async function POST() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  if (!STRIPE_CONNECT_CLIENT_ID || !STRIPE_CONNECT_REDIRECT_URL) {
    return NextResponse.json(
      { error: "Stripe Connect is not configured." },
      { status: 500 }
    );
  }

  const { tenantId } = tenantResult.context;
  const connectUrl = new URL(STRIPE_CONNECT_BASE_URL);
  connectUrl.searchParams.set("response_type", "code");
  connectUrl.searchParams.set("client_id", STRIPE_CONNECT_CLIENT_ID);
  connectUrl.searchParams.set("scope", STRIPE_CONNECT_SCOPE);
  connectUrl.searchParams.set("redirect_uri", STRIPE_CONNECT_REDIRECT_URL);
  connectUrl.searchParams.set("state", tenantId);

  return NextResponse.json(
    { url: connectUrl.toString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
