'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i
const ROOT_RELATIVE_URL_REGEX = /^\//
const LOCAL_BACKEND_FALLBACK = 'http://localhost:8080'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const isNextRedirectError = (error: unknown): boolean => {
  if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
    return true
  }

  if (!error || typeof error !== 'object') {
    return false
  }

  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

const resolveRequestOrigin = async (): Promise<string | null> => {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host')

  if (!host) {
    return null
  }

  const forwardedProto = headerStore.get('x-forwarded-proto')
  const isLocalHost = host.includes('localhost') || host.startsWith('127.0.0.1')
  const protocol = forwardedProto || (isLocalHost ? 'http' : 'https')

  return `${protocol}://${host}`
}

const resolveRegisterEndpoint = (rawBase: string, requestOrigin: string | null): string | null => {
  const trimmedBase = trimTrailingSlash(rawBase.trim())
  if (!trimmedBase) return null

  let base = trimmedBase
  if (ROOT_RELATIVE_URL_REGEX.test(base)) {
    if (!requestOrigin) {
      return null
    }

    base = `${trimTrailingSlash(requestOrigin)}${base}`
  } else if (!ABSOLUTE_HTTP_URL_REGEX.test(base)) {
    return null
  }

  const lowerBase = base.toLowerCase()

  if (lowerBase.endsWith('/api/v1/auth/register') || lowerBase.endsWith('/v1/auth/register')) {
    return base
  }

  if (lowerBase.endsWith('/api/v1/auth') || lowerBase.endsWith('/v1/auth')) {
    return `${base}/register`
  }

  if (lowerBase.endsWith('/api/v1') || lowerBase.endsWith('/v1')) {
    return `${base}/auth/register`
  }

  if (lowerBase.endsWith('/api')) {
    return `${base}/v1/auth/register`
  }

  return `${base}/api/v1/auth/register`
}

const resolveRegisterEndpointCandidates = async (): Promise<string[]> => {
  const requestOrigin = await resolveRequestOrigin()
  const baseCandidates = [
    process.env.BACKEND_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    LOCAL_BACKEND_FALLBACK,
    '/api/v1',
    '/api',
  ]

  const endpoints = new Set<string>()

  for (const baseValue of baseCandidates) {
    const rawBase = (baseValue || '').trim()
    if (!rawBase) continue

    const endpoint = resolveRegisterEndpoint(rawBase, requestOrigin)
    if (!endpoint) continue

    endpoints.add(endpoint)
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
  const registerEndpointCandidates = await resolveRegisterEndpointCandidates()

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
    if (isNextRedirectError(error)) throw error
    console.error('Registration/Auto-login error:', error)
    return { error: 'Could not complete registration flow.' }
  }

  // 4. Redirect to dashboard upon successful registration and login
  redirect('/chat')
}