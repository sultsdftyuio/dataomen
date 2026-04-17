/**
 * ARCLI.TECH - Universal API Client
 * Strategy: Hybrid Performance & Multi-Tenant Security
 * Description: Wrapper around native fetch that automatically injects 
 * Supabase Authorization headers and handles Vercel-to-DigitalOcean routing securely.
 */

import { createClient } from '@/utils/supabase/client'

// Security by Design: Resolve base URL and strictly enforce HTTPS for external domains
// This definitively prevents Browser Mixed Content blocks when communicating with DigitalOcean
// Load Balancers over direct URLs, while falling back gracefully to the Next.js rewrite proxy.
const resolveApiUrl = () => {
  const url = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  
  // Force protocol upgrade if an insecure absolute URL leaked into the environment
  if (url.startsWith('http://') && !url.includes('localhost')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const API_BASE_URL = resolveApiUrl().replace(/\/$/, '');

const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

const isInternalNextApiRoute = (path: string) => path === '/api' || path.startsWith('/api/');

const buildRequestUrl = (endpoint: string) => {
  if (ABSOLUTE_URL_REGEX.test(endpoint)) {
    return endpoint;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Internal Next.js App Router API routes should be called exactly as provided.
  if (isInternalNextApiRoute(cleanEndpoint)) {
    return cleanEndpoint;
  }

  // External API routes keep strict trailing slash behavior to avoid redirect/header issues.
  const [pathPart, queryPart] = cleanEndpoint.split('?', 2);
  const securePath = pathPart.endsWith('/') ? pathPart : `${pathPart}/`;
  const finalEndpoint = queryPart ? `${securePath}?${queryPart}` : securePath;

  return `${API_BASE_URL}${finalEndpoint}`;
};

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export class ApiClient {
  // Analytical Efficiency: We utilize a dynamic getter to tap into the globally 
  // cached singleton instance created in `utils/supabase/client.ts`.
  // This eradicates the "Multiple GoTrueClient instances detected" warning.
  private static get supabase() {
    return createClient();
  }

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
      
      // FastAPI backend expects a standard Bearer token for middleware ingestion
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    // 3. Construct URL with internal-route bypass and external strict routing
    const url = buildRequestUrl(endpoint)

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