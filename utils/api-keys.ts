/**
 * API key format validation utility.
 *
 * All verification endpoints MUST call parseApiKey() before touching the
 * database. This rejects structurally invalid tokens at the edge so that
 * malformed strings never reach the DB lookup or the hash comparison.
 *
 * Key structure:
 *   arcli_live_{keyId}_{secret}
 *   -- prefix -- 16 hex -- 64 hex --
 *
 * IMPORTANT: verification callers must then use crypto.timingSafeEqual()
 * to compare the recomputed HMAC against the stored hash. Never use `===`.
 */

export const API_KEY_PREFIX = "arcli_live_";

// 8 random bytes -> 16 hex chars
const KEY_ID_HEX_LENGTH = 16;

// 32 random bytes -> 64 hex chars
const SECRET_HEX_LENGTH = 64;

const HEX_RE = /^[0-9a-f]+$/;

export interface ParsedApiKey {
  keyId: string;
  secret: string;
}

export type ParseApiKeyResult =
  | { ok: true; value: ParsedApiKey }
  | { ok: false; reason: string };

export const parseApiKey = (raw: unknown): ParseApiKeyResult => {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, reason: "Key must be a non-empty string." };
  }

  if (!raw.startsWith(API_KEY_PREFIX)) {
    return { ok: false, reason: "Invalid key prefix." };
  }

  const body = raw.slice(API_KEY_PREFIX.length);
  const separatorIndex = body.indexOf("_");

  if (separatorIndex === -1) {
    return { ok: false, reason: "Missing key-id / secret separator." };
  }

  const keyId = body.slice(0, separatorIndex);
  const secret = body.slice(separatorIndex + 1);

  if (keyId.length !== KEY_ID_HEX_LENGTH) {
    return { ok: false, reason: `Key ID must be ${KEY_ID_HEX_LENGTH} hex characters.` };
  }

  if (!HEX_RE.test(keyId)) {
    return { ok: false, reason: "Key ID contains non-hex characters." };
  }

  if (secret.length !== SECRET_HEX_LENGTH) {
    return { ok: false, reason: `Secret must be ${SECRET_HEX_LENGTH} hex characters.` };
  }

  if (!HEX_RE.test(secret)) {
    return { ok: false, reason: "Secret contains non-hex characters." };
  }

  return { ok: true, value: { keyId, secret } };
};
