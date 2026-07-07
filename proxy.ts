/**
 * ARCLI.TECH - Edge Middleware Orchestrator
 * Deployment Stack: Cloudflare (DNS/CDN/Proxy) -> Vercel (Next.js Edge Runtime) -> Supabase
 *
 * Strategy:
 * - Performance-first auth hydration via Supabase SSR
 * - Selective route protection with fail-closed authorization
 * - System-route absolute bypass for crawlers/SEO
 * - Dashboard-first UX orchestration for authenticated users
 *
 * Benefits of current stack (no intermediate backend proxy):
 * - No cross-origin hops to a separate API server
 * - No rewrite failure modes or downstream proxy timeouts
 * - Lower latency: Vercel Edge -> Supabase directly
 * - Simpler CORS surface: most APIs are same-origin Vercel Route Handlers
 * - Trust boundaries are cleaner: Edge auth is the single enforcement point
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  DEFAULT_POST_AUTH_REDIRECT_PATH,
  resolvePostAuthRedirectPath,
} from '@/utils/auth-redirects'

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const EDGE_LAYER = 'next-edge-middleware'

  const isRootAuthCallback =
    pathname === '/' &&
    (request.nextUrl.searchParams.has('code') ||
      (request.nextUrl.searchParams.has('token_hash') &&
        request.nextUrl.searchParams.has('type')))

  if (isRootAuthCallback) {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'

    if (!callbackUrl.searchParams.has('next')) {
      callbackUrl.searchParams.set('next', DEFAULT_POST_AUTH_REDIRECT_PATH)
    }

    return NextResponse.redirect(callbackUrl)
  }

  // ---------------------------------------------------------------------------
  // Correlation ID: Attach Vercel trace for debugging across Cloudflare + Vercel
  // ---------------------------------------------------------------------------
  const requestId = request.headers.get('x-vercel-id') ?? crypto.randomUUID()

  const logRouteTrace = (event: string, data: Record<string, unknown> = {}) => {
    // Reduce noise in production; keep structured for log aggregators (e.g. Axiom, Datadog)
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          event,
          layer: EDGE_LAYER,
          path: pathname,
          method: request.method,
          request_id: requestId,
          ...data,
        })
      )
    }
  }

  // ---------------------------------------------------------------------------
  // 1. System Route Short-Circuit
  // These are matched by the config.matcher exclusions, but kept as a defense
  // in case the matcher config is ever loosened.
  // ---------------------------------------------------------------------------
  const isSystemRoute = ['/robots.txt', '/sitemap.xml', '/favicon.ico'].includes(pathname)
  if (isSystemRoute) {
    return NextResponse.next()
  }

  // ---------------------------------------------------------------------------
  // 2. Initialize a Mutable Response + Supabase SSR Client
  // IMPORTANT: supabaseResponse must be the object passed to all cookie mutations
  // so that session tokens are correctly forwarded on redirect/pass-through.
  // ---------------------------------------------------------------------------
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Missing Supabase env vars — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return NextResponse.next()
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const markAuthResponseNoStore = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  }

  const carrySupabaseCookies = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
      response.cookies.set(name, value, options)
    })

    return markAuthResponseNoStore(response)
  }

  // ---------------------------------------------------------------------------
  // 3. Cryptographic User Verification
  // getUser() calls the Supabase Auth server to validate the JWT — it is NOT
  // a local decode. Failures here are non-fatal; the route guard below handles
  // the unauthenticated case.
  // ---------------------------------------------------------------------------
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch (error) {
    console.error(`[Middleware] Auth verification failed. request_id=${requestId}`, error)
  }

  // ---------------------------------------------------------------------------
  // 4. Route Topology
  // ---------------------------------------------------------------------------
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/signup', '/sign-up'].some(
    route => pathname.startsWith(route)
  )

  const protectedViews = [
    '/dashboard',
    '/agents',
    '/datasets',
    '/investigate',
    '/chat',
    '/billing',
    '/settings',
  ]
  const isProtectedView = protectedViews.some(route => pathname.startsWith(route))

  const isApiRoute = pathname.startsWith('/api')
  const isApiPreflight = isApiRoute && request.method === 'OPTIONS'

  // ---------------------------------------------------------------------------
  // 5. CORS Headers
  // Most APIs in this stack are same-origin Vercel Route Handlers, so CORS is
  // only required for cross-origin callers: mobile apps, browser extensions,
  // or explicitly externally-consumed API routes.
  //
  // Origin reflection is restricted to the allowlist below rather than echoing
  // arbitrary origins, which would undermine CORS entirely.
  // ---------------------------------------------------------------------------
  const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

  const buildApiCorsHeaders = (): Record<string, string> => {
    const origin = request.headers.get('origin') ?? ''
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin)
    const requestedHeaders =
      request.headers.get('access-control-request-headers') ?? 'Authorization, Content-Type'

    return {
      ...(isAllowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': requestedHeaders,
      'Vary': 'Origin, Access-Control-Request-Headers',
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Public API Routes (no session required)
  // These are intentionally narrow. Prefer adding routes here over widening
  // the bearer-token bypass below.
  // ---------------------------------------------------------------------------
  const publicApiRoutes = [
    '/api/webhooks',   // e.g. Stripe, GitHub — verified by payload signature, not session
    '/api/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/v1/auth/register',
  ]
  const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route))

  // ---------------------------------------------------------------------------
  // 7. Machine-to-Machine API Routes (Bearer token permitted)
  // Only routes explicitly listed here can bypass cookie-session auth via a
  // bearer token. The token MUST still be validated by the Route Handler —
  // this bypass skips the Edge cookie check, not downstream verification.
  //
  // DO NOT widen this list to cover general API routes. Without a separate
  // API gateway validating tokens, a loose bearer bypass creates a silent
  // trust boundary gap.
  // ---------------------------------------------------------------------------
  const machineApiRoutes = [
    '/api/internal',   // internal service-to-service calls
    '/api/webhooks',   // webhook payloads carry their own HMAC signatures
    '/api/v1/track',   // public event ingestion; FastAPI validates the API key
  ]

  const authHeader = request.headers.get('authorization') ?? ''
  const hasBearerToken = authHeader.toLowerCase().startsWith('bearer ')
  const isMachineApiRoute = machineApiRoutes.some(route => pathname.startsWith(route))

  // ---------------------------------------------------------------------------
  // 8. CORS Preflight — always resolve at Edge so browsers don't fail OPTIONS
  // ---------------------------------------------------------------------------
  if (isApiPreflight) {
    logRouteTrace('route_trace', { handler: 'preflight-terminate', status: 204 })
    return markAuthResponseNoStore(
      new NextResponse(null, {
        status: 204,
        headers: {
          ...buildApiCorsHeaders(),
          'Allow': 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
          'X-Route-Handler': 'preflight-terminate',
        },
      })
    )
  }

  // ---------------------------------------------------------------------------
  // 9. Bearer-Token Pass-Through (M2M only — explicitly scoped)
  // ---------------------------------------------------------------------------
  if (isApiRoute && hasBearerToken && isMachineApiRoute) {
    logRouteTrace('route_trace', { handler: 'bearer-pass-m2m', status: 200 })
    return markAuthResponseNoStore(supabaseResponse)
  }

  // ---------------------------------------------------------------------------
  // 10. Access Control Execution
  // ---------------------------------------------------------------------------
  if (!user) {
    // Unauthenticated: protect UI views
    if (isProtectedView) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'

      // Validate `next` to prevent open-redirect attacks: only allow relative paths
      const safeNext = resolvePostAuthRedirectPath(pathname)
      url.searchParams.set('next', safeNext)

      return carrySupabaseCookies(NextResponse.redirect(url))
    }

    // Unauthenticated: hard-block internal API routes at Edge
    if (isApiRoute && !isPublicApiRoute) {
      logRouteTrace('route_trace', { handler: 'auth-gate-deny', status: 401 })
      return carrySupabaseCookies(
        NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Authentication is required to access this resource.',
            request_id: requestId,
          },
          {
            status: 401,
            headers: {
              ...buildApiCorsHeaders(),
              'X-Route-Handler': 'auth-gate-deny',
            },
          }
        )
      )
    }
  } else {
    // Authenticated: redirect away from auth pages and root
    if (isAuthRoute || pathname === '/') {
      const safeNext = resolvePostAuthRedirectPath(request.nextUrl.searchParams.get('next'))
      const targetUrl = new URL(safeNext, request.url)

      return carrySupabaseCookies(NextResponse.redirect(targetUrl))
    }
  }

  // ---------------------------------------------------------------------------
  // 11. Security Headers
  // ---------------------------------------------------------------------------
  supabaseResponse.headers.set('x-middleware-cache', 'no-cache')
  supabaseResponse.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  )
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
  supabaseResponse.headers.set('X-Frame-Options', 'DENY')
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  return markAuthResponseNoStore(supabaseResponse)
}

// ---------------------------------------------------------------------------
// Matcher: exclude static assets and Next.js internals from middleware overhead
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
