/** Staff-only research queue. Candidate rows are not customer leads. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { assertActivePilotBrief } from "./assisted_pilot_access";

const argumentsSchema = z.object({
  tenantId: z.string().min(1),
  targetingProfileId: z.string().uuid(),
  targetingProfileVersion: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(200),
  offset: z.coerce.number().int().nonnegative(),
  status: z.enum(["active", "rejected", "delivered"]),
});

async function main() {
  const [tenantId, targetingProfileId, targetingProfileVersion,
    limit = "100", offset = "0", status = "active"] = process.argv.slice(2);
  const args = argumentsSchema.parse({ tenantId, targetingProfileId,
    targetingProfileVersion, limit, offset, status });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await assertActivePilotBrief(
    db, args.tenantId, args.targetingProfileId,
    args.targetingProfileVersion, "account",
  );
  const { data: candidates, error } = await db.from("assisted_prospect_candidates")
    .select("id,domain,status,prospect_entity_id,first_seen_at,last_seen_at")
    .eq("tenant_id", args.tenantId)
    .eq("targeting_profile_id", args.targetingProfileId)
    .eq("targeting_profile_version", args.targetingProfileVersion)
    .in("status", args.status === "active" ? ["unreviewed", "researching"] : [args.status])
    .order("first_seen_at", { ascending: true })
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);
  if (error) throw new Error(`Candidate queue lookup failed: ${error.code}`);
  if (!candidates?.length) {
    process.stdout.write("[]\n");
    return;
  }
  const domains = candidates.map((row) => row.domain);
  const ids = candidates.map((row) => row.id);
  const entityIds = candidates.map((row) => row.prospect_entity_id);
  const [suppressionResult, entityResult, observationResult] = await Promise.all([
    db.from("assisted_account_suppressions").select("domain")
      .eq("tenant_id", args.tenantId).is("cleared_at", null).in("domain", domains),
    db.from("prospect_entities").select("id,title,canonical_url")
      .eq("tenant_id", args.tenantId).in("id", entityIds),
    db.from("assisted_candidate_observations")
      .select("candidate_id,source_kind,source_key,source_url,rights_approval_ref,observed_at,retention_expires_at")
      .eq("tenant_id", args.tenantId).in("candidate_id", ids)
      .gt("retention_expires_at", new Date().toISOString())
      .order("observed_at", { ascending: false }).limit(1000),
  ]);
  if (suppressionResult.error || entityResult.error || observationResult.error) {
    throw new Error("Candidate queue context could not be loaded.");
  }
  if (observationResult.data?.length === 1000) {
    throw new Error("Source observation window exceeds the safe queue limit.");
  }
  const approvalKeys = [...new Set(observationResult.data?.map((row) => row.source_key) ?? [])];
  const approvals = new Map<string, {
    source_kind: string; approval_ref: string; approval_status: string; valid_until: string;
  }>();
  for (let offset = 0; offset < approvalKeys.length; offset += 50) {
    const { data, error: approvalError } = await db.from("assisted_source_approvals")
      .select("source_key,source_kind,approval_ref,approval_status,valid_until")
      .eq("tenant_id", args.tenantId).in("source_key", approvalKeys.slice(offset, offset + 50));
    if (approvalError) throw new Error(`Source approval lookup failed: ${approvalError.code}`);
    data?.forEach((row) => approvals.set(row.source_key, row));
  }
  const suppressed = new Set(suppressionResult.data?.map((row) => row.domain));
  const entities = new Map(entityResult.data?.map((row) => [row.id, row]));
  const sources = new Map<string, typeof observationResult.data>();
  for (const observation of observationResult.data ?? []) {
    const approval = approvals.get(observation.source_key);
    if (!approval || approval.approval_status !== "active"
        || Date.parse(approval.valid_until) <= Date.now()
        || approval.source_kind !== observation.source_kind
        || approval.approval_ref !== observation.rights_approval_ref) continue;
    const group = sources.get(observation.candidate_id) ?? [];
    group.push(observation);
    sources.set(observation.candidate_id, group);
  }
  const queue = candidates.filter((row) =>
    !suppressed.has(row.domain) && (sources.get(row.id)?.length ?? 0) > 0,
  ).map((row) => ({
    candidateId: row.id,
    domain: row.domain,
    companyName: entities.get(row.prospect_entity_id)?.title ?? null,
    websiteUrl: entities.get(row.prospect_entity_id)?.canonical_url ?? null,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    sources: sources.get(row.id) ?? [],
  }));
  process.stdout.write(`${JSON.stringify({
    shown: queue.length,
    statusFilter: args.status,
    offset: args.offset,
    nextOffset: candidates.length === args.limit ? args.offset + args.limit : null,
    suppressedInWindow: candidates.filter((row) => suppressed.has(row.domain)).length,
    expiredSourceInWindow: candidates.filter((row) =>
      !suppressed.has(row.domain) && !(sources.get(row.id)?.length ?? 0),
    ).length,
    queue,
  }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/list_assisted_candidates.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Queue lookup failed"}\n`);
    process.exitCode = 1;
  });
}
