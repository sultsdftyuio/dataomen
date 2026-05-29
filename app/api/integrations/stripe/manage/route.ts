import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

const setTenantStatus = async (supabase: any, tenantId: string, status: string) => {
  await supabase
    .from("tenants")
    .upsert({ tenant_id: tenantId, status })
    .select("tenant_id");
};

const STRIPE_DASHBOARD_BASE_URL =
  process.env.STRIPE_DASHBOARD_BASE_URL || "https://dashboard.stripe.com";

const normalizeBaseUrl = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export async function GET() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const { supabase, tenantId } = tenantResult.context;
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("stripe_account_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[STRIPE_MANAGE] Failed to resolve tenant settings", error);
    return NextResponse.json(
      { error: "Failed to load Stripe connection." },
      { status: 500 }
    );
  }

  if (!data?.stripe_account_id) {
    return NextResponse.json(
      { error: "Stripe is not connected." },
      { status: 409 }
    );
  }

  await setTenantStatus(supabase, tenantId, "INTEGRATION");

  const baseUrl = normalizeBaseUrl(STRIPE_DASHBOARD_BASE_URL);
  const manageUrl = `${baseUrl}/connect/accounts/${data.stripe_account_id}`;

  return NextResponse.redirect(manageUrl);
}
