// Force Node.js runtime — required for node:crypto and service-role client.
// Without this, Next.js may deploy to the Edge runtime where Node built-ins
// are unavailable and service-role credentials are unsafe.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import crypto from "crypto";
import { z } from "zod";

// ============================================================================
// CONSTANTS
// ============================================================================

const API_KEY_PREFIX      = "arcli_live_";
const API_KEY_ID_BYTES    = 8;   // → 16 hex chars (lookup token)
const API_KEY_SECRET_BYTES = 32; // → 64 hex chars (verified via HMAC-SHA256)

// Rate limiting: max rotations per user/tenant within the sliding window.
// Replace with a Redis token bucket (e.g. Upstash @upstash/ratelimit) once
// the api_keys table grows large — count("exact") will become expensive.
const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1_000; // 1 hour in ms

const API_KEY_PEPPER          = process.env.API_KEY_PEPPER;
const SUPABASE_URL             = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

// Never forward raw DB error messages to clients — they can expose table
// names, column names, constraint names, and Supabase internals.
// Log full detail server-side; return a fixed string to callers.

const SECURE_HEADERS = {
  "Cache-Control":         "no-store, max-age=0",
  "Pragma":                "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

const json = <T>(body: T, status: number) =>
  NextResponse.json(body, { status, headers: SECURE_HEADERS });

const unauthorized  = ()            => json({ error: "Unauthorized" }, 401);
const forbidden     = (msg: string) => json({ error: msg }, 403);
const tooManyReqs   = ()            => json({ error: "Too many key-generation requests. Please try again later." }, 429);
const conflict      = ()            => json({ error: "A concurrent key rotation is in progress. Please retry in a moment." }, 409);
const internalError = ()            => json({ error: "Failed to generate API key." }, 500);

// ============================================================================
// VALIDATION
// ============================================================================

const ApiKeyResponseSchema = z.object({ apiKey: z.string().min(1) });
type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Produces:  arcli_live_{keyId}_{secret}
 *
 * keyId  — stored in plain text; used as a fast DB lookup token.
 * secret — NEVER stored; only its HMAC-SHA256 is persisted (see hashSecret).
 */
const buildApiKey = () => {
  const keyId  = crypto.randomBytes(API_KEY_ID_BYTES).toString("hex");
  const secret = crypto.randomBytes(API_KEY_SECRET_BYTES).toString("hex");
  return { keyId, secret, apiKey: `${API_KEY_PREFIX}${keyId}_${secret}` };
};

/**
 * HMAC-SHA256 the secret with an env pepper so that a compromised database
 * alone cannot enumerate or reconstruct valid keys.
 *
 * Verification callers MUST use crypto.timingSafeEqual() when comparing the
 * recomputed hash against the stored hash — never use `===`.
 */
const hashSecret = (secret: string): string => {
  if (!API_KEY_PEPPER) throw new Error("API_KEY_PEPPER is not configured.");
  return crypto.createHmac("sha256", API_KEY_PEPPER).update(secret).digest("hex");
};

// ============================================================================
// ADMIN CLIENT
// ============================================================================

const createAdminClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service-role credentials are not configured.");
  }
  return createSupabaseAdminClient<Database>(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Sliding-window rate limiter backed by the api_keys table.
 * Counts rows created by this user AND this tenant within the window.
 *
 * Fails OPEN on DB error — a transient query failure should never hard-block
 * legitimate users.  Errors are logged so alerts fire.
 *
 * Idempotency note: this window also provides a natural debounce against rapid
 * double-submits.  For explicit idempotency-key support, store a short-lived
 * hash of the Idempotency-Key header in Redis (or a DB table) and short-circuit
 * here — the per-request approach below is sufficient for most SaaS needs.
 */
const isRateLimited = async (
  adminSupabase: AdminClient,
  userId:   string,
  tenantId: string
): Promise<boolean> => {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

  const [byUser, byTenant] = await Promise.all([
    adminSupabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .gte("created_at", since),
    adminSupabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
  ]);

  if (byUser.error || byTenant.error) {
    console.error("Rate-limit check failed — failing open", {
      userCode:   byUser.error?.code,
      tenantCode: byTenant.error?.code,
    });
    return false; // fail open
  }

  return (
    (byUser.count   ?? 0) >= RATE_LIMIT_MAX ||
    (byTenant.count ?? 0) >= RATE_LIMIT_MAX
  );
};

// ============================================================================
// REQUEST METADATA
// ============================================================================

/**
 * Extract client IP for audit logging.
 *
 * x-forwarded-for is trusted here because this app runs behind Vercel /
 * Cloudflare, which sanitise the header before it reaches the origin.
 * If you ever deploy without a trusted edge proxy, remove this header read
 * and use only x-real-ip (or a platform-specific header).
 */
const extractMeta = (request: NextRequest) => ({
  ipAddress: (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ),
  userAgent: request.headers.get("user-agent") ?? "unknown",
});

// ============================================================================
// ATOMIC KEY ROTATION
// ============================================================================

/**
 * Rotates the active API key for a tenant.
 *
 * ── How atomicity is achieved ──────────────────────────────────────────────
 *
 * With the partial unique index deployed (uix_api_keys_tenant_active):
 *
 *   INSERT is the first write.  If another active key already exists the
 *   unique index raises error 23505 immediately — before any revocation —
 *   so old keys are never touched until we know our new key can be stored.
 *
 *   On 23505 we revoke whatever is active and retry the insert ONCE.  A
 *   second 23505 means a concurrent rotation won the retry race; we surface
 *   a 409 so the caller can back off and retry.
 *
 *   This gives us serialised rotation with zero silent data corruption.
 *
 * Without the partial unique index:
 *
 *   The same code path executes.  23505 will never fire, so the
 *   revoke-on-conflict branch is skipped.  The cleanup revoke at the end
 *   (step 3) then handles any duplicates that slipped through.  Behaviour
 *   is operationally acceptable but not strictly atomic — apply the
 *   migration (migrate_partial_index.sql, one statement) to close the gap.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */
type RotationError = "conflict" | "insert" | "revoke" | "settings";

const rotateApiKey = async (params: {
  adminSupabase: AdminClient;
  tenantId:  string;
  userId:    string;
  keyId:     string;
  keyHash:   string;
  keyLast4:  string;
  ipAddress: string;
  userAgent: string;
}): Promise<RotationError | null> => {
  const { adminSupabase, tenantId, userId, keyId, keyHash, keyLast4, ipAddress, userAgent } = params;
  const now = new Date().toISOString();

  const newKeyRow = { tenant_id: tenantId, key_id: keyId, key_hash: keyHash, key_last4: keyLast4, created_by: userId };

  // ── Step 1: Insert new key ──────────────────────────────────────────────
  const { error: firstError } = await adminSupabase.from("api_keys").insert(newKeyRow);

  if (firstError) {
    if (firstError.code !== "23505") {
      console.error("API key insert failed", { code: firstError.code, tenantId });
      return "insert";
    }

    // 23505 — active key exists (unique index fired).
    // Revoke the blocking key, then retry the insert once.
    const { error: revokeError } = await adminSupabase
      .from("api_keys")
      .update({ revoked_at: now })
      .eq("tenant_id", tenantId)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("API key revoke-on-conflict failed", { code: revokeError.code, tenantId });
      return "revoke";
    }

    const { error: retryError } = await adminSupabase.from("api_keys").insert(newKeyRow);

    if (retryError) {
      // Second 23505 = concurrent rotation claimed the slot between our revoke
      // and our retry.  Surface a 409 so the client can back off and retry.
      if (retryError.code === "23505") return "conflict";
      console.error("API key insert retry failed", { code: retryError.code, tenantId });
      return "insert";
    }
  } else {
    // Insert succeeded first try.  Revoke any other active keys for this tenant
    // (.neq ensures we never revoke the key we just inserted).
    //
    // This is a no-op when the unique index is deployed (there can be at most
    // one active key, which is the one we just inserted).  It acts as a safety
    // net when the index is absent.
    const { error: cleanupError } = await adminSupabase
      .from("api_keys")
      .update({ revoked_at: now })
      .eq("tenant_id", tenantId)
      .neq("key_id", keyId)
      .is("revoked_at", null);

    if (cleanupError) {
      // Non-fatal: new key is live.  Old key(s) are un-revoked but will be
      // cleaned up on the next rotation.  Log loudly for ops visibility.
      console.error("API key cleanup revoke failed — old key(s) may remain active", {
        code: cleanupError.code,
        tenantId,
      });
    }
  }

  // ── Step 2: Sync tenant_settings ────────────────────────────────────────
  // NOTE: the column is named `api_key` but stores only the key_id prefix.
  // Rename to `active_key_id` in a future migration to prevent confusion.
  const { error: upsertError } = await adminSupabase
    .from("tenant_settings")
    .upsert(
      { tenant_id: tenantId, api_key: keyId, key_last_updated: now },
      { onConflict: "tenant_id" }
    );

  if (upsertError) {
    console.error("tenant_settings upsert failed", { code: upsertError.code, tenantId });
    return "settings";
  }

  // ── Step 3: Audit record ─────────────────────────────────────────────────
  // Structured console log for now — sufficient for log-aggregation pipelines
  // (Datadog, Axiom, etc.).  Migrate to an append-only DB table or SIEM when
  // compliance requirements demand tamper-proof, queryable audit trails.
  console.info("KEY_ROTATED", {
    event:     "KEY_ROTATED",
    tenantId,
    actorId:   userId,
    newKeyId:  keyId,
    ipAddress,
    userAgent,
    timestamp: now,
  });

  return null; // success
};

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiKeyResponse | { error: string }>> {
  try {
    // ── Authenticate ────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Authentication failed", { code: authError?.code });
      return unauthorized();
    }

    // ── Resolve tenant ──────────────────────────────────────────────────────
    // Return 403, not 404, to avoid confirming that a given user exists in the
    // system without a tenant relationship (user enumeration via status code).
    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (tenantError || !tenantUser) {
      console.error("Tenant lookup failed", { userId: user.id, code: tenantError?.code });
      return forbidden("Your account is not associated with a tenant.");
    }

    // ── Validate env prerequisites ──────────────────────────────────────────
    if (!API_KEY_PEPPER) {
      console.error("API_KEY_PEPPER is not set.");
      return internalError();
    }

    let adminSupabase: AdminClient;
    try {
      adminSupabase = createAdminClient();
    } catch (err) {
      console.error("Admin client init failed", { message: err instanceof Error ? err.message : String(err) });
      return internalError();
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    if (await isRateLimited(adminSupabase, user.id, tenantUser.tenant_id)) {
      console.warn("Rate limit exceeded", { userId: user.id, tenantId: tenantUser.tenant_id });
      return tooManyReqs();
    }

    // ── Generate key material ────────────────────────────────────────────────
    const { apiKey, keyId, secret } = buildApiKey();
    const keyHash  = hashSecret(secret);
    const keyLast4 = secret.slice(-4);
    const { ipAddress, userAgent } = extractMeta(request);

    // ── Rotate ───────────────────────────────────────────────────────────────
    const err = await rotateApiKey({
      adminSupabase,
      tenantId:  tenantUser.tenant_id,
      userId:    user.id,
      keyId,
      keyHash,
      keyLast4,
      ipAddress,
      userAgent,
    });

    if (err === "conflict") return conflict();
    if (err !== null)        return internalError();

    // ── Respond ──────────────────────────────────────────────────────────────
    return NextResponse.json(
      ApiKeyResponseSchema.parse({ apiKey }),
      { status: 200, headers: SECURE_HEADERS }
    );
  } catch (error) {
    console.error("Unexpected failure in POST /api/keys/generate", {
      message: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}