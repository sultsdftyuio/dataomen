// app/login/actions.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export interface ActionState {
  error: string | null
}

/**
 * Updated signature to support useActionState.
 * prevState is required as the first argument by the hook.
 */
export async function loginAction(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Modular Strategy: Business logic orchestration layer
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { error: result.detail || 'Authentication failed' }
    }

    // Security by Design: Store session securely
    const cookieStore = await cookies()
    cookieStore.set('auth_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })
  } catch (err) {
    return { error: 'An unexpected error occurred. Please try again.' }
  }

  // Redirect must happen outside the try/catch or be the last statement
  redirect('/dashboard')
}