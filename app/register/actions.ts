'use server'

import { headers } from 'next/headers'

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i
const ROOT_RELATIVE_URL_REGEX = /^\//
const LOCAL_BACKEND_FALLBACKS = ['http://localhost:8000', 'http://localhost:8080']

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

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

export type ActionState = {
  error?: string;
  success?: boolean;
}

export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const flowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const flowStart = Date.now()

  console.log(`[DEBUG-UI][${flowId}] === Starting Registration Flow ===`)
  
  const rawEmail = formData.get('email')?.toString() || ''
  const email = rawEmail.trim().toLowerCase()
  const password = formData.get('password')?.toString() || ''

  console.log(`[DEBUG-UI][${flowId}] Parsed form: Email: "${email}", Password Length: ${password.length}`)

  if (!email || !password) {
    console.log(`[DEBUG-UI][${flowId}] Failed validation: Missing email or password.`)
    return { error: 'Email and password are required.' }
  }
  
  const fallbackName = email.split('@')[0] || 'User'
  const fallbackCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'
  const registerPayload = {
    email,
    password,
    full_name: fallbackName,
    company_name: fallbackCompany,
  }

  const registerEndpointCandidates = await resolveRegisterEndpointCandidates()
  console.log(`[DEBUG-UI][${flowId}] Endpoint candidates:`, registerEndpointCandidates)
  console.log(`[DEBUG-UI][${flowId}] Register payload (password redacted):`, {
    ...registerPayload,
    password: '[REDACTED]',
    password_length: password.length,
  })

  try {
    if (registerEndpointCandidates.length === 0) {
      console.error(`[DEBUG-UI][${flowId}] CRITICAL: No registration endpoints resolved.`)
      return { error: 'Registration service is not configured.' }
    }

    let res: Response | null = null
    let lastNetworkError: unknown = null
    let successfulEndpoint: string | null = null

    console.log(`[DEBUG-UI][${flowId}] Attempting backend registration...`)
    for (const endpoint of registerEndpointCandidates) {
      console.log(`[DEBUG-UI][${flowId}] Trying endpoint: ${endpoint}`)
      try {
        const attemptStart = Date.now()
        const attempt = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerPayload),
          cache: 'no-store',
        })

        const durationMs = Date.now() - attemptStart
        console.log(`[DEBUG-UI][${flowId}] Endpoint ${endpoint} responded with status ${attempt.status} in ${durationMs}ms`)
        console.log(`[DEBUG-UI][${flowId}] Response headers:`, {
          contentType: attempt.headers.get('content-type'),
          cacheControl: attempt.headers.get('cache-control'),
        })

        res = attempt
        successfulEndpoint = endpoint
        if (attempt.status !== 404) {
          break
        }
      } catch (error) {
        console.error(`[DEBUG-UI][${flowId}] Network error hitting ${endpoint}:`, error)
        lastNetworkError = error
      }
    }

    if (!res) {
      console.error(`[DEBUG-UI][${flowId}] All network requests failed completely.`)
      throw lastNetworkError || new Error('Registration service request failed.')
    }

    console.log(`[DEBUG-UI][${flowId}] Selected response endpoint:`, successfulEndpoint)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[DEBUG-UI][${flowId}] Backend returned HTTP ${res.status}. Raw body:`, text)

      let errorMessage = 'Registration failed'
      try {
        const data = text ? JSON.parse(text) : {}
        if (Array.isArray(data.detail)) {
          errorMessage = Array.isArray(data.detail)
            ? data.detail.map((e: any) => `${e.loc?.join('.') || 'detail'} - ${e.msg || JSON.stringify(e)}`).join(' | ')
            : String(data.detail)
        } else if (data.detail) {
          errorMessage = String(data.detail)
        } else if (data.message) {
          errorMessage = String(data.message)
        } else if (data.error) {
          errorMessage = String(data.error)
        } else if (!text) {
          errorMessage = `Registration failed with HTTP ${res.status}`
        }
      } catch {
        errorMessage = `Backend Gateway Error (${res.status}). Server might be crashing.`
      }
      return { error: errorMessage }
    }

    const backendSuccessText = await res.text().catch(() => '')
    let backendSuccessData: unknown = {}
    if (backendSuccessText) {
      try {
        backendSuccessData = JSON.parse(backendSuccessText)
      } catch {
        backendSuccessData = { raw: backendSuccessText }
      }
    }

    console.log(`[DEBUG-UI][${flowId}] Backend registration SUCCESS. Data:`, backendSuccessData)
    console.log(`[DEBUG-UI][${flowId}] Total flow duration: ${Date.now() - flowStart}ms`)
    return { success: true }

  } catch (error) {
    console.error(`[DEBUG-UI][${flowId}] UNCAUGHT EXCEPTION in registration flow:`, error)
    return { error: 'Could not complete registration flow. Check logs.' }
  }
}