/** Private account intake from an approved source export. Dry run by default. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ensureAssistedAccountEntity, normalizeAssistedAccount } from "./assisted_account_identity";
import { assertActivePilotBrief } from "./assisted_pilot_access";
import { publicUrl, safeText } from "./assisted_pilot_validation";

export const candidateAccountSchema = z.object({
  websiteUrl: publicUrl,
  companyName: safeText.refine((value) => value.length <= 240).nullable(),
  sourceUrl: publicUrl.nullable(),
}).strict();

export const candidateSourceSchema = z.object({
  kind: z.enum(["customer_owned", "licensed_provider", "approved_directory", "manual_research"]),
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/),
  rightsApprovalRef: safeText,
  observedAt: z.string().datetime(),
  retentionDays: z.number().int().min(1).max(89),
}).strict();

export const candidateBatchSchema = z.object({
  tenantId: z.string().min(1),
  targetingProfileId: z.string().uuid(),
  targetingProfileVersion: z.number().int().positive(),
  source: candidateSourceSchema,
  accounts: z.array(candidateAccountSchema).min(1).max(200),
}).strict().superRefine((batch, context) => {
  if (Date.parse(batch.source.observedAt) > Date.now()) {
    context.addIssue({ code: "custom", path: ["source", "observedAt"], message: "Source observation cannot be in the future." });
  }
  if (Date.parse(batch.source.observedAt)
      + batch.source.retentionDays * 24 * 60 * 60 * 1000 <= Date.now()) {
    context.addIssue({ code: "custom", path: ["source", "retentionDays"],
      message: "The approved retention window has already expired." });
  }
  const names = new Map<string, string>();
  batch.accounts.forEach((account, index) => {
    try {
      const { domain } = normalizeAssistedAccount(account.websiteUrl);
      const name = account.companyName?.trim().toLowerCase();
      const prior = names.get(domain);
      if (name && prior && prior !== name) {
        context.addIssue({ code: "custom", path: ["accounts", index, "companyName"],
          message: `Conflicting company names for ${domain}; review the identity before import.` });
      }
      if (name) names.set(domain, name);
    } catch (error) {
      context.addIssue({ code: "custom", path: ["accounts", index, "websiteUrl"], message: error instanceof Error ? error.message : "Invalid account URL." });
    }
    if ((batch.source.kind === "approved_directory" || batch.source.kind === "manual_research")
        && !account.sourceUrl) {
      context.addIssue({ code: "custom", path: ["accounts", index, "sourceUrl"], message: "This source requires a reviewable listing URL." });
    }
  });
});

export type CandidateBatch = z.infer<typeof candidateBatchSchema>;

export function uniqueCandidateAccounts(batch: CandidateBatch) {
  const unique = new Map<string, CandidateBatch["accounts"]>();
  for (const account of batch.accounts) {
    const { domain } = normalizeAssistedAccount(account.websiteUrl);
    const sightings = unique.get(domain) ?? [];
    // Different listing URLs are distinct source observations of one account.
    if (!sightings.some((seen) => seen.sourceUrl === account.sourceUrl)) {
      sightings.push(account);
    }
    unique.set(domain, sightings);
  }
  return unique;
}

function observationKey(batch: CandidateBatch, domain: string, sourceUrl: string | null): string {
  return createHash("sha256").update(JSON.stringify([
    batch.source.kind, batch.source.key, domain, sourceUrl,
  ])).digest("hex");
}

type ImportResult = {
  inputRows: number;
  uniqueDomains: number;
  duplicateRows: number;
  suppressed: number;
  recentlyDelivered: number;
  alreadyDeliveredInRevision: number;
  newCandidates: number;
  existingCandidates: number;
  existingRejected: number;
  observationsAdded: number;
  observationsRefreshed: number;
};

export async function importAssistedCandidates(batch: CandidateBatch): Promise<ImportResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await assertActivePilotBrief(
    db, batch.tenantId, batch.targetingProfileId, batch.targetingProfileVersion, "account",
  );
  const { data: approvedSource, error: approvalError } = await db.from("assisted_source_approvals")
    .select("source_kind,approval_ref,max_retention_days,approval_status,valid_until")
    .eq("tenant_id", batch.tenantId).eq("source_key", batch.source.key).maybeSingle();
  if (approvalError || !approvedSource || approvedSource.approval_status !== "active"
      || Date.parse(approvedSource.valid_until) <= Date.now()
      || approvedSource.source_kind !== batch.source.kind
      || approvedSource.approval_ref !== batch.source.rightsApprovalRef
      || batch.source.retentionDays > approvedSource.max_retention_days) {
    throw new Error("Source approval is missing, expired, revoked, or does not cover this retention window.");
  }
  const accounts = uniqueCandidateAccounts(batch);
  const domains = [...accounts.keys()];
  const result: ImportResult = {
    inputRows: batch.accounts.length,
    uniqueDomains: accounts.size,
    duplicateRows: batch.accounts.length - accounts.size,
    suppressed: 0,
    recentlyDelivered: 0,
    alreadyDeliveredInRevision: 0,
    newCandidates: 0,
    existingCandidates: 0,
    existingRejected: 0,
    observationsAdded: 0,
    observationsRefreshed: 0,
  };

  // Keep each PostgREST URL bounded. An exact tenant-domain suppression wins
  // over every candidate source and applies even after it was queued.
  const suppressed = new Set<string>();
  for (let offset = 0; offset < domains.length; offset += 50) {
    const { data, error } = await db.from("assisted_account_suppressions")
      .select("domain").eq("tenant_id", batch.tenantId)
      .is("cleared_at", null).in("domain", domains.slice(offset, offset + 50));
    if (error) throw new Error(`Suppression lookup failed: ${error.code}`);
    data?.forEach((row) => suppressed.add(row.domain));
  }

  for (const [domain, sightings] of accounts) {
    try {
      if (suppressed.has(domain)) {
        result.suppressed += 1;
        continue;
      }
      const account = sightings[0];
      const identity = normalizeAssistedAccount(account.websiteUrl);
      const entityId = await ensureAssistedAccountEntity(
        db, batch.tenantId, identity,
        sightings.find((item) => item.companyName)?.companyName ?? null,
      );
      const recentDelivery = await db.from("assisted_prospect_deliveries")
        .select("id").eq("tenant_id", batch.tenantId)
        .eq("prospect_entity_id", entityId)
        .gte("delivered_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (recentDelivery.error) throw new Error(`Delivery lookup failed: ${recentDelivery.error.code}`);
      if (recentDelivery.data?.length) {
        result.recentlyDelivered += 1;
        continue;
      }

      const candidateId = await ensureCandidate(db, batch, entityId, domain, result);
      if (!candidateId) continue;
      for (const sighting of sightings) {
        const sourceUrl = sighting.sourceUrl;
        const keyHash = observationKey(batch, domain, sourceUrl);
        const prior = await db.from("assisted_candidate_observations")
          .select("id").eq("tenant_id", batch.tenantId).eq("candidate_id", candidateId)
          .eq("observation_key", keyHash).maybeSingle();
        if (prior.error) throw new Error(`Observation lookup failed: ${prior.error.code}`);
        const saved = await db.from("assisted_candidate_observations").upsert({
          tenant_id: batch.tenantId,
          candidate_id: candidateId,
          observation_key: keyHash,
          source_kind: batch.source.kind,
          source_key: batch.source.key,
          source_url: sourceUrl,
          rights_approval_ref: batch.source.rightsApprovalRef,
          observed_at: batch.source.observedAt,
          retention_expires_at: new Date(
            Date.parse(batch.source.observedAt)
            + batch.source.retentionDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }, { onConflict: "tenant_id,candidate_id,observation_key" });
        if (saved.error) throw new Error(`Observation save failed: ${saved.error.code}`);
        if (prior.data) result.observationsRefreshed += 1;
        else result.observationsAdded += 1;
      }
    } catch (error) {
      throw new Error(
        `Import stopped at ${domain} after ${result.newCandidates + result.existingCandidates + result.suppressed + result.recentlyDelivered + result.alreadyDeliveredInRevision} of ${accounts.size} domains; safe to retry. ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  return result;
}

async function ensureCandidate(
  db: SupabaseClient<any, any, any>, batch: CandidateBatch,
  entityId: string, domain: string, result: ImportResult,
): Promise<string | null> {
  const query = () => db.from("assisted_prospect_candidates").select("id,status,prospect_entity_id")
    .eq("tenant_id", batch.tenantId)
    .eq("targeting_profile_id", batch.targetingProfileId)
    .eq("targeting_profile_version", batch.targetingProfileVersion)
    .eq("domain", domain).maybeSingle();
  const existing = await query();
  if (existing.error) throw new Error(`Candidate lookup failed: ${existing.error.code}`);
  if (existing.data) {
    if (existing.data.prospect_entity_id && existing.data.prospect_entity_id !== entityId) {
      throw new Error(`Domain ${domain} points to conflicting entities.`);
    }
    if (existing.data.status === "delivered") {
      result.alreadyDeliveredInRevision += 1;
      return null;
    }
    result.existingCandidates += 1;
    if (existing.data.status === "rejected") result.existingRejected += 1;
    const refreshed = await db.from("assisted_prospect_candidates")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.data.id).eq("tenant_id", batch.tenantId);
    if (refreshed.error) throw new Error(`Candidate refresh failed: ${refreshed.error.code}`);
    return existing.data.id;
  }
  const inserted = await db.from("assisted_prospect_candidates").insert({
    tenant_id: batch.tenantId,
    targeting_profile_id: batch.targetingProfileId,
    targeting_profile_version: batch.targetingProfileVersion,
    prospect_entity_id: entityId,
    domain,
  }).select("id").single();
  if (!inserted.error && inserted.data) {
    result.newCandidates += 1;
    return inserted.data.id;
  }
  if (inserted.error?.code === "23505") {
    const raced = await query();
    if (!raced.error && raced.data) {
      if (raced.data.status === "delivered") {
        result.alreadyDeliveredInRevision += 1;
        return null;
      }
      result.existingCandidates += 1;
      if (raced.data.status === "rejected") result.existingRejected += 1;
      return raced.data.id;
    }
  }
  throw new Error(`Candidate creation failed: ${inserted.error?.code ?? "unknown"}`);
}

async function main() {
  const [path, mode] = process.argv.slice(2);
  if (!path || (mode && mode !== "--commit")) {
    throw new Error("Usage: pnpm exec tsx scripts/import_assisted_candidates.ts batch.json [--commit]");
  }
  const batch = candidateBatchSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const uniqueDomains = uniqueCandidateAccounts(batch).size;
  if (mode !== "--commit") {
    process.stdout.write(`${JSON.stringify({
      mode: "dry_run", inputRows: batch.accounts.length,
      uniqueDomains, duplicateRows: batch.accounts.length - uniqueDomains,
      source: batch.source.key,
    }, null, 2)}\n`);
    return;
  }
  const result = await importAssistedCandidates(batch);
  process.stdout.write(`${JSON.stringify({ mode: "committed", ...result }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/import_assisted_candidates.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
    process.exitCode = 1;
  });
}
