import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import crypto from "crypto";
import { z } from "zod";

// ============================================================================
// RESPONSE / ERROR HELPERS
// ============================================================================

const unauthorized = () =>
  NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 }
  );

const notFound = (message: string) =>
  NextResponse.json(
    { error: message },
    { status: 404 }
  );

const internalError = (message: string) =>
  NextResponse.json(
    { error: message },
    { status: 500 }
  );

// ============================================================================
// VALIDATION
// ============================================================================

const ApiKeyResponseSchema = z.object({
  apiKey: z.string().min(1),
});

type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

// ============================================================================
// SECURITY CONSTANTS
// ============================================================================

const API_KEY_PREFIX = "arcli_live_";
const API_KEY_ID_BYTES = 8;
const API_KEY_SECRET_BYTES = 32;

const API_KEY_PEPPER = process.env.API_KEY_PEPPER;

const buildApiKey = () => {
  const keyId = crypto.randomBytes(API_KEY_ID_BYTES).toString("hex");
  const secret = crypto.randomBytes(API_KEY_SECRET_BYTES).toString("hex");
  return {
    keyId,
    secret,
    apiKey: `${API_KEY_PREFIX}${keyId}_${secret}`,
  };
};

const hashApiKeySecret = (secret: string) => {
  if (!API_KEY_PEPPER) {
    throw new Error("API_KEY_PEPPER is not configured");
  }
  return crypto
    .createHmac("sha256", API_KEY_PEPPER)
    .update(secret)
    .digest("hex");
};

// ============================================================================
// ROUTE
// ============================================================================

export async function POST(): Promise<NextResponse<ApiKeyResponse | { error: string }>> {
  try {
    // =========================================================================
    // CREATE AUTHENTICATED SUPABASE CLIENT
    // =========================================================================

    const supabase = await createClient();

    // =========================================================================
    // AUTHENTICATE USER
    // =========================================================================

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Authentication failed:", authError);

      return unauthorized();
    }

    // =========================================================================
    // RESOLVE TENANT
    // =========================================================================

    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (tenantError || !tenantUser) {
      console.error("Tenant lookup failed:", {
        userId: user.id,
        error: tenantError,
      });

      return notFound("Could not locate tenant for user.");
    }

    if (!API_KEY_PEPPER) {
      console.error("API key pepper is missing from environment.");
      return internalError("API key configuration is incomplete.");
    }

    // =========================================================================
    // GENERATE CRYPTOGRAPHICALLY SECURE API KEY
    // =========================================================================

    const keyLastUpdated = new Date().toISOString();
    const { apiKey, keyId, secret } = buildApiKey();
    const keyHash = hashApiKeySecret(secret);
    const keyLast4 = secret.slice(-4);

    // =========================================================================
    // UPSERT TENANT SETTINGS
    // =========================================================================

    const { error: revokeError } = await supabase
      .from("api_keys")
      .update({ revoked_at: keyLastUpdated })
      .eq("tenant_id", tenantUser.tenant_id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("API key revocation failed:", {
        tenantId: tenantUser.tenant_id,
        error: revokeError,
      });

      return internalError(
        `Database error: ${revokeError.message}`
      );
    }

    const { error: insertError } = await supabase
      .from("api_keys")
      .insert({
        tenant_id: tenantUser.tenant_id,
        key_id: keyId,
        key_hash: keyHash,
        key_last4: keyLast4,
        created_by: user.id,
      });

    if (insertError) {
      console.error("API key insert failed:", {
        tenantId: tenantUser.tenant_id,
        error: insertError,
      });

      return internalError(
        `Database error: ${insertError.message}`
      );
    }

    const { error: upsertError } = await supabase
      .from("tenant_settings")
      .upsert(
        {
          tenant_id: tenantUser.tenant_id,
          api_key: null,
          key_last_updated: keyLastUpdated,
        },
        {
          onConflict: "tenant_id",
        }
      );

    if (upsertError) {
      console.error("API key upsert failed:", {
        tenantId: tenantUser.tenant_id,
        error: upsertError,
      });

      return internalError(
        `Database error: ${upsertError.message}`
      );
    }

    // =========================================================================
    // VALIDATE RESPONSE CONTRACT
    // =========================================================================

    const responsePayload: ApiKeyResponse =
      ApiKeyResponseSchema.parse({
        apiKey,
      });

    // =========================================================================
    // SUCCESS RESPONSE
    // =========================================================================

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Unexpected API key generation failure:", error);

    return internalError(
      "An unexpected error occurred while generating the API key."
    );
  }
}