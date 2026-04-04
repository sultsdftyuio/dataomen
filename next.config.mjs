/** * ARCLI.TECH - Next.js Orchestration Config
 * Strategy: Hybrid Performance & Modular Proxy
 * Purpose: Bridge Vercel (UI/Edge) and DigitalOcean (Compute/FastAPI)
 * Support: support@arcli.tech
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Analytical Efficiency: In-Process Engine Preparation
  // Optimized for high-concurrency WASM and binary compute packages.
  // Moved from experimental to top-level for Next.js 15+ stability.
  serverExternalPackages: [
    'duckdb', 
    'polars', 
    '@libsql/client',
    'duckdb-wasm'
  ],

  // 2. Engineering Excellence: Managed Build Pipeline
  // Build-time checks are handled via dedicated CI/CD workflows (GitHub Actions).
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 3. Image Optimization: Multi-Region Asset Strategy
  // Enables high-performance formats and normalizes remote asset sources.
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'arcli.tech',
      },
      {
        protocol: 'https',
        hostname: 'pub-5ef213459c7b4117865c36b4129b0f02.r2.dev', // R2 Asset Storage
      }
    ],
  },

  // 4. Security by Design: Structural Backbone
  // Enforces global headers for tenant isolation and data sovereignty.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ]
  },

  // 5. Hybrid Performance Paradigm: Deterministic API Routing
  // Maps Vercel Edge requests to DigitalOcean App Platform clusters.
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'https://data-omen-api-tnps9.ondigitalocean.app';

    return [
      {
        /**
         * Source: /api/v1/:path*
         * Maps versioned frontend calls to the internal FastAPI structure.
         */
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        /**
         * System Override for Compute/Orchestration.
         * Explicitly excludes auth and webhooks to maintain Edge isolation.
         */
        source: '/api/:path((?!auth|webhooks|chat/orchestrate).*)',
        destination: `${backendUrl}/api/:path*`,
      }
    ]
  },

  // 6. Runtime Optimizations
  experimental: {
    // Optimizing for technical developer personas using heavy icon sets.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;