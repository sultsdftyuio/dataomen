/** Staff scheduler entry point: delete expired private source observations. */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const mode = process.argv[2];
  if (mode && mode !== "--commit") {
    throw new Error("Usage: pnpm exec tsx scripts/purge_assisted_observations.ts [--commit]");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service-role Supabase configuration is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  if (mode !== "--commit") {
    process.stdout.write("Dry run: --commit deletes up to 200 expired or revoked source observations.\n");
    return;
  }
  const { data: deleted, error } = await db.rpc(
    "purge_assisted_candidate_observations", { batch_size: 200 },
  );
  if (error || typeof deleted !== "number") {
    throw new Error(`Observation purge failed: ${error?.code ?? "invalid result"}`);
  }
  process.stdout.write(`${JSON.stringify({
    mode: "committed", deleted, moreMayRemain: deleted === 200,
  })}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/purge_assisted_observations.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Purge failed"}\n`);
    process.exitCode = 1;
  });
}
