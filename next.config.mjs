/** * ARCLI.TECH - Next.js Orchestration Config
 * Strategy: Hybrid Performance & Modular Proxy
 * Purpose: Seamlessly bridge Vercel (UI) and Render (Compute/FastAPI)
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Analytical Efficiency: Preparation for In-Process Engines
  // If using DuckDB or heavy analytical libraries in Server Components, 
  // they must be treated as external to avoid bundling overhead.
  experimental: {
    serverComponentsExternalPackages: ['duckdb', 'polars'],
  },

  // 2. Engineering Excellence: Build & Reliability
  typescript: {
    // Note: Set to false in stable production to ensure Type Safety
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 3. Image Optimization (Modular Strategy)
  // 'unoptimized: true' is safer for Cloudflare/Vercel hybrid caching
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
  // Complements middleware.ts to protect against common attack vectors.
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
  // Proxies frontend calls to the Render FastAPI backend.
  async rewrites() {
    // Ensure the backend URL is properly formatted to prevent malformed destinations
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:10000';

    return [
      {
        /**
         * Source: /api/v1/:path* * Path: Used by the frontend (e.g., fetch('/api/v1/datasets'))
         * * Destination: Maps to the Render Backend's internal API structure.
         * We drop 'v1' here to match the FastAPI router logic.
         */
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        /**
         * Fallback for raw API calls.
         */
        source: '/api/:path((?!auth|webhooks).*)',
        destination: `${backendUrl}/api/:path*`,
      }
    ]
  },
}

export default nextConfig;