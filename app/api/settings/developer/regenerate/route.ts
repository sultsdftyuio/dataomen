import crypto from "crypto";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";

export const runtime = "nodejs";

const generateApiKey = () => crypto.randomBytes(32).toString("base64url");

export async function POST() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const { supabase, tenantId } = tenantResult.context;
  const apiKey = generateApiKey();
  const keyLastUpdated = new Date().toISOString();

  const { error } = await supabase
    .from("tenant_settings")
    .upsert(
      {
        tenant_id: tenantId,
        api_key: apiKey,
        key_last_updated: keyLastUpdated,
      },
      { onConflict: "tenant_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to regenerate key" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { apiKey },
    { headers: { "Cache-Control": "no-store" } }
  );
}
