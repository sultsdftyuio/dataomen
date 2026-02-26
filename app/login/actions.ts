'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

interface LoginResponse {
  access_token?: string
  token_type?: string
  detail?: string 
}

export async function loginUser(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  // 1. ADD THIS LINE: Get URL from environment or default to localhost
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    // 2. USE THE DYNAMIC URL HERE
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email as string,
        password: password as string,
      }),
    })

    const data: LoginResponse = await response.json()

    if (!response.ok) {
      return { error: data.detail || 'Login failed' }
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
    console.error("Login Error:", error)
    return { error: 'Failed to connect to the server.' }
  }

  redirect('/dashboard')
}