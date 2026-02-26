'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

interface RegisterResponse {
  access_token?: string
  token_type?: string
  detail?: string
}

export async function registerUser(formData: FormData) {
  const company = formData.get('company')
  const email = formData.get('email')
  const password = formData.get('password')

  // 1. ADD THIS LINE
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    // 2. USE THE DYNAMIC URL HERE
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company_name: company,
        email: email,
        password: password,
      }),
    })

    const data: RegisterResponse = await response.json()

    if (!response.ok) {
      return { error: data.detail || 'Registration failed' }
    }

    if (data.access_token) {
      // ADD AWAIT HERE
      const cookieStore = await cookies()
      cookieStore.set('token', data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, 
        path: '/',
      })
    }
    

  } catch (error) {
    console.error("Registration Error:", error)
    return { error: 'Failed to connect to the server.' }
  }

  redirect('/dashboard')
}