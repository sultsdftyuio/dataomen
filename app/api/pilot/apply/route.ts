import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { pilotApplicationSchema } from "@/lib/pilot/application";
import { createServiceRoleClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const maxBodyBytes = 8_192;

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fingerprint(request: Request, salt: string, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = request.headers.get("x-real-ip")?.trim() || forwarded;
  return createHmac("sha256", salt).update(`pilot-application:${clientIp || `email:${email}`}`).digest("hex");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Submit the form from Arcli." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBodyBytes) return NextResponse.json({ error: "Application is too long." }, { status: 413 });
  const body = await readLimitedBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Application is too long." }, { status: 413 });
  }
  let payload: unknown;
  try { payload = JSON.parse(body || "null"); }
  catch { payload = null; }
  const parsed = pilotApplicationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check your website, email, offer, and ideal customer details." }, { status: 400 });
  }
  // A filled hidden field is treated as bot traffic without confirming to the sender.
  if (parsed.data.companyFax) {
    return NextResponse.json({ status: "received" }, { status: 202 });
  }
  const salt = process.env.ARCLI_PILOT_APPLICATION_SALT;
  if (!salt || salt.length < 32) {
    console.error("[PILOT_APPLICATION] rate-limit salt is not configured");
    return NextResponse.json({ error: "Applications are temporarily unavailable. Email support@arcli.tech." }, { status: 503 });
  }
  const requesterFingerprint = fingerprint(request, salt, parsed.data.email);
  try {
    const db = createServiceRoleClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const { count, error: countError } = await db.from("pilot_applications" as never)
      .select("id", { count: "exact", head: true })
      .eq("requester_fingerprint", requesterFingerprint).gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: "Please wait before sending another application." }, { status: 429 });
    }
    const { error: insertError } = await db.from("pilot_applications" as never).insert({
      requester_fingerprint: requesterFingerprint,
      email: parsed.data.email,
      website_url: parsed.data.websiteUrl,
      offer: parsed.data.offer,
      ideal_customer: parsed.data.idealCustomer,
      buyer_role: parsed.data.buyerRole || null,
      geography: parsed.data.geography || null,
    } as never);
    if (insertError) throw insertError;
  } catch (error) {
    console.error("[PILOT_APPLICATION] application could not be stored", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Applications are temporarily unavailable. Email support@arcli.tech." }, { status: 503 });
  }
  return NextResponse.json({ status: "received" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
