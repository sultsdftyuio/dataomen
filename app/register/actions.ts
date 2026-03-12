'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export type ActionState = {
  error?: string;
  success?: boolean;
}

/**
 * registerAction handles the multi-tenant registration flow.
 * It first registers the user/tenant via the Python backend, 
 * then automatically signs them in using Supabase to establish a session.
 */
export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const cookieStore = await cookies()
  
  // Strictly parse form values to string, defaulting to empty string if null
  const email = formData.get('email')?.toString() || ''
  const password = formData.get('password')?.toString() || ''
  const fullName = formData.get('name')?.toString() || ''
  const companyName = formData.get('company')?.toString() || ''

  try {
    // 1. Register the tenant and user in the Core API
    const res = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        company_name: companyName,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data?.detail || 'Registration failed' }
    }

    // 2. Initialize Supabase client to perform auto-login
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch { /* Handle server component cookie limits */ }
          },
        },
      }
    )

    // 3. Sign in immediately to create the session cookies
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      // If auto-login fails, we redirect to login so they can try manually
      redirect('/login')
    }

  } catch (error) {
    if ((error as Error).message === 'NEXT_REDIRECT') throw error
    console.error('Registration/Auto-login error:', error)
    return { error: 'Could not complete registration flow.' }
  }

  // 4. Redirect to dashboard upon successful registration and login
  redirect('/dashboard')
}