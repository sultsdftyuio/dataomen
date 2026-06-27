/**
 * ARCLI.TECH - Universal API Client
 * Strategy: Single Entry Point (Browser -> Vercel -> DigitalOcean)
 * Description: Wrapper around native fetch that strictly uses relative routes 
 * to leverage next.config.mjs rewrites, avoiding CORS entirely.
 */

import { createClient } from '@/utils/supabase/client'

// --- Custom Error Class ---
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 1. Hardcoded Base URL (Security win: backend origin is never exposed to the browser)
const API_BASE_URL = "/api/v1";

const INTERNAL_NEXT_API_PREFIXES = [
  '/api/chat',
  '/api/insights',
  '/api/og',
];

// Strictly match local Next.js route handlers
const isInternalNextApiRoute = (path: string) => {
  return INTERNAL_NEXT_API_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
};

// 2. Simplified URL Builder
const buildRequestUrl = (endpoint: string) => {
  if (/^https?:\/\//i.test(endpoint)) {
    throw new Error("Absolute API URLs are forbidden. Use relative endpoints.");
  }

  const clean = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (isInternalNextApiRoute(clean)) {
    return clean;
  }

  if (clean.startsWith("/api/v1")) {
    return clean;
  }

  return `${API_BASE_URL}${clean}`;
};

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
  timeoutMs?: number; // Override default 30s timeout if needed
}

export class ApiClient {
  private static get supabase() {
    return createClient();
  }

  /**
   * Core execution method prioritizing functional, stateless operations.
   */
  static async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { requireAuth = true, timeoutMs = 30000, headers: customHeaders, ...fetchOptions } = options;
    
    // 1. Prepare base headers
    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // 9. Add Request ID for end-to-end tracing
    if (!headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', crypto.randomUUID());
    }

    // 2. Inject Supabase Session Token & Handle Automatic Refreshes
    if (requireAuth) {
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (!session) {
        // Attempt to refresh an expired session before failing
        await this.supabase.auth.refreshSession();
        const refreshed = await this.supabase.auth.getSession();

        if (!refreshed.data.session) {
          throw new ApiError(401, "Authentication required. No active session.");
        }
        
        headers.set('Authorization', `Bearer ${refreshed.data.session.access_token}`);
      } else {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
    }

    // 3. Construct URL
    const url = buildRequestUrl(endpoint);

    // 4. Request Debugging (Development only)
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ApiClient]", {
        endpoint,
        url,
        method: fetchOptions.method ?? "GET",
        auth: headers.has("Authorization"),
        requestId: headers.get("X-Request-ID")
      });
    }

    // 5. Abort long requests to prevent hanging UI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;

    try {
      // 6. Execute Network Call with resilience checks
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: "same-origin",
        cache: "no-store", // Prevent browser caching of authenticated requests
        signal: controller.signal,
      });
    } catch (err) {
      // Explicitly handle timeouts vs total network failures
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(408, "Request timed out.");
      }
      throw new ApiError(0, "Unable to reach the server.");
    } finally {
      // Clean up the timer to prevent memory leaks
      clearTimeout(timeoutId);
    }

    // 7. Handle standard HTTP Errors organically with preserved status
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      throw new ApiError(
        response.status,
        errorData.detail ?? errorData.message ?? errorData.error ?? "Unknown API error",
        errorData
      );
    }

    // 8. Smart Response Parsing
    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  // --- Convenience Methods ---

  static async get<T>(endpoint: string, options?: Omit<FetchOptions, 'method'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' });
  }

  static async post<T>(endpoint: string, data?: any, options?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { 
      ...options, 
      method: 'POST', 
      ...(data && { body: JSON.stringify(data) })
    });
  }

  static async put<T>(endpoint: string, data?: any, options?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.fetch<T>(endpoint, { 
      ...options, 
      method: 'PUT', 
      ...(data && { body: JSON.stringify(data) })
    });
  }

  static async delete<T>(endpoint: string, options?: Omit<FetchOptions, 'method'>) {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
  }
}