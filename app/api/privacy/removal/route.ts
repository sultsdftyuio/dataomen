import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const MAX_REQUESTS_PER_DAY = 3;
const REQUEST_WINDOW_HOURS = 24;

const RemovalRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  sourceUrl: z.string().trim().url().max(4096),
  source: z.enum(["hackernews", "bluesky", "stackexchange", "github", "lemmy"]).optional(),
  sourceHandle: z.string().trim().min(1).max(512).optional(),
  details: z.string().trim().max(2000).optional(),
});

function sourceFromUrl(value: string): string | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "news.ycombinator.com" || hostname.endsWith("ycombinator.com")) {
      return "hackernews";
    }
    if (hostname === "bsky.app" || hostname.endsWith("bsky.app")) return "bluesky";
    if (hostname === "github.com" || hostname.endsWith("github.com")) return "github";
    if (hostname.endsWith("stackexchange.com") || hostname === "stackoverflow.com") {
      return "stackexchange";
    }
    if (hostname === "lemmy.world" || hostname.endsWith(".lemmy.world")) return "lemmy";
    if (hostname === "x.com" || hostname.endsWith("x.com")) return "twitter";
  } catch {
    return null;
  }
  return null;
}

function requesterFingerprint(request: Request): string | null {
  const salt = process.env.ARCLI_PRIVACY_REQUEST_SALT;
  if (!salt) return null;
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", salt).update(clientIp).digest("hex");
}

export async function POST(request: Request) {
  const parsed = RemovalRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address and a link to the public post." },
      { status: 400 }
    );
  }

  const source = parsed.data.source ?? sourceFromUrl(parsed.data.sourceUrl);
  if (!source) {
    return NextResponse.json(
      { error: "That link is not from a source Arcli currently supports." },
      { status: 400 }
    );
  }

  const fingerprint = requesterFingerprint(request);
  if (!fingerprint) {
    console.error("[PRIVACY_REMOVAL] rate-limit secret is not configured");
    return NextResponse.json(
      { error: "The removal request service is temporarily unavailable. Please email support@arcli.tech." },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceRoleClient() as any;
    const since = new Date(
      Date.now() - REQUEST_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();
    const { count, error: rateLimitError } = await supabase
      .from("public_data_removal_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_fingerprint", fingerprint)
      .gte("created_at", since);

    if (rateLimitError) throw rateLimitError;
    if ((count ?? 0) >= MAX_REQUESTS_PER_DAY) {
      return NextResponse.json(
        { error: "Please wait before submitting another removal request." },
        { status: 429, headers: { "Retry-After": "86400" } }
      );
    }

    const { error: insertError } = await supabase
      .from("public_data_removal_requests")
      .insert({
        requester_email: parsed.data.email.toLowerCase(),
        requester_fingerprint: fingerprint,
        source,
        source_url: parsed.data.sourceUrl,
        author_handle: parsed.data.sourceHandle || null,
        details: parsed.data.details || null,
      });
    if (insertError) throw insertError;
  } catch (error) {
    console.error("[PRIVACY_REMOVAL] request could not be stored", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "We could not accept the request right now. Please email support@arcli.tech." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { status: "received", message: "Your request has been received for identity review." },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}
