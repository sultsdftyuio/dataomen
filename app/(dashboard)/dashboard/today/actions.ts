"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assistedProspectPilotEnrolled } from "@/lib/assisted-prospect-pilot";
import { resolveTenantContext } from "@/utils/supabase/tenant";

import { prospectVerdictSchema } from "./data";

const submissionSchema = z.object({
  deliveryId: z.string().uuid(),
  verdict: prospectVerdictSchema,
});

export type VerdictSubmissionState = { ok: boolean; message: string };

export async function submitAssistedProspectVerdict(
  _previousState: VerdictSubmissionState,
  formData: FormData,
): Promise<VerdictSubmissionState> {
  const parsed = submissionSchema.safeParse({
    deliveryId: formData.get("deliveryId"),
    verdict: formData.get("verdict"),
  });
  if (!parsed.success) return { ok: false, message: "Choose a verdict for this prospect, then try again." };

  const tenantResult = await resolveTenantContext();
  if ("response" in tenantResult) return { ok: false, message: "Your workspace couldn't be checked, so the verdict wasn't saved. Reload the page and try again." };
  const { supabase, tenantId } = tenantResult.context;
  const enrolled = await assistedProspectPilotEnrolled(supabase, tenantId);
  if (!enrolled) {
    return { ok: false, message: "Today's prospects isn't turned on for this workspace, so the verdict wasn't saved." };
  }

  const { error } = await supabase.rpc(
    "submit_assisted_prospect_feedback" as never,
    {
      target_delivery_id: parsed.data.deliveryId,
      target_verdict: parsed.data.verdict,
    } as never,
  );
  if (error) {
    console.error("[AssistedProspects] Feedback failed", { code: error.code });
    return { ok: false, message: "Your verdict wasn't saved. Check your connection and try again." };
  }
  revalidatePath("/dashboard/today");
  return { ok: true, message: "Verdict saved." };
}
