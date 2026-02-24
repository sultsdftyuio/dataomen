'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Type definition for our FastAPI backend response
interface RegisterResponse {
  access_token?: string
  token_type?: string
  detail?: string // FastAPI's default error key
}

export async function registerUser(formData: FormData) {
  const company = formData.get('company')?.toString()
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()

  // Basic validation before hitting our backend
  if (!company || !email || !password) {
    throw new Error('Company name, email, and password are required.')
  }

  try {
    // PHASE 1 INTEGRATION: Route to our Python backend to provision the Tenant and User
    const apiUrl = process.env.INTERNAL_API_URL || 'http://127.0.0.1:8000'
    
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company, email, password }),
    })

    const data: RegisterResponse = await response.json()

    if (!response.ok || !data.access_token) {
      console.error('FastAPI Registration Error:', data.detail)
      throw new Error(data.detail || 'Failed to create account.')
    }

    // SECURITY FIRST: Issue the session cookie immediately upon successful registration
    const cookieStore = await cookies()
    cookieStore.set('dataomen_session', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })

  } catch (error) {
    console.error('Registration action failed:', error)
    // Throw to let the UI display the error boundary
    throw error 
  }

  // Redirect the newly minted user directly to their isolated dashboard
  redirect('/dashboard')
}