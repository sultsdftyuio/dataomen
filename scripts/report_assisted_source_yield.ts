/** Staff-only report for one intake cohort, measured as of the report run. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  summarizeSourceYield, type YieldCandidate, type YieldDelivery,
  type YieldFeedback, type YieldObservation,
} from "./assisted_sources/source_yield";

async function loadRelated(
  db: SupabaseClient<any, any, any>, table: string, select: string,
  field: string, tenantId: string, ids: string[],
): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const { data, error } = await db.from(table).select(select).eq("tenant_id", tenantId)
      .in(field, ids.slice(offset, offset + 50)).limit(1000);
    if (error || !data || data.length === 1000) {
      throw new Error(`${table} window could not be loaded safely: ${error?.code ?? "limit"}`);
    }
    rows.push(...data);
  }
  return rows;
}

async function main() {
  const [tenantId, profileArg, revisionArg, from, to] = process.argv.slice(2);
  const profileId = z.string().uuid().parse(profileArg);
  const revision = z.coerce.number().int().positive().parse(revisionArg);
  const start = Date.parse(from ?? "");
  const end = Date.parse(to ?? "");
  if (!tenantId || !Number.isFinite(start) || !Number.isFinite(end)
      || end <= start || end - start > 8 * 24 * 60 * 60 * 1000) {
    throw new Error("Usage: pnpm exec tsx scripts/report_assisted_source_yield.ts TENANT_ID PROFILE_UUID REVISION FROM_UTC TO_UTC");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: candidates, error } = await db.from("assisted_prospect_candidates")
    .select("id,domain,status").eq("tenant_id", tenantId)
    .eq("targeting_profile_id", profileId).eq("targeting_profile_version", revision)
    .gte("first_seen_at", new Date(start).toISOString())
    .lt("first_seen_at", new Date(end).toISOString()).limit(1000);
  if (error || !candidates || candidates.length === 1000) {
    throw new Error(`Candidate cohort could not be loaded safely: ${error?.code ?? "limit"}`);
  }
  const ids = candidates.map((row) => row.id);
  const [observations, deliveries] = await Promise.all([
    loadRelated(db, "assisted_candidate_observations",
      "candidate_id,source_key,source_kind", "candidate_id", tenantId, ids),
    loadRelated(db, "assisted_prospect_deliveries",
      "id,candidate_id", "candidate_id", tenantId, ids),
  ]);
  const feedback = await loadRelated(db, "assisted_prospect_feedback",
    "id,delivery_id,user_id,verdict,created_at", "delivery_id", tenantId,
    deliveries.map((row) => row.id));
  const report = summarizeSourceYield(
    candidates as YieldCandidate[], observations as YieldObservation[],
    deliveries as YieldDelivery[], feedback as YieldFeedback[],
  );
  process.stdout.write(`${JSON.stringify({
    tenantId, targetingProfileId: profileId, targetingProfileVersion: revision,
    from: new Date(start).toISOString(), to: new Date(end).toISOString(),
    measuredAt: new Date().toISOString(), ...report,
  }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/report_assisted_source_yield.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Source yield report failed"}\n`);
    process.exitCode = 1;
  });
}
