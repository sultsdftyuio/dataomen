import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { leadView } from "./data";
import type { QualifiedLeadView } from "./prospect-types";

export type FreeScanPreview = {
  /** Latest discovery run status, or null when no scan has started. */
  runStatus: string | null;
  leadCount: number;
  maybeCount: number;
  /** The single lead a Free user may see; its reply draft is removed in SQL. */
  topLead: QualifiedLeadView | null;
};

/**
 * Read the Free first-scan preview through its SECURITY DEFINER function.
 * Free users cannot read lead rows directly; this exposes exactly one lead
 * and aggregate counts. Returns null when the function is not deployed, so
 * the page falls back to the plain upgrade prompt.
 */
export async function fetchFreeScanPreview(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
  activeSince: string | null,
): Promise<FreeScanPreview | null> {
  if (!serviceProfileId) return null;

  // The generated Database type predates this function.
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client.rpc("free_plan_first_scan_preview", {
    p_service_profile_id: serviceProfileId,
    p_active_since: activeSince,
  });

  if (error) {
    console.info("[ProspectDashboard] free scan preview unavailable", {
      tenant_id: tenantId,
      code: (error as { code?: string }).code ?? null,
    });
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { run_status?: string | null; lead_count?: number | string; maybe_count?: number | string; top_lead?: Record<string, unknown> | null }
    | undefined;
  if (!row) return null;

  const topLead = row.top_lead ? leadView(row.top_lead, 0) : null;
  return {
    runStatus: row.run_status ?? null,
    leadCount: Number(row.lead_count ?? 0),
    maybeCount: Number(row.maybe_count ?? 0),
    // Belt and braces: never render a reply draft on the Free preview.
    topLead: topLead ? { ...topLead, suggestedReply: "" } : null,
  };
}
