'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Type definition for our FastAPI backend response
interface LoginResponse {
  access_token?: string
  token_type?: string
  detail?: string // FastAPI's default error key
}

export async function loginUser(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()

  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  try {
    // PHASE 1 INTEGRATION: Route to our Python backend
    // In production, this should be an internal network URL (e.g., inside Docker/VPC)
    const apiUrl = process.env.INTERNAL_API_URL || 'http://127.0.0.1:8000'
    
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    const data: LoginResponse = await response.json()

    if (!response.ok || !data.access_token) {
      console.error('FastAPI Auth Error:', data.detail)
      throw new Error(data.detail || 'Invalid email or password.')
    }

    // SECURITY FIRST: Set the JWT as an HttpOnly, Secure cookie.
    // This prevents XSS attacks from stealing the token on the client side.
    const cookieStore = await cookies()
    cookieStore.set('dataomen_session', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week duration
    })

  } catch (error) {
    console.error('Login action failed:', error)
    // We throw the error so the UI can catch it (or an Error Boundary)
    throw error 
  }

  // Next.js requires redirect() to be called outside of the try/catch block
  redirect('/dashboard')
}