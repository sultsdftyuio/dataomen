"use server";

import { viewerMayRunManualScan } from "@/lib/manual-scan-access";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { startWebsiteDemandScan } from "./actions";
import type { ProspectActionResult } from "./prospect-types";

/**
 * Queue a fresh discovery scan for the operator's own workspace.
 *
 * The button is hidden for everyone else, but a server action is a public
 * endpoint, so the allowlist is re-checked here before any work is queued.
 * The scan itself reuses the normal activation path, including its Pro
 * entitlement check and the tenant's monthly discovery budget.
 */
export async function runManualDiscoveryScan(): Promise<ProspectActionResult> {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return { ok: false, message: "Workspace access could not be verified." };
  }

  const { supabase, tenantId, userId } = tenantResult.context;
  if (!(await viewerMayRunManualScan(supabase))) {
    return { ok: false, message: "On-demand scans are not enabled for this account." };
  }

  console.info("[ProspectDashboard] manual discovery scan requested", {
    tenant_id: tenantId,
    requested_by: userId,
  });
  return startWebsiteDemandScan();
}
