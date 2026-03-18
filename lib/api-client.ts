/**
 * ARCLI.TECH - Universal API Client
 * Strategy: Hybrid Performance & Multi-Tenant Security
 * Description: Wrapper around native fetch that automatically injects 
 * Supabase Authorization headers and handles Vercel-to-Render routing.
 */

import { createBrowserClient } from '@supabase/ssr'

// We use the rewrite path by default so Next.js handles the Vercel->Render proxy
const API_BASE_URL = '/api/v1'

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export class ApiClient {
  private static supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  /**
   * Core execution method prioritizing functional, stateless operations.
   */
  static async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { requireAuth = true, headers: customHeaders, ...fetchOptions } = options
    
    // 1. Prepare base headers (Security by Design)
    const headers = new Headers(customHeaders)
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    // 2. Inject Supabase Session Token if Auth is required
    if (requireAuth) {
      const { data: { session }, error } = await this.supabase.auth.getSession()
      
      if (error || !session) {
        console.warn('API Client: Missing session for authenticated route.')
        throw new Error('Unauthorized: No active session.')
      }
      
      // Fastapi backend expects standard Bearer token
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    // 3. Construct URL (Clean double slashes)
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    const url = `${API_BASE_URL}${cleanEndpoint}`

    // 4. Execute Network Call
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    })

    // 5. Handle standard HTTP Errors organically
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.error || `HTTP error! status: ${response.status}`)
    }

    // Return parsed JSON automatically
    return response.json() as Promise<T>
  }

  // --- Convenience Methods (Vectorized/Functional style) ---

  static async get<T>(endpoint: string, options?: Omit<FetchOptions, 'method'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' })
  }

  static async post<T>(endpoint: string, data: any, options?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { 
      ...options, 
      method: 'POST', 
      body: JSON.stringify(data) 
    })
  }

  static async put<T>(endpoint: string, data: any, options?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { 
      ...options, 
      method: 'PUT', 
      body: JSON.stringify(data) 
    })
  }

  static async delete<T>(endpoint: string, options?: Omit<FetchOptions, 'method'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' })
  }
}