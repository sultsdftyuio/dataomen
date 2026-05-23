import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantApiKeySummary, fetchTenantSettingsRow } from "@/lib/settings/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const { supabase, tenantId } = tenantResult.context;
  const [settingsResult, apiKeyResult] = await Promise.all([
    fetchTenantSettingsRow(supabase, tenantId),
    fetchTenantApiKeySummary(supabase, tenantId),
  ]);

  const { data, error } = settingsResult;
  const { data: apiKeySummary, error: apiKeyError } = apiKeyResult;

  if (error) {
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }

  if (apiKeyError) {
    console.error("[API_KEY_SUMMARY_ERROR]", apiKeyError);
  }

  return NextResponse.json(buildSettingsSnapshot(data, apiKeySummary), {
    headers: { "Cache-Control": "no-store" },
  });
}
