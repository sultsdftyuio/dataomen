'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export type ActionState = {
  error?: string;
  success?: boolean;
};

/**
 * loginAction
 * ---------------------------------------------------------------------------
 * Secure authentication handler for the Arcli platform.
 *
 * Security Properties:
 * - Server-only execution
 * - Input sanitization
 * - Open redirect protection
 * - Safe auth error normalization
 * - PII-safe observability
 * - Redirect-safe architecture
 * - Defensive FormData parsing
 * ---------------------------------------------------------------------------
 */
export async function loginAction(
  state: ActionState,
  formData: FormData
): Promise<ActionState> {
  // -------------------------------------------------------------------------
  // OBSERVABILITY
  // -------------------------------------------------------------------------
  const flowId = `login-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const flowStart = Date.now();

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.log(`[AUTH][${flowId}] === Starting Login Flow ===`);
  }

  // -------------------------------------------------------------------------
  // SAFE FORM EXTRACTION
  // -------------------------------------------------------------------------
  const emailField = formData.get('email');
  const passwordField = formData.get('password');
  const nextField = formData.get('next');

  const rawEmail =
    typeof emailField === 'string'
      ? emailField
      : '';

  const password =
    typeof passwordField === 'string'
      ? passwordField
      : '';

  const requestedNextPath =
    typeof nextField === 'string'
      ? nextField
      : '';

  // -------------------------------------------------------------------------
  // INPUT SANITIZATION
  // -------------------------------------------------------------------------
  const email = rawEmail.trim().toLowerCase();

  // -------------------------------------------------------------------------
  // OPEN REDIRECT PROTECTION
  // -------------------------------------------------------------------------
  const isSafeInternalPath =
    requestedNextPath.startsWith('/') &&
    !requestedNextPath.startsWith('//') &&
    !requestedNextPath.includes('\\') &&
    !requestedNextPath.includes('..');

  const nextPath = isSafeInternalPath
    ? requestedNextPath
    : '/dashboard';

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------
  if (!email || !password) {
    if (isDev) {
      console.warn(
        `[AUTH][${flowId}] Validation failed: Missing credentials`
      );
    }

    return {
      error: 'Email and password are required.',
    };
  }

  // -------------------------------------------------------------------------
  // LIGHT EMAIL VALIDATION
  // -------------------------------------------------------------------------
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    if (isDev) {
      console.warn(
        `[AUTH][${flowId}] Validation failed: Invalid email format`
      );
    }

    return {
      error: 'Please enter a valid email address.',
    };
  }

  // -------------------------------------------------------------------------
  // PII-SAFE OBSERVABILITY
  // -------------------------------------------------------------------------
  const maskedEmail =
    email.length > 5
      ? `${email.slice(0, 2)}***${email.slice(email.indexOf('@'))}`
      : '[redacted]';

  if (isDev) {
    console.log(`[AUTH][${flowId}] Parsed login request`, {
      email: maskedEmail,
      nextPath,
    });
  }

  try {
    // -----------------------------------------------------------------------
    // INITIALIZE SUPABASE SSR CLIENT
    // -----------------------------------------------------------------------
    const supabase = await createClient();

    if (isDev) {
      console.log(
        `[AUTH][${flowId}] Attempting Supabase authentication`
      );
    }

    // -----------------------------------------------------------------------
    // AUTHENTICATE USER
    // -----------------------------------------------------------------------
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    // -----------------------------------------------------------------------
    // AUTH FAILURE
    // -----------------------------------------------------------------------
    if (error) {
      console.warn(
        `[AUTH][${flowId}] Authentication rejected`,
        {
          code: error.code,
          status: error.status,
        }
      );

      /**
       * SECURITY:
       * Never expose raw provider auth errors to clients.
       * Prevents auth-state leakage and inconsistent UX.
       */
      return {
        error: 'Invalid email or password.',
      };
    }

    // -----------------------------------------------------------------------
    // AUTH SUCCESS
    // -----------------------------------------------------------------------
    if (isDev) {
      console.log(
        `[AUTH][${flowId}] Authentication successful`,
        {
          userId: data.user.id,
          durationMs: Date.now() - flowStart,
        }
      );
    }
  } catch (err) {
    // -----------------------------------------------------------------------
    // INTERNAL FAILURE
    // -----------------------------------------------------------------------
    console.error(
      `[AUTH][${flowId}] Critical authentication exception`,
      err
    );

    return {
      error:
        'A secure connection could not be established. Please try again later.',
    };
  }

  // -------------------------------------------------------------------------
  // SECURE REDIRECT
  // -------------------------------------------------------------------------
  /**
   * IMPORTANT:
   * redirect() intentionally throws a NEXT_REDIRECT signal.
   * It MUST remain outside try/catch.
   */
  redirect(nextPath);
}