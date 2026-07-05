import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";

const TOKEN_MIN_LENGTH = 32;
const TOKEN_MAX_LENGTH = 256;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function successResponse() {
  return new NextResponse(
    "<!doctype html><html><body><p>You have been unsubscribed from recovery emails.</p></body></html>",
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

async function suppressByToken(token: string) {
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    return;
  }

  const supabase = getAdminClient() as any;
  const { data: sends, error: lookupError } = await supabase
    .from("recovery_emails")
    .select("id, tenant_id, email")
    .eq("dispatch_token", token)
    .limit(1);

  const send = Array.isArray(sends) ? sends[0] : null;

  if (lookupError || !send?.tenant_id || !send?.email) {
    if (lookupError) {
      console.warn("[RECOVERY_UNSUBSCRIBE] token lookup failed", { error: lookupError });
    }
    return;
  }

  const normalizedEmail = String(send.email).trim().toLowerCase();
  const tenantId = String(send.tenant_id);

  await supabase
    .from("recovery_suppressions")
    .upsert(
      {
        tenant_id: tenantId,
        email: normalizedEmail,
        reason: "user_unsubscribe",
        expires_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,email" }
    );

  await supabase
    .from("recovery_emails")
    .update({
      status: "suppressed",
      failure_stage: "validation",
      last_error: "user_unsubscribed",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("email", normalizedEmail)
    .in("status", ["pending_dispatch", "queued", "dispatch_claimed", "dispatching", "dispatch_failed"]);
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  await suppressByToken(token);
  return successResponse();
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  await suppressByToken(token);
  return NextResponse.json({ status: "unsubscribed" });
}
