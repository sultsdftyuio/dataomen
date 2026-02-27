'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export interface ActionState {
  error: string | null
}

export async function loginAction(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    // Modular Strategy: Underlying technology is abstracted via API call
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const result = await response.json()

    if (!response.ok) {
      // Return serializable object for useActionState
      return { error: result.detail || 'Invalid email or password' }
    }

    // Security by Design: HttpOnly cookies for session management
    const cookieStore = await cookies()
    cookieStore.set('auth_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })
  } catch (err) {
    console.error('Login error:', err)
    return { error: 'Connection failed. Please check your network.' }
  }

  // Interaction Layer: Successful login redirects to dashboard
  redirect('/dashboard')
}