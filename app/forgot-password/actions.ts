'use server'

import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string;
  success?: boolean;
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
    // 2. Resolve Core API URL following the platform's orchestration pattern
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
    
    // 3. Trigger recovery flow via the backend orchestration layer
    // Adheres to "The Modular Strategy" by using the centralized FastAPI auth router
    const res = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })

    /**
     * 4. Security by Design: Mitigation of User Enumeration
     * Even if the email is not found in our database, we do not disclose that 
     * to the client. We only return a structural error if the service itself fails.
     */
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Core API Forgot Password Failure:', data)
      
      // Only return a generic error if it's a structural 5xx failure
      if (res.status >= 500) {
        return { error: 'The authentication service is currently unavailable. Please try again later.' }
      }
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