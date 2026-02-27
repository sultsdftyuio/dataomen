'use server'

import { cookies } from 'next/headers'

// Safely handle API URLs by ensuring no trailing slash
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export type ActionState = {
  error?: string;
  success?: boolean;
}

export async function loginAction(state: ActionState, formData: FormData): Promise<ActionState> {
  // Strictly parse form values to string, defaulting to empty string if null
  const email = formData.get('email')?.toString() || ''
  const password = formData.get('password')?.toString() || ''

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email,
        password: password,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data?.detail || 'Login failed - verify your credentials.' }
    }

    const data = await res.json()
    
    if (data.access_token) {
        // Next.js 15+: cookies() is async and must be awaited before accessing .set()
        const cookieStore = await cookies()
        cookieStore.set('token', data.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 1 week
          path: '/'
        })
        return { success: true }
    } else {
        return { error: 'Authentication failed: Invalid response from server.' }
    }
  } catch (error) {
    console.error('Login Error:', error)
    return { error: 'Could not connect to the authentication server.' }
  }
}