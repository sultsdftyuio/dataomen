'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export interface ActionState {
  error: string | null
}

export async function registerAction(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { error: result.detail || 'Registration failed. Please try again.' }
    }

    // Optional: Auto-login after registration if backend returns a token
    if (result.access_token) {
      const cookieStore = await cookies()
      cookieStore.set('auth_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 1 week
      })
    } else {
      // If no token is returned (e.g., requires email verification), send them to login
      redirect('/login?registered=true')
    }
  } catch (err) {
    console.error('Registration error:', err)
    return { error: 'Connection failed. Please check your network.' }
  }

  // Redirect to dashboard immediately after auto-login
  redirect('/dashboard')
}