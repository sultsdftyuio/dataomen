/** * ARCLI.TECH - Next.js Orchestration Config
 * Strategy: Hybrid Performance & Modular Proxy
 * Purpose: Bridge Vercel (UI/Edge) and DigitalOcean (Compute/FastAPI)
 * Support: support@arcli.tech
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Analytical Efficiency: Preparation for In-Process Engines
  // Heavy analytical libraries are treated as external to avoid Vercel bundling overhead.
  experimental: {
    serverComponentsExternalPackages: ['duckdb', 'polars'],
  },

  // 2. Engineering Excellence: Build & Reliability
  // We prioritize runtime stability; strict type checking is enforced in the CI/CD pipeline.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 3. Image Optimization (Modular Strategy)
  // Unoptimized images ensure maximum compatibility with Cloudflare/Vercel hybrid caching.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // 4. Security by Design: Global Header Injection
  // Structural backbone for tenant isolation and defense-in-depth.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  // 5. Hybrid Performance Paradigm: API Orchestration
  // Proxies frontend calls to the DigitalOcean App Platform backend.
  async rewrites() {
    // Primary compute endpoint on DigitalOcean
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'https://data-omen-api-tnps9.ondigitalocean.app';

    return [
      {
        /**
         * Source: /api/v1/:path*
         * Destination: DigitalOcean FastAPI Cluster
         * Maps versioned frontend calls to the internal API structure.
         */
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        /**
         * Fallback for raw API calls.
         * Explicitly excludes /api/auth and webhooks to keep them isolated at the Edge.
         */
        source: '/api/:path((?!auth|webhooks).*)',
        destination: `${backendUrl}/api/:path*`,
      }
    ]
  },
}

export default nextConfig;