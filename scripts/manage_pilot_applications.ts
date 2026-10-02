/** Trusted-operator access to the private founding-pilot application queue. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const [operation, argument, status, commit] = process.argv.slice(2);
  if (!url || !key) throw new Error("Supabase service-role environment is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  if (operation === "list" && !argument && !status && !commit) {
    const { data, error } = await db.from("pilot_applications")
      .select("id,created_at,email,website_url,offer,ideal_customer,buyer_role,geography,status")
      .in("status", ["new", "reviewing"]).order("created_at", { ascending: true }).limit(50);
    if (error) throw error;
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  if (operation === "set-status" && argument && status) {
    if (!z.string().uuid().safeParse(argument).success
        || !["reviewing", "qualified", "declined", "closed"].includes(status)
        || (commit && commit !== "--commit")) {
      throw new Error("Usage: set-status UUID reviewing|qualified|declined|closed [--commit]");
    }
    if (commit !== "--commit") {
      process.stdout.write(`${JSON.stringify({ mode: "dry_run", id: argument, status })}\n`);
      return;
    }
    const { data, error } = await db.from("pilot_applications").update({
      status, reviewed_at: new Date().toISOString(),
    }).eq("id", argument).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Application does not exist.");
    process.stdout.write(`${JSON.stringify({ mode: "committed", id: argument, status })}\n`);
    return;
  }

  if (operation === "purge" && !status && !commit && (!argument || argument === "--commit")) {
    const now = new Date().toISOString();
    const { count, error } = await db.from("pilot_applications")
      .select("id", { count: "exact", head: true }).lt("expires_at", now);
    if (error) throw error;
    if (argument !== "--commit") {
      process.stdout.write(`${JSON.stringify({ mode: "dry_run", expired: count ?? 0 })}\n`);
      return;
    }
    const { error: deleteError } = await db.from("pilot_applications").delete().lt("expires_at", now);
    if (deleteError) throw deleteError;
    process.stdout.write(`${JSON.stringify({ mode: "committed", expired: count ?? 0 })}\n`);
    return;
  }

  throw new Error("Usage: manage_pilot_applications.ts list | set-status UUID status [--commit] | purge [--commit]");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Pilot application operation failed"}\n`);
  process.exitCode = 1;
});
