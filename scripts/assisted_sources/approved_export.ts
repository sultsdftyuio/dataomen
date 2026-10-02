/** Convert a rights-approved, three-column CSV export into bounded intake batches. */
import { z } from "zod";

import { normalizeAssistedAccount } from "../assisted_account_identity";
import {
  candidateBatchSchema, candidateSourceSchema, type CandidateBatch,
} from "../import_assisted_candidates";

export const exportManifestSchema = z.object({
  tenantId: z.string().min(1),
  targetingProfileId: z.string().uuid(),
  targetingProfileVersion: z.number().int().positive(),
  source: candidateSourceSchema,
}).strict();
export type ExportManifest = z.infer<typeof exportManifestSchema>;

const expectedColumns = ["website_url", "company_name", "source_url"];
const maxExportRows = 5000;

export function parseApprovedExportCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const finishRow = () => {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    field = "";
    closedQuote = false;
    if (rows.length > maxExportRows + 1) throw new Error("Approved export exceeds 5000 rows.");
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field || closedQuote) throw new Error(`Unexpected quote near CSV row ${rows.length + 1}.`);
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
    } else if (closedQuote && char !== " " && char !== "\t") {
      throw new Error(`Unexpected text after a quote near CSV row ${rows.length + 1}.`);
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field.");
  if (row.length || field) finishRow();
  if (!rows.length || rows[0].length !== expectedColumns.length
      || rows[0].some((value, index) => value.trim() !== expectedColumns[index])) {
    throw new Error("CSV must contain exactly website_url,company_name,source_url columns.");
  }
  return rows.slice(1);
}

export function prepareApprovedExport(manifest: ExportManifest, csv: string) {
  const rows = parseApprovedExportCsv(csv);
  if (!rows.length) throw new Error("Approved export has no company rows.");
  const accounts: CandidateBatch["accounts"] = [];
  const names = new Map<string, string>();
  const sightings = new Set<string>();
  const domains = new Set<string>();
  rows.forEach((cells, index) => {
    if (cells.length !== expectedColumns.length) {
      throw new Error(`CSV row ${index + 2} has ${cells.length} columns; expected three.`);
    }
    const account = {
      websiteUrl: cells[0].trim(),
      companyName: cells[1].trim() || null,
      sourceUrl: cells[2].trim() || null,
    };
    const parsed = candidateBatchSchema.safeParse({ ...manifest, accounts: [account] });
    if (!parsed.success) {
      throw new Error(`CSV row ${index + 2} is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`);
    }
    const domain = normalizeAssistedAccount(account.websiteUrl).domain;
    const name = account.companyName?.toLowerCase();
    const priorName = names.get(domain);
    if (name && priorName && name !== priorName) {
      throw new Error(`CSV row ${index + 2} names ${domain} differently; review its identity.`);
    }
    if (name) names.set(domain, name);
    domains.add(domain);
    const key = JSON.stringify([domain, account.sourceUrl]);
    if (!sightings.has(key)) {
      accounts.push(account);
      sightings.add(key);
    }
  });
  const batches: CandidateBatch[] = [];
  for (let offset = 0; offset < accounts.length; offset += 200) {
    batches.push(candidateBatchSchema.parse({
      ...manifest, accounts: accounts.slice(offset, offset + 200),
    }));
  }
  return {
    inputRows: rows.length,
    uniqueDomains: domains.size,
    duplicateRows: rows.length - domains.size,
    uniqueSightings: accounts.length,
    batches,
  };
}
