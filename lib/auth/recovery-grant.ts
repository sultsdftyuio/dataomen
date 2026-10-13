import { createHmac, timingSafeEqual } from "node:crypto";
import { PASSWORD_RESET_PATH } from "@/utils/auth-redirects";
import { getSupabaseCookieOptions } from "@/utils/supabase/cookie-options";

/**
 * Proof that this browser arrived through a password-reset email.
 *
 * A normal signed-in session must not be enough to set a new password without
 * the current one: anyone holding a borrowed or stolen session could then lock
 * the owner out for good. The auth callback issues this grant only after
 * Supabase has verified a recovery link, and the reset form refuses to work
 * without it.
 */
export const RECOVERY_GRANT_COOKIE = "arcli-recovery-grant";

// Long enough to pick a password with a password manager, short enough that a
// forgotten tab does not stay a way to change the password.
export const RECOVERY_GRANT_TTL_SECONDS = 30 * 60;

const signingKey = () => {
  // Reuses a secret that every deployment already has and that never reaches
  // the browser; the label in `sign` keeps these signatures from being valid
  // for anything else.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return key;
};

const sign = (userId: string, expiresAt: number) =>
  createHmac("sha256", signingKey())
    .update(`password-recovery-grant:${userId}:${expiresAt}`)
    .digest("base64url");

export const createRecoveryGrant = (userId: string, now = Date.now()) => {
  const expiresAt = Math.floor(now / 1000) + RECOVERY_GRANT_TTL_SECONDS;
  return `${expiresAt}.${sign(userId, expiresAt)}`;
};

export const isRecoveryGrantValid = (
  grant: string | undefined,
  userId: string,
  now = Date.now()
) => {
  if (!grant) return false;

  const [rawExpiresAt, signature, ...rest] = grant.split(".");
  const expiresAt = Number(rawExpiresAt);
  if (rest.length > 0 || !signature || !Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt * 1000 <= now) return false;

  const expected = Buffer.from(sign(userId, expiresAt));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export const recoveryGrantCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: getSupabaseCookieOptions().secure,
  // Only the reset page and its form submission ever need to read it.
  path: PASSWORD_RESET_PATH,
  maxAge: RECOVERY_GRANT_TTL_SECONDS,
});
