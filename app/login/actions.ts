// sultsdftyuio/dataomen/dataomen-43ad9aa30edf914b3c6600f2be566cca09e9f799/app/login/actions.ts

'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Interface defining the expected shape of the FastAPI token response.
 * Adheres to strict TypeScript definitions for Interaction Guidelines.
 */
interface LoginResponse {
  access_token?: string
  token_type?: string
  detail?: string
}

/**
 * Modular Strategy: Resilient fallback for the API URL.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

/**
 * Server Action to handle user login.
 * Orchestration (Backend): Securely awaits cookie resolution before assignment.
 */
export async function login(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email as string,
        password: password as string,
      }),
      cache: 'no-store',
    })

    const data: LoginResponse = await response.json()

    if (!response.ok) {
      return { error: data.detail || 'Authentication failed.' }
    }

    if (data.access_token) {
      /**
       * FIX: In Next.js 15+, cookies() must be awaited.
       * Security by Design: HttpOnly and Secure flags enabled for tenant protection.
       */
      const cookieStore = await cookies()
      
      cookieStore.set('auth_token', data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      })
    } else {
      return { error: 'Server did not return an access token.' }
    }
  } catch (error) {
    console.error('Login Action Error:', error)
    return { 
      error: 'Network error: Backend server at ' + API_BASE_URL + ' is unreachable.' 
    }
  }

  /**
   * Success path: Redirect to the internal dashboard.
   */
  redirect('/dashboard')
}