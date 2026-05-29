'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type ActionState = {
  error?: string;
  success?: boolean;
}

// 1. Gate verbose logs behind development environment
const isDev = process.env.NODE_ENV !== 'production';
const DEAD_ONBOARDING_PATH = '/onboarding/workspace';

const isDeadOnboardingPath = (value: string): boolean => {
  return (
    value === DEAD_ONBOARDING_PATH ||
    value.startsWith(`${DEAD_ONBOARDING_PATH}/`) ||
    value.startsWith(`${DEAD_ONBOARDING_PATH}?`) ||
    value.startsWith(`${DEAD_ONBOARDING_PATH}#`)
  );
};

/**
 * loginAction: Secure authentication handler for the Arcli platform.
 * Adheres to "The Modular Strategy" by utilizing the shared server-side client 
 * for centralized session and cookie management.
 */
export async function loginAction(state: ActionState, formData: FormData): Promise<ActionState> {
  // OBSERVABILITY: Trace ID for tracking failed login attempts through server logs
  const flowId = `login-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const flowStart = Date.now();

  if (isDev) console.log(`[DEBUG-UI][${flowId}] === Starting Login Flow ===`);

  // 2. Safe FormData Coercion (Runtime Type Narrowing)
  const emailField = formData.get('email');
  const rawEmail = typeof emailField === 'string' ? emailField : '';
  
  const passwordField = formData.get('password');
  const password = typeof passwordField === 'string' ? passwordField : '';
  
  const nextField = formData.get('next');
  const requestedNextPath = typeof nextField === 'string' ? nextField : '';

  // 3. Normalization & Correctness
  const email = rawEmail.trim().toLowerCase(); 
  
  // 4. PII Logging Prevention
  const maskedEmail = email.length > 5 
    ? `${email.slice(0, 2)}***${email.slice(email.indexOf('@'))}` 
    : '[redacted]';

  // 5. Hardened Redirect Validation
  const candidateNextPath = 
    requestedNextPath.startsWith('/') && 
    !requestedNextPath.startsWith('//') &&
    !requestedNextPath.includes('\\') &&
    !requestedNextPath.includes('..')
      ? requestedNextPath 
      : '/dashboard';

  const nextPath = isDeadOnboardingPath(candidateNextPath)
    ? '/dashboard'
    : candidateNextPath;

  if (isDev) console.log(`[DEBUG-UI][${flowId}] Parsed credentials. Email: "${maskedEmail}", NextPath: "${nextPath}"`);

  // 6. Pre-flight Validation (Missing fields + Lightweight Regex)
  if (!email || !password) {
    if (isDev) console.log(`[DEBUG-UI][${flowId}] Failed validation: Missing credentials.`);
    return { error: 'Email and password are required to access your workspace.' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    if (isDev) console.log(`[DEBUG-UI][${flowId}] Failed validation: Malformed email.`);
    return { error: 'Please enter a valid email address.' };
  }

  try {
    if (isDev) console.log(`[DEBUG-UI][${flowId}] Attempting Supabase authentication...`);
    
    // 7. Initialize Client INSIDE Try/Catch
    // Protects against cookie parsing, header context, and init failures
    const supabase = await createClient();

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) {
      // 8. Prevent Provider Leakage & Enumeration
      // Log the real issue for observability, but return a generic, static message to the client
      console.warn(`[DEBUG-UI][${flowId}] Auth rejected: ${error.message}`);
      return { error: 'Invalid email or password.' };
    }

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Auth SUCCESS for user_id=${data?.user?.id} in ${Date.now() - flowStart}ms`);

  } catch (err) {
    // Security by Design: Catch all critical initialization and connection failures
    console.error(`[DEBUG-UI][${flowId}] CRITICAL Auth Failure:`, err);
    return { error: 'A secure connection could not be established. Please try again later.' };
  }

  /**
   * 9. Secure Redirect
   * Next.js redirect() throws a special error to halt execution and trigger the navigation.
   * Kept safely outside the try/catch block to ensure navigation is not suppressed.
   */
  redirect(nextPath);
}