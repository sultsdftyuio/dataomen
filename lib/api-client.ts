/**
 * ARCLI.TECH - Universal API Client
 * Strategy: Hybrid Performance & Multi-Tenant Security
 * Description: Wrapper around native fetch that automatically injects 
 * Supabase Authorization headers and handles Vercel-to-DigitalOcean routing securely.
 */

import { createClient } from '@/utils/supabase/client'

// --- Temporary Debug Logs ---
console.log("NEXT_PUBLIC_API_URL =", process.env.NEXT_PUBLIC_API_URL);

// 1. Resolve base URL safely (Vercel as Single Entry Point)
const resolveApiUrl = () => {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();

  // Production should always go through Vercel rewrites by default.
  if (!url) {
    return "/api/v1";
  }

  return url.replace(/\/+$/, "");
};

const API_BASE_URL = resolveApiUrl();
console.log("API_BASE_URL =", API_BASE_URL); // Temporary debug log

// 8. Detect accidental HTTP in production immediately at startup
if (
  process.env.NODE_ENV === "production" &&
  API_BASE_URL.startsWith("http://") &&
  !API_BASE_URL.includes("localhost")
) {
  throw new Error(`NEXT_PUBLIC_API_URL must use HTTPS: ${API_BASE_URL}`);
}

const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
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

// 2. Fail loud on insecure external URLs instead of silently masking them
const validateExternalUrl = (url: string) => {
  if (
    process.env.NODE_ENV === "production" &&
    url.startsWith("http://") &&
    !url.includes("localhost")
  ) {
    throw new Error(`Insecure API URL detected: ${url}. Use HTTPS or /api/v1.`);
  }

  return url;
};

// 3. Simplified URL Builder without double-prefixing
const buildRequestUrl = (endpoint: string) => {
  if (ABSOLUTE_URL_REGEX.test(endpoint)) {
    return validateExternalUrl(endpoint);
  }

  const clean = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (isInternalNextApiRoute(clean)) {
    return clean;
  }

  // Strip prefix if the endpoint passed already includes it, to prevent /api/v1/api/v1/...
  const normalizedEndpoint = clean.startsWith("/api")
    ? clean.replace(/^\/api\/v1/, "")
    : clean;

  return validateExternalUrl(`${API_BASE_URL}${normalizedEndpoint}`);
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

    // 2. Inject Supabase Session Token if Auth is required
    if (requireAuth) {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error || !session) {
        console.warn('API Client: Missing session for authenticated route.');
        // 5. Better authentication diagnostics
        throw new Error(error?.message ?? "Unauthorized: No active session.");
      }
      
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }

    // 3. Construct URL
    const url = buildRequestUrl(endpoint);

    // --- Temporary Diagnostics ---
    console.log("Endpoint:", endpoint);
    console.log("Final URL:", url);

    // 4. Request Debugging (Development only)
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ApiClient]", {
        endpoint,
        url,
        method: fetchOptions.method ?? "GET",
        auth: headers.has("Authorization"),
      });
    }

    // 7. Abort long requests to prevent hanging UI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 4. Execute Network Call
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      // 6. Handle standard HTTP Errors organically with preserved status
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          [
            `HTTP ${response.status}`,
            errorData.detail,
            errorData.error,
            errorData.message,
          ]
            .filter(Boolean)
            .join(" | ")
        );
      }

      // Return parsed JSON automatically
      return (await response.json()) as T;

    } finally {
      // Clean up the timer to prevent memory leaks
      clearTimeout(timeoutId);
    }
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