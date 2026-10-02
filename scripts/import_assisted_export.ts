/** Staff-only approved company export intake. Dry run unless --commit is set. */
import { readFile, stat } from "node:fs/promises";

import { exportManifestSchema, prepareApprovedExport } from "./assisted_sources/approved_export";
import { importAssistedCandidates } from "./import_assisted_candidates";

async function main() {
  const [manifestPath, csvPath, mode] = process.argv.slice(2);
  if (!manifestPath || !csvPath || (mode && mode !== "--commit")) {
    throw new Error("Usage: pnpm exec tsx scripts/import_assisted_export.ts manifest.json companies.csv [--commit]");
  }
  const size = await stat(csvPath);
  if (!size.isFile() || size.size > 5 * 1024 * 1024) {
    throw new Error("Approved export must be a CSV file no larger than 5 MiB.");
  }
  const manifest = exportManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const prepared = prepareApprovedExport(manifest, await readFile(csvPath, "utf8"));
  const summary = {
    inputRows: prepared.inputRows,
    uniqueDomains: prepared.uniqueDomains,
    duplicateRows: prepared.duplicateRows,
    uniqueSightings: prepared.uniqueSightings,
    batches: prepared.batches.length,
    source: manifest.source.key,
  };
  if (mode !== "--commit") {
    process.stdout.write(`${JSON.stringify({ mode: "dry_run", ...summary }, null, 2)}\n`);
    return;
  }
  const results = [];
  for (const [index, batch] of prepared.batches.entries()) {
    try {
      results.push(await importAssistedCandidates(batch));
    } catch (error) {
      throw new Error(
        `Export stopped at batch ${index + 1} of ${prepared.batches.length}; earlier batches are saved and rerunning the same export is safe. ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  process.stdout.write(`${JSON.stringify({ mode: "committed", ...summary, results }, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/import_assisted_export.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Export import failed"}\n`);
    process.exitCode = 1;
  });
}
