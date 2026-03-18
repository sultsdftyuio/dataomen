/**
 * ARCLI.TECH - Edge Middleware Orchestrator
 * Deployment Stack: Cloudflare (DNS/Edge) -> Vercel (Next.js) -> Render (FastAPI/Backend)
 * Strategy: Hybrid Performance (Supabase SSR + Next.js Edge Security)
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // 1. Diagnostic Metadata: Capture Vercel Trace ID for Cloudflare/Vercel debugging
  const requestId = request.headers.get('x-vercel-id') || 'local-dev'

  // 2. Initialize a Mutable Response Object
  // This is required by Supabase to securely set/refresh auth cookies at the Edge
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 3. Modular Strategy: Initialize Supabase Client
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
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 4. Security by Design: Cryptographic User Verification
  // Always use getUser() on the server/edge, never getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 5. Route Topology & Orchestration Definitions
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

  // 6. Access Control Execution
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
    // C. Authenticated users attempting to view auth pages -> Fast-forward to dashboard
    if (isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // 7. Standardize Security Headers for Cloudflare Compatibility
  supabaseResponse.headers.set('x-middleware-cache', 'no-cache')
  supabaseResponse.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  return supabaseResponse
}

// 8. Matcher Configuration
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * 1. /_next/static (static files, CSS, JS)
     * 2. /_next/image (image optimization API)
     * 3. /favicon.ico, /robots.txt, /sitemap.xml
     * 4. Static assets (svg, png, jpg, etc.)
     * Executing middleware on these wastes compute and slows down the frontend.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}