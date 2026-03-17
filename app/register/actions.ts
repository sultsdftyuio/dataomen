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
 * Adapted for the optimized conversion funnel: derives missing 
 * identity details from the email address to reduce user friction.
 */
export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const cookieStore = await cookies()
  
  // Strictly parse essential form values
  const email = formData.get('email')?.toString() || ''
  const password = formData.get('password')?.toString() || ''
  
  // Generate smart defaults for backend fields omitted in the UI to reduce friction
  const fallbackName = email.split('@')[0] || 'User'
  const fallbackCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'

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
        full_name: fallbackName,
        company_name: fallbackCompany,
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
            } catch { 
              // Handle server component cookie limits in Next.js
            }
          },
        },
      }
    )

    // 3. Sign in immediately to create the session cookies
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      // If auto-login fails (e.g., email confirmation required), redirect to login
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