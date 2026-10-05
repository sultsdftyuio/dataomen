import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import type { QualifiedLeadView } from "./prospect-types";

/**
 * Attach the workspace's "done" state to already-loaded leads.
 *
 * Kept separate from the lead queries so that a missing or failing review
 * table (e.g. before lead_match_reviews_contract.sql is applied) degrades to
 * "nothing is done yet" instead of breaking the prospects page.
 */
export async function attachHandledState(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  leads: QualifiedLeadView[],
): Promise<QualifiedLeadView[]> {
  if (leads.length === 0) return leads;

  // The generated Database type predates this table.
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client
    .from("lead_match_reviews")
    .select("lead_match_id,handled_at")
    .eq("tenant_id", tenantId)
    .in("lead_match_id", leads.map((lead) => lead.id));

  if (error) {
    console.info("[ProspectDashboard] lead review state unavailable", {
      tenant_id: tenantId,
      code: (error as { code?: string }).code ?? null,
    });
    return leads;
  }

  const handledAtById = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ lead_match_id?: string; handled_at?: string }>) {
    if (row.lead_match_id && row.handled_at) handledAtById.set(row.lead_match_id, row.handled_at);
  }

  return leads.map((lead) => ({ ...lead, handledAt: handledAtById.get(lead.id) ?? null }));
}
