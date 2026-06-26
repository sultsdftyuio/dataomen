/** * ARCLI.TECH - Settings API Route
 * Strategy: Concurrent Data Fetching & Type-Safe Normalization
 * Purpose: Retrieves unified workspace settings and integration states for the active tenant.
 */

import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantApiKeySummary, fetchTenantSettingsRow } from "@/lib/settings/server";
import type { TenantSettingsSnapshotRow } from "@/lib/settings/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // 1. Authenticate and resolve the active tenant context
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return tenantResult.response;
  }

  const { supabase, tenantId } = tenantResult.context;

  // 2. Fetch disparate settings data concurrently for performance
  const [settingsResult, apiKeyResult] = await Promise.all([
    fetchTenantSettingsRow(supabase, tenantId),
    fetchTenantApiKeySummary(supabase, tenantId),
  ]);

  const { data, error } = settingsResult;
  const { data: apiKeySummary, error: apiKeyError } = apiKeyResult;

  // 3. Handle primary persistence errors
  if (error) {
    console.error("[SETTINGS_FETCH_ERROR] Failed to load tenant settings:", error);
    return NextResponse.json(
      { error: "Failed to load workspace settings" }, 
      { status: 500 }
    );
  }

  // Graceful degradation: Log API key errors but don't crash the entire settings page
  if (apiKeyError) {
    console.error("[API_KEY_SUMMARY_ERROR] Failed to fetch key metadata:", apiKeyError);
  }

  // 4. Override Supabase's v2 template literal inference limitations
  const typedData = data as TenantSettingsSnapshotRow | null;

  // 5. Normalize payload and enforce strict cache busting
  return NextResponse.json(buildSettingsSnapshot(typedData, apiKeySummary), {
    headers: { "Cache-Control": "no-store" },
  });
}