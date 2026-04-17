'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const resolveRegisterEndpointCandidates = (): string[] => {
  const baseCandidates = [
    process.env.BACKEND_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    'http://localhost:8000',
  ]

  const endpoints = new Set<string>()

  for (const baseValue of baseCandidates) {
    const rawBase = (baseValue || '').trim()
    if (!rawBase) continue

    const base = trimTrailingSlash(rawBase)
    if (!ABSOLUTE_HTTP_URL_REGEX.test(base)) continue

    if (/\/api\/v1$/i.test(base)) {
      endpoints.add(`${base}/auth/register`)
      continue
    }

    if (/\/api$/i.test(base)) {
      endpoints.add(`${base}/v1/auth/register`)
      continue
    }

    endpoints.add(`${base}/api/v1/auth/register`)
  }

  return Array.from(endpoints)
}

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
  const rawEmail = formData.get('email')?.toString() || ''
  const email = rawEmail.trim().toLowerCase()
  const password = formData.get('password')?.toString() || ''

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }
  
  // Generate smart defaults for backend fields omitted in the UI to reduce friction
  const fallbackName = email.split('@')[0] || 'User'
  const fallbackCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'
  const registerEndpointCandidates = resolveRegisterEndpointCandidates()

  try {
    // 1. Register the tenant and user in the Core API
    if (registerEndpointCandidates.length === 0) {
      return { error: 'Registration service is not configured.' }
    }

    let res: Response | null = null
    let lastNetworkError: unknown = null

    for (const endpoint of registerEndpointCandidates) {
      try {
        const attempt = await fetch(endpoint, {
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

        res = attempt
        if (attempt.status !== 404) break
      } catch (error) {
        lastNetworkError = error
      }
    }

    if (!res) {
      throw lastNetworkError || new Error('Registration service request failed.')
    }

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
    // Clear any stale browser session so the new user is guaranteed to become the active account.
    await supabase.auth.signOut()

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !signInData.user) {
      // If auto-login fails (e.g., email confirmation required), redirect to login
      redirect('/login?error=signup_created_login_required')
    }

    const authenticatedEmail = (signInData.user.email || '').toLowerCase()
    if (authenticatedEmail !== email) {
      await supabase.auth.signOut()
      return { error: 'A different account session was detected. Please log in again.' }
    }

  } catch (error) {
    if ((error as Error).message === 'NEXT_REDIRECT') throw error
    console.error('Registration/Auto-login error:', error)
    return { error: 'Could not complete registration flow.' }
  }

  // 4. Redirect to dashboard upon successful registration and login
  redirect('/chat')
}