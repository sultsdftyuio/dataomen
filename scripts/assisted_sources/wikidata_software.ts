/** Bounded Wikidata software-company research. Rows are candidate accounts, never recommendations. */
import { z } from "zod";

import { normalizeAssistedAccount } from "../assisted_account_identity";
import { publicUrl, safeText } from "../assisted_pilot_validation";

const endpoint = "https://query.wikidata.org/sparql";
const wikidataItem = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;
const sharedHosts = new Set([
  "github.com", "gitlab.com", "linkedin.com", "youtube.com", "facebook.com",
  "x.com", "twitter.com", "medium.com", "apps.apple.com", "play.google.com",
]);

const binding = z.object({ value: z.string() });
const resultSchema = z.object({
  results: z.object({ bindings: z.array(z.object({
    item: binding,
    name: binding.optional(),
    website: binding,
  })) }),
});

export type WikidataCandidate = {
  itemId: string;
  companyName: string | null;
  websiteUrl: string;
  sourceUrl: string;
  domain: string;
};

export function softwareCompanyQuery(offset: number, limit: number): string {
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000
      || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Wikidata research requires offset 0–10000 and limit 1–100.");
  }
  // The source class is broad. Review must still establish active company, current site and ICP fit.
  return `SELECT ?item (SAMPLE(?label) AS ?name) (SAMPLE(?site) AS ?website) WHERE {
  ?item wdt:P31/wdt:P279* wd:Q1058914 ; wdt:P856 ?site .
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
} GROUP BY ?item ORDER BY ?item LIMIT ${limit} OFFSET ${offset}`;
}

export function normalizeWikidataRows(raw: unknown) {
  const rows = resultSchema.parse(raw).results.bindings;
  const candidates = new Map<string, WikidataCandidate>();
  const rejected = { invalidItem: 0, invalidWebsite: 0, sharedHost: 0, duplicateDomain: 0 };
  for (const row of rows) {
    const itemId = wikidataItem.exec(row.item.value)?.[1];
    if (!itemId) { rejected.invalidItem += 1; continue; }
    const website = publicUrl.safeParse(row.website.value);
    if (!website.success) { rejected.invalidWebsite += 1; continue; }
    let domain: string;
    try { domain = normalizeAssistedAccount(website.data).domain; }
    catch { rejected.invalidWebsite += 1; continue; }
    if (sharedHosts.has(domain)) { rejected.sharedHost += 1; continue; }
    if (candidates.has(domain)) { rejected.duplicateDomain += 1; continue; }
    const name = row.name?.value.trim() || null;
    candidates.set(domain, {
      itemId, companyName: name && name.length <= 240 && safeText.safeParse(name).success ? name : null,
      websiteUrl: website.data, sourceUrl: `https://www.wikidata.org/wiki/${itemId}`, domain,
    });
  }
  return { sourceRows: rows.length, candidates: [...candidates.values()], rejected };
}

export async function fetchWikidataSoftwarePage(
  offset: number, limit: number, fetcher: typeof fetch = fetch,
) {
  const url = new URL(endpoint);
  url.searchParams.set("query", softwareCompanyQuery(offset, limit));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "ArcliSourceResearch/0.1 (https://www.arcli.tech; support@arcli.tech)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return normalizeWikidataRows(await response.json());
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) {
      throw new Error(`Wikidata returned HTTP ${response.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Wikidata research failed.");
}
