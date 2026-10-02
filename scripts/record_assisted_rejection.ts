/** Staff-only log of rejected pilot research. Dry run unless --commit is set. */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { publicUrl } from "./assisted_pilot_validation";
import { assertActivePilotBrief } from "./assisted_pilot_access";

export const assistedRejectionInputSchema = z.object({
  tenantId: z.string().min(1),
  targetingProfileId: z.string().uuid(),
  targetingProfileVersion: z.number().int().positive(),
  candidateId: z.string().uuid().optional(),
  entityUrl: publicUrl,
  sourceUrl: publicUrl,
  sourceChannel: z.enum(["official_site", "public_discussion", "licensed_provider", "customer_owned"]),
  reasonCode: z.enum([
    "missing_route", "unclear_identity", "fit_unverified", "source_temporarily_unavailable",
    "wrong_buyer", "excluded_account", "duplicate", "already_contacted",
    "weak_angle", "bad_evidence", "stale_claim", "source_rights", "sensitive_data",
  ]),
  researchMinutes: z.number().int().nonnegative(),
  reviewMinutes: z.number().int().nonnegative(),
  sourceCostUsd: z.number().nonnegative(),
  aiCostUsd: z.number().nonnegative(),
  reviewedBy: z.string().trim().min(1).max(120),
}).strict();

export type AssistedRejectionInput = z.infer<typeof assistedRejectionInputSchema>;

async function recordRejection(input: AssistedRejectionInput): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await assertActivePilotBrief(
    db, input.tenantId, input.targetingProfileId, input.targetingProfileVersion,
  );
  const { data, error } = await db.from("assisted_prospect_rejections").insert({
    tenant_id: input.tenantId,
    targeting_profile_id: input.targetingProfileId,
    targeting_profile_version: input.targetingProfileVersion,
    ...(input.candidateId ? { candidate_id: input.candidateId } : {}),
    entity_url: input.entityUrl,
    source_url: input.sourceUrl,
    source_channel: input.sourceChannel,
    reason_code: input.reasonCode,
    research_minutes: input.researchMinutes,
    review_minutes: input.reviewMinutes,
    source_cost_usd: input.sourceCostUsd,
    ai_cost_usd: input.aiCostUsd,
    reviewed_by: input.reviewedBy,
  }).select("id").single();
  if (error || !data) throw new Error(`Could not record rejection: ${error?.code ?? "unknown"}`);
  return data.id;
}

async function main() {
  const [path, mode] = process.argv.slice(2);
  if (!path || (mode && mode !== "--commit")) {
    throw new Error("Usage: pnpm exec tsx scripts/record_assisted_rejection.ts rejection.json [--commit]");
  }
  const parsed = assistedRejectionInputSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (mode !== "--commit") {
    process.stdout.write("Rejection validates locally. Add --commit to record it.\n");
    return;
  }
  const id = await recordRejection(parsed);
  process.stdout.write(`Recorded rejection ${id}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/record_assisted_rejection.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Recording failed"}\n`);
    process.exitCode = 1;
  });
}
