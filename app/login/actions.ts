// app/login/actions.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Interface defining the expected shape of the login API response.
 * Ensures Type Safety.
 */
interface LoginResponse {
  access_token: string
  token_type: string
}

/**
 * Executes a server-side login request to the FastAPI backend.
 * Uses an environment variable for the API base URL to support Docker/production.
 */
export async function loginAction(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  // Modular Strategy: Abstract the API URL to handle Docker vs Local networking natively.
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  try {
    const response = await fetch(`${API_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // OAuth2 in FastAPI strictly requires form-urlencoded data for the token endpoint
      body: new URLSearchParams({
        username: email.toString(),
        password: password.toString(),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { error: errorData.detail || 'Invalid credentials' }
    }

    const data: LoginResponse = await response.json()

    // Security by Design: Store the token in an HTTP-only cookie for secure multi-tenant sessions.
    cookies().set('token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })

  } catch (error) {
    console.error('Login Action Error:', error)
    return { 
      error: 'Unable to connect to the authentication server. Please verify the backend is running.' 
    }
  }

  // Redirect must happen outside the try-catch block in Next.js Server Actions
  redirect('/dashboard')
}