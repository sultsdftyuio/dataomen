'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// Environment & Configuration
const isDev = process.env.NODE_ENV !== 'production'
const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i
const ROOT_RELATIVE_URL_REGEX = /^\//

// SECURITY: Only expose internal localhost routes in development
const LOCAL_BACKEND_FALLBACKS = isDev ? ['http://localhost:8000', 'http://localhost:8080'] : []

export type ActionState = {
  error?: string;
  success?: boolean;
}

type BackendValidationError = {
  loc?: string[];
  msg?: string;
}

// --- Utilities ---

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

// SECURITY: Prevent PII leakage in server logs
const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return '[redacted]'
  const [local, domain] = email.split('@')
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`
}

const resolveRequestOrigin = async (): Promise<string | null> => {
  // SECURITY: Prefer a trusted environment variable over headers to prevent spoofing
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)
  }

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
    if (!requestOrigin) return null
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
    ...LOCAL_BACKEND_FALLBACKS,
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

// --- Main Action ---

export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const flowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let shouldRedirect = false
  
  try {
    // SECURITY: Safe FormData coercion (prevents File object injection)
    const emailField = formData.get('email')
    const passwordField = formData.get('password')
    
    const email = typeof emailField === 'string' ? emailField.trim().toLowerCase() : ''
    const password = typeof passwordField === 'string' ? passwordField : ''

    if (!email || !password) {
      return { error: 'Email and password are required.' }
    }

    const maskedEmail = maskEmail(email)
    if (isDev) console.log(`[DEBUG-UI][${flowId}] Starting Registration for: ${maskedEmail}`)

    // DATA INTEGRITY: Stronger company name derivation & sanitization
    const fallbackName = email.split('@')[0] || 'User'
    const rawCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'
    const fallbackCompany = rawCompany.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace'

    const registerPayload = {
      email,
      password,
      full_name: fallbackName,
      company_name: fallbackCompany,
    }

    const registerEndpointCandidates = await resolveRegisterEndpointCandidates()

    if (registerEndpointCandidates.length === 0) {
      console.error(`[ERROR][${flowId}] CRITICAL: No registration endpoints resolved.`)
      return { error: 'Registration service is temporarily unavailable.' }
    }

    let res: Response | null = null
    let lastNetworkError: unknown = null

    // RESILIENCE: Implement an AbortController for fetch timeouts (8 seconds)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    for (const endpoint of registerEndpointCandidates) {
      if (isDev) console.log(`[DEBUG-UI][${flowId}] Trying endpoint: ${endpoint}`)
      try {
        const attempt = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerPayload),
          cache: 'no-store',
          signal: controller.signal,
        })

        res = attempt
        if (attempt.status !== 404) {
          break
        }
      } catch (error) {
        lastNetworkError = error
        if (isDev) console.error(`[DEBUG-UI][${flowId}] Network error hitting ${endpoint}:`, error)
      }
    }

    clearTimeout(timeoutId)

    if (!res) {
      console.error(`[ERROR][${flowId}] All network requests failed.`, lastNetworkError)
      return { error: 'Unable to connect to the server. Please check your connection and try again.' }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      
      // DIAGNOSTICS: Keep full errors internal
      console.error(`[ERROR][${flowId}] Backend returned HTTP ${res.status}. Raw body:`, text)

      // SECURITY/UX: Return normalized, client-safe error messages
      let clientErrorMessage = 'Registration failed. Please verify your information and try again.'
      
      try {
        const data = text ? JSON.parse(text) : {}
        
        // Safely extract validation details if they exist, without exposing internal stack traces
        if (res.status === 400 && data.detail) {
          if (Array.isArray(data.detail)) {
            const mappedErrors = data.detail
              .map((e: BackendValidationError) => e.msg)
              .filter(Boolean)
              .join(' | ')
            if (mappedErrors) clientErrorMessage = mappedErrors
          } else if (typeof data.detail === 'string') {
            clientErrorMessage = data.detail
          }
        }
      } catch {
        // Fallback to the generic error message
      }
      
      return { error: clientErrorMessage }
    }

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Registration SUCCESS for ${maskedEmail}`)
    
    // CRITICAL FIX: Do not trigger redirect() inside the try/catch block
    shouldRedirect = true

  } catch (error) {
    console.error(`[ERROR][${flowId}] UNCAUGHT EXCEPTION in registration flow:`, error)
    return { error: 'An unexpected error occurred. Please try again later.' }
  }

  // --- External Redirect ---
  // Next.js redirect throws a specific error that MUST NOT be caught by your standard try/catch
  if (shouldRedirect) {
    redirect('/dashboard')
  }

  return { success: true }
}