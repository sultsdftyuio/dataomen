/** Research a bounded Wikidata page; optionally prepare an approved-source candidate batch. */
import { readFile, writeFile } from "node:fs/promises";

import { exportManifestSchema } from "./assisted_sources/approved_export";
import { fetchWikidataSoftwarePage } from "./assisted_sources/wikidata_software";
import { candidateBatchSchema } from "./import_assisted_candidates";

async function main() {
  const [offsetText, limitText, manifestPath, outputPath] = process.argv.slice(2);
  if (!offsetText || !limitText || Boolean(manifestPath) !== Boolean(outputPath)) {
    throw new Error("Usage: pnpm exec tsx scripts/research_wikidata_accounts.ts <offset> <limit> [approved-manifest.json candidate-batch.json]");
  }
  const offset = Number(offsetText);
  const limit = Number(limitText);
  const result = await fetchWikidataSoftwarePage(offset, limit);
  const summary = {
    source: "wikidata_software_companies", offset, limit,
    sourceRows: result.sourceRows, uniqueDomains: result.candidates.length,
    rejected: result.rejected,
    warning: "Unverified account candidates only. Current website, identity, fit and contact route require review.",
  };
  if (manifestPath && outputPath) {
    const manifest = exportManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    if (manifest.source.kind !== "approved_directory" || !manifest.source.key.startsWith("wikidata_")) {
      throw new Error("Use a separately approved Wikidata directory source key in the manifest.");
    }
    if (!result.candidates.length) throw new Error("Page contains no candidate accounts.");
    const batch = candidateBatchSchema.parse({
      ...manifest,
      source: { ...manifest.source, observedAt: new Date().toISOString() },
      accounts: result.candidates.map(({ websiteUrl, companyName, sourceUrl }) => ({
        websiteUrl, companyName, sourceUrl,
      })),
    });
    await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`, { flag: "wx" });
    process.stdout.write(`${JSON.stringify({ ...summary, candidateBatch: outputPath }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ ...summary,
    sample: result.candidates.slice(0, 20),
  }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/research_wikidata_accounts.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Research failed"}\n`);
    process.exitCode = 1;
  });
}
