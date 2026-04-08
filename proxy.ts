/**
 * ARCLI.TECH - Optimized Edge Middleware Orchestrator
 * Deployment Stack: Cloudflare (DNS/Edge) -> Vercel (Next.js) -> Render (FastAPI/Backend)
 * Strategy: Performance-First Auth with System-Route Bypass
 * Objective: Resolve indexing "unreachable" errors, optimize Edge compute, and prioritize the Chat-First landing zone.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Diagnostic Metadata: Capture Vercel Trace ID for Cloudflare/Vercel debugging
  const requestId = request.headers.get('x-vercel-id') || 'local-dev'

  // 2. System Route Short-Circuit (Absolute Bypass)
  // Ensure robots.txt, sitemap.xml, and favicons NEVER hit Supabase logic or risk Edge timeouts
  const isSystemRoute = ['/robots.txt', '/sitemap.xml', '/favicon.ico'].includes(pathname)
  if (isSystemRoute) {
    return NextResponse.next()
  }

  // 3. Initialize a Mutable Response Object
  // This is required by Supabase to securely set/refresh auth cookies at the Edge
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
          // Update request cookies
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Update response cookies
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 5. Security by Design: Cryptographic User Verification with Edge Fallback
  // try-catch block prevents Edge-level 500s if Supabase is momentarily unreachable
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch (error) {
    console.error(`[Middleware Auth Error] Trace ID: ${requestId}`, error)
  }

  // 6. Route Topology & Orchestration Definitions
  const isAuthRoute = ['/login', '/register', '/forgot-password'].some(route => 
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
  
  // Define public APIs that bypass Edge Auth (e.g., Stripe Webhooks, Render Health Checks)
  const publicApiRoutes = ['/api/webhooks', '/api/health']
  const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route))

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
    // This prevents malicious traffic from waking up your Render backend
    if (isApiRoute && !isPublicApiRoute) {
      return NextResponse.json(
        { 
          error: 'Unauthorized access.', 
          message: 'Edge Security prevented access to this resource.',
          trace_id: requestId 
        }, 
        { status: 401 }
      )
    }
  } else {
    // C. Authenticated users attempting to view auth pages or landing page -> Fast-forward to Chat
    // We prioritize the high-quality Chat/AI Analyst as the "first thing" users see.
    if (isAuthRoute || pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/chat'
      return NextResponse.redirect(url)
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
     * Executing middleware on these wastes compute and blocks web crawlers.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}