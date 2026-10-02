import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const verdicts = [
  "worth_contacting", "wrong_fit", "already_known", "no_route",
  "bad_evidence", "not_now", "contacted", "meeting",
] as const;

export const prospectVerdictSchema = z.enum(verdicts);
export type ProspectVerdict = z.infer<typeof prospectVerdictSchema>;

const deliverySchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  entity_kind: z.enum(["account", "builder", "project"]),
  entity_title: z.string().nullable(),
  entity_url: z.string().url(),
  tier: z.enum(["direct_intent", "timely", "high_fit"]),
  fit_summary: z.string(),
  fit_source_url: z.string().url(),
  buyer_role: z.string(),
  angle: z.string(),
  uncertainty_summary: z.string(),
  signal_summary: z.string().nullable(),
  signal_source_url: z.string().url().nullable(),
  signal_date: z.string().nullable(),
  contact_route_type: z.enum(["public_reply", "business_contact", "licensed_business_route"]),
  contact_route_url: z.string().url(),
  source_checked_at: z.string(),
  route_checked_at: z.string(),
  delivered_at: z.string(),
  my_verdict: prospectVerdictSchema.nullable(),
});

export type AssistedProspect = z.infer<typeof deliverySchema>;

export async function fetchAssistedProspects(
  supabase: SupabaseClient<any, any, any>,
  targetingProfileId: string,
): Promise<AssistedProspect[]> {
  const { data, error } = await supabase.rpc(
    "list_assisted_prospect_deliveries" as never,
    { target_profile_id: targetingProfileId } as never,
  );
  if (error) {
    console.error("[AssistedProspects] Delivery lookup failed", { code: error.code });
    throw new Error("Prospects could not be loaded. Please try again.");
  }
  const parsed = z.array(deliverySchema).safeParse(data);
  if (!parsed.success) {
    console.error("[AssistedProspects] Delivery projection is invalid");
    throw new Error("Prospects could not be loaded. Please try again.");
  }
  return parsed.data;
}
