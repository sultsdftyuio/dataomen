/** Staff-only workspace account exclusions. Dry run unless --commit is set. */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeAssistedAccount } from "./assisted_account_identity";
import { publicUrl } from "./assisted_pilot_validation";

export const suppressionBatchSchema = z.object({
  tenantId: z.string().min(1),
  sourceKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/),
  accounts: z.array(z.object({
    websiteUrl: publicUrl,
    reasonCode: z.enum([
      "existing_customer", "active_opportunity", "do_not_contact",
      "competitor", "already_contacted", "customer_excluded",
    ]),
  }).strict()).min(1).max(500),
}).strict().superRefine((batch, context) => {
  const reasons = new Map<string, string>();
  batch.accounts.forEach((account, index) => {
    try {
      const { domain } = normalizeAssistedAccount(account.websiteUrl);
      const prior = reasons.get(domain);
      if (prior && prior !== account.reasonCode) {
        context.addIssue({
          code: "custom", path: ["accounts", index],
          message: `Conflicting exclusion reasons for ${domain}.`,
        });
      }
      reasons.set(domain, account.reasonCode);
    } catch (error) {
      context.addIssue({
        code: "custom", path: ["accounts", index, "websiteUrl"],
        message: error instanceof Error ? error.message : "Invalid account URL.",
      });
    }
  });
});

export type SuppressionBatch = z.infer<typeof suppressionBatchSchema>;

export function uniqueSuppressions(batch: SuppressionBatch) {
  const unique = new Map<string, SuppressionBatch["accounts"][number]["reasonCode"]>();
  for (const account of batch.accounts) {
    unique.set(normalizeAssistedAccount(account.websiteUrl).domain, account.reasonCode);
  }
  return unique;
}

export async function importAssistedSuppressions(batch: SuppressionBatch) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = uniqueSuppressions(batch);
  const domains = [...unique.keys()];
  for (let offset = 0; offset < domains.length; offset += 50) {
    const { data, error } = await db.from("assisted_account_suppressions")
      .select("domain,reason_code").eq("tenant_id", batch.tenantId)
      .in("domain", domains.slice(offset, offset + 50));
    if (error) throw new Error(`Existing suppression lookup failed: ${error.code}`);
    for (const prior of data ?? []) {
      if (prior.reason_code !== unique.get(prior.domain)) {
        throw new Error(`Conflicting existing exclusion for ${prior.domain}; review it before import.`);
      }
    }
  }
  const rows = [...unique].map(([domain, reasonCode]) => ({
    tenant_id: batch.tenantId,
    domain,
    reason_code: reasonCode,
    source_key: batch.sourceKey,
    suppressed_at: new Date().toISOString(),
    cleared_at: null,
  }));
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { error } = await db.from("assisted_account_suppressions")
      .upsert(rows.slice(offset, offset + 100), { onConflict: "tenant_id,domain" });
    if (error) throw new Error(`Suppression import failed after ${offset} rows: ${error.code}. Safe to retry.`);
  }
  return { inputRows: batch.accounts.length, uniqueDomains: unique.size,
    duplicateRows: batch.accounts.length - unique.size };
}

async function main() {
  const [path, mode] = process.argv.slice(2);
  if (!path || (mode && mode !== "--commit")) {
    throw new Error("Usage: pnpm exec tsx scripts/import_assisted_suppressions.ts exclusions.json [--commit]");
  }
  const batch = suppressionBatchSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const unique = uniqueSuppressions(batch);
  if (mode !== "--commit") {
    process.stdout.write(`${JSON.stringify({ mode: "dry_run", inputRows: batch.accounts.length,
      uniqueDomains: unique.size, duplicateRows: batch.accounts.length - unique.size }, null, 2)}\n`);
    return;
  }
  const result = await importAssistedSuppressions(batch);
  process.stdout.write(`${JSON.stringify({ mode: "committed", ...result }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/import_assisted_suppressions.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
    process.exitCode = 1;
  });
}
