'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type ActionState = {
  error?: string;
  success?: boolean;
}

/**
 * loginAction: Secure authentication handler for the arcli platform.
 * Adheres to "The Modular Strategy" by utilizing the shared server-side client 
 * for centralized session and cookie management.
 */
export async function loginAction(state: ActionState, formData: FormData): Promise<ActionState> {
  // 1. Initialize the modular Supabase SSR client
  const supabase = await createClient();

  // 2. Extract and sanitize credentials
  const email = formData.get('email')?.toString() || '';
  const password = formData.get('password')?.toString() || '';
  const requestedNextPath = formData.get('next')?.toString() || '';
  const nextPath = requestedNextPath.startsWith('/') && !requestedNextPath.startsWith('//')
    ? requestedNextPath
    : '/dashboard';

  if (!email || !password) {
    return { error: 'Email and password are required to access your workspace.' };
  }

  try {
    // 3. Authenticate with Supabase
    // The server client automatically handles setting session cookies in the response headers
    const { error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) {
      // Return the specific Supabase error message (e.g., "Invalid login credentials")
      return { error: error.message };
    }

  } catch (err) {
    // Security by Design: Log internal errors for observability while keeping client feedback generic
    console.error('Critical Auth Failure:', err);
    return { error: 'A secure connection could not be established. Please try again later.' };
  }

  /**
   * 4. Secure Redirect
   * Next.js redirect() throws a special error to halt execution and trigger the navigation.
   * It is placed outside the try/catch block to ensure it is not caught and suppressed.
   */
  redirect(nextPath);
}
