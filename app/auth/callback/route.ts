import { NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

// ---------------------------------------------------------------------------
// CONSTANTS & ALLOWLISTS
// ---------------------------------------------------------------------------
const VALID_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
const isSafeRedirectPath = (value: string | null): value is string => {
  return Boolean(
    value &&
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !value.includes('..')
  );
};

/**
 * GET Auth Callback
 * ---------------------------------------------------------------------------
 * Secure callback handler for Supabase OAuth and OTP flows.
 *
 * Security Properties:
 * - Strict OTP type allowlisting
 * - Hardened redirect sanitization & traversal prevention
 * - Invalid callback rejection
 * - PII-safe structured observability
 * - Global try/catch protection
 * ---------------------------------------------------------------------------
 */
export async function GET(request: Request) {
  // -------------------------------------------------------------------------
  // OBSERVABILITY INITIALIZATION
  // -------------------------------------------------------------------------
  const flowId = `auth-cb-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.log(`[AUTH_CALLBACK][${flowId}] === Starting Callback Flow ===`);
  }

  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  try {
    // -----------------------------------------------------------------------
    // SAFE PARAMETER EXTRACTION
    // -----------------------------------------------------------------------
    const searchParams = requestUrl.searchParams;
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const rawType = searchParams.get('type');
    const requestedNext = searchParams.get('next');

    // -----------------------------------------------------------------------
    // INPUT SANITIZATION & VALIDATION
    // -----------------------------------------------------------------------
    // 1. Validate OTP Type (Allowlist)
    const otpType: EmailOtpType | null =
      rawType && VALID_OTP_TYPES.has(rawType as EmailOtpType)
        ? (rawType as EmailOtpType)
        : null;

    // 2. Validate Redirect Path (Traversal & Open Redirect Protection)
    let nextPath = isSafeRedirectPath(requestedNext)
      ? requestedNext
      : '/dashboard';

    // -----------------------------------------------------------------------
    // INVALID FLOW REJECTION
    // -----------------------------------------------------------------------
    if (!code && !(tokenHash && otpType)) {
      console.warn(`[AUTH_CALLBACK][${flowId}] Invalid callback attempt`, {
        hasCode: !!code,
        hasTokenHash: !!tokenHash,
        rawTypeProvided: rawType,
      });

      return NextResponse.redirect(
        new URL('/login?error=invalid_auth_callback', origin)
      );
    }

    // -----------------------------------------------------------------------
    // INITIALIZE SUPABASE SSR CLIENT
    // -----------------------------------------------------------------------
    const supabase = await createClient();

    // -----------------------------------------------------------------------
    // AUTHENTICATE: OAUTH FLOW
    // -----------------------------------------------------------------------
    if (code) {
      if (isDev) {
        console.log(`[AUTH_CALLBACK][${flowId}] Exchanging OAuth code`);
      }
      
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error(`[AUTH_CALLBACK][${flowId}] Failed OAuth exchange`, {
          code: error.code,
          status: error.status,
        });
        
        return NextResponse.redirect(
          new URL('/login?error=oauth_failed', origin)
        );
      }
    } 
    // -----------------------------------------------------------------------
    // AUTHENTICATE: MAGIC LINK / OTP FLOW
    // -----------------------------------------------------------------------
    else if (tokenHash && otpType) {
      if (isDev) {
        console.log(`[AUTH_CALLBACK][${flowId}] Verifying OTP`, { type: otpType });
      }

      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });

      if (error) {
        console.warn(`[AUTH_CALLBACK][${flowId}] OTP verification failed`, {
          type: otpType,
          code: error.code,
          status: error.status,
        });

        return NextResponse.redirect(
          new URL('/login?error=otp_failed', origin)
        );
      }
    }

    // -----------------------------------------------------------------------
    // SUCCESS & REDIRECT
    // -----------------------------------------------------------------------
    if (isDev) {
      console.log(`[AUTH_CALLBACK][${flowId}] Authentication successful, redirecting`, {
        nextPath,
      });
    }

    return NextResponse.redirect(new URL(nextPath, origin));

  } catch (error) {
    // -----------------------------------------------------------------------
    // GLOBAL EXCEPTION HANDLING
    // -----------------------------------------------------------------------
    console.error(`[AUTH_CALLBACK][${flowId}] Critical authentication exception`, error);

    return NextResponse.redirect(
      new URL('/login?error=auth_processing_failed', origin)
    );
  }
}