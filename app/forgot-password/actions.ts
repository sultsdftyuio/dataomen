'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type ActionState = {
  error?: string;
  success?: boolean;
}

const resolveSiteUrl = () => {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    'http://localhost:3000'

  const normalized = url.endsWith('/') ? url.slice(0, -1) : url
  return normalized.startsWith('http') ? normalized : `https://${normalized}`
}

/**
 * resetPassword: Secure password recovery handler.
 * Adheres to "The Modular Strategy" by offloading auth logic to the Python core API,
 * and "Security by Design" by providing generic feedback to mitigate enumeration attacks.
 * * @param state - The previous ActionState (required for useFormState compatibility)
 * @param formData - The form data containing the user's email
 */
export async function resetPassword(state: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get('email')?.toString() || ''

  // 1. Initial Validation
  if (!email) {
    return { error: 'A valid work email is required to send recovery instructions.' }
  }

  try {
    const supabase = await createClient()
    const recoveryNext = '/settings?recovery=1'

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${resolveSiteUrl()}/auth/callback?next=${encodeURIComponent(recoveryNext)}`,
    })

    /**
     * 4. Security by Design: Mitigation of User Enumeration
     * Even if the email is not found in our database, we do not disclose that 
     * to the client. We only return a structural error if the service itself fails.
     */
    if (error) {
      console.error('Supabase Forgot Password Failure:', error)
      return { error: 'The authentication service is currently unavailable. Please try again later.' }
    }

  } catch (error) {
    // Capture network or connectivity issues
    console.error('Password Reset Network Failure:', error)
    return { error: 'Could not connect to the authentication service. Please check your connection.' }
  }

  /**
   * 5. Final Orchestration: Success Redirect
   * Per Next.js standards, redirect must be placed outside the try-catch block 
   * to allow the internal redirect error to propagate to the Next.js router.
   */
  redirect('/login?reset=sent')
}