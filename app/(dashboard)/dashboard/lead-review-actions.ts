"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProEntitlement } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import type { ProspectActionResult } from "./prospect-types";

/**
 * Mark a lead done (handled) or move it back to the inbox.
 *
 * Only reachable from the Pro prospect desk. RLS on lead_match_reviews
 * enforces tenant membership and the composite FK enforces that the lead
 * belongs to this tenant; the explicit lookup below just gives a clear error.
 */
export async function setLeadHandled(
  leadMatchId: string,
  handled: boolean,
): Promise<ProspectActionResult> {
  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) {
    return { ok: false, message: "Workspace access could not be verified." };
  }
  const { supabase, tenantId, userId } = tenantResult.context;

  try {
    await requireProEntitlement(supabase, tenantId);
  } catch {
    return { ok: false, message: "Marking leads done is part of Pro." };
  }

  // The generated Database type predates lead_match_reviews.
  const client = supabase as unknown as SupabaseClient;

  const result = handled
    ? await client
        .from("lead_match_reviews")
        .upsert(
          { tenant_id: tenantId, lead_match_id: leadMatchId, user_id: userId },
          { onConflict: "tenant_id,lead_match_id", ignoreDuplicates: true },
        )
    : await client
        .from("lead_match_reviews")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("lead_match_id", leadMatchId);

  if (result.error) {
    console.error("[ProspectDashboard] lead review update failed", {
      tenant_id: tenantId,
      lead_match_id: leadMatchId,
      handled,
      code: result.error.code ?? null,
    });
    return { ok: false, message: "Could not update this lead. Please try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: handled ? "Marked done." : "Moved back to inbox." };
}
