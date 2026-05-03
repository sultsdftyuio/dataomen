/**
 * ARCLI.TECH - Optimized Edge Middleware Orchestrator
 * Deployment Stack: Cloudflare (DNS/Edge) -> Vercel (Next.js) -> Render (FastAPI/Backend)
 * Strategy: Performance-First Auth with System-Route Bypass
 * Objective: Resolve indexing "unreachable" errors, optimize Edge compute, and prioritize the Dashboard-First landing zone.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Correct Next.js 16.1+ export signature for proxy.ts
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const EDGE_LAYER = 'next-edge-middleware'

  const logRouteTrace = (event: string, data: Record<string, unknown> = {}) => {
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event,
        layer: EDGE_LAYER,
        path: pathname,
        method: request.method,
        ...data,
      })
    )
  }

  // 1. Diagnostic Metadata: Capture Vercel Trace ID for Cloudflare/Vercel debugging
  const requestId = request.headers.get('x-vercel-id') || 'local-dev'

  // 2. System Route Short-Circuit (Absolute Bypass)
  const isSystemRoute = ['/robots.txt', '/sitemap.xml', '/favicon.ico'].includes(pathname)
  if (isSystemRoute) {
    return NextResponse.next()
  }

  // 3. Initialize a Mutable Response Object
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 4. Modular Strategy: Initialize Resilient Supabase Client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 5. Security by Design: Cryptographic User Verification with Edge Fallback
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch (error) {
    console.error(`[Middleware Auth Error] Trace ID: ${requestId}`, error)
  }

  // 6. Route Topology & Orchestration Definitions
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/signup', '/sign-up'].some(route => 
    pathname.startsWith(route)
  )

  const protectedViews = [
    '/dashboard', 
    '/agents', 
    '/datasets', 
    '/investigate', 
    '/chat', 
    '/billing', 
    '/settings'
  ]
  const isProtectedView = protectedViews.some(route => pathname.startsWith(route))

  // API Routing Management (Crucial for Vercel -> Render Next.js Rewrites)
  const isApiRoute = pathname.startsWith('/api')
  const isApiPreflight = isApiRoute && request.method === 'OPTIONS'
  const authHeader = request.headers.get('authorization') || ''
  const hasBearerToken = authHeader.toLowerCase().startsWith('bearer ')

  const buildApiCorsHeaders = () => {
    const origin = request.headers.get('origin') || '*'
    const requestedHeaders = request.headers.get('access-control-request-headers') || 'Authorization, Content-Type'

    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': requestedHeaders,
      'Vary': 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method',
    }
  }
  
  // Define public APIs that bypass Edge Auth
  const publicApiRoutes = [
    '/api/webhooks',
    '/api/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/v1/auth/register',
  ]
  const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route))

  // Always allow CORS preflight checks to reach route handlers/rewrite targets.
  if (isApiPreflight) {
    logRouteTrace('route_trace', { handler: 'proxy-preflight-terminate', status: 204 })
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...buildApiCorsHeaders(),
        'X-Route-Layer': EDGE_LAYER,
        'X-Route-Handler': 'proxy-preflight-terminate',
        'Allow': 'GET,HEAD,POST,PUT,DELETE,PATCH,OPTIONS',
      },
    })
  }

  // Permit token-authenticated API requests even when cookie session hydration is flaky.
  if (isApiRoute && hasBearerToken) {
    logRouteTrace('route_trace', { handler: 'proxy-bearer-pass', status: 200 })
    return NextResponse.next()
  }

  // 7. Access Control Execution
  if (!user) {
    // A. Unauthenticated users attempting to view private UI -> Kick to login
    if (isProtectedView) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      // Pass the original URL to allow seamless redirect after successful login
      url.searchParams.set('next', pathname) 
      return NextResponse.redirect(url)
    }

    // B. Unauthenticated users attempting to hit internal APIs -> Hard block at Edge
    if (isApiRoute && !isPublicApiRoute) {
      logRouteTrace('route_trace', { handler: 'proxy-auth-gate', status: 401, trace_id: requestId })
      return NextResponse.json(
        { 
          error: 'Unauthorized access.', 
          message: 'Edge Security prevented access to this resource.',
          trace_id: requestId 
        }, 
        {
          status: 401,
          headers: {
            ...buildApiCorsHeaders(),
            'X-Route-Layer': EDGE_LAYER,
            'X-Route-Handler': 'proxy-auth-gate',
          },
        }
      )
    }
  } else {
    // C. Authenticated users attempting to view auth pages or root landing -> Redirect intelligently
    if (isAuthRoute || pathname === '/') {
      const nextUrl = request.nextUrl.searchParams.get('next')
      const targetUrl = request.nextUrl.clone()
      
      // Respect the 'next' parameter if they were kicked to login, otherwise prioritize the Dashboard
      targetUrl.pathname = nextUrl || '/dashboard' 
      targetUrl.searchParams.delete('next')
      
      return NextResponse.redirect(targetUrl)
    }
  }

  // 8. Standardize Security Headers for Cloudflare Compatibility
  supabaseResponse.headers.set('x-middleware-cache', 'no-cache')
  supabaseResponse.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  return supabaseResponse
}

// 9. Refined Matcher Configuration
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * 1. /_next/static (static files, CSS, JS)
     * 2. /_next/image (image optimization API)
     * 3. /favicon.ico, /robots.txt, /sitemap.xml
     * 4. Static assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}