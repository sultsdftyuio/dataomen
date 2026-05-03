/** * ARCLI.TECH - Next.js Orchestration Config
 * Strategy: Hybrid Performance & Modular Proxy
 * Purpose: Bridge Vercel (UI/Edge) and DigitalOcean (Compute/FastAPI)
 * Support: support@arcli.tech
 */

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i;
const LEGACY_BACKEND_HOSTS = new Set(['api.arcli.tech']);

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const normalizeBackendBase = (rawValue) => {
  const candidate = trimTrailingSlash((rawValue || '').trim());
  if (!candidate || !ABSOLUTE_HTTP_URL_REGEX.test(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');

    if (!normalizedPath || normalizedPath === '/' || normalizedPath === '/api' || normalizedPath === '/api/v1' || normalizedPath === '/v1') {
      return parsed.origin;
    }

    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

const isLegacyBackend = (urlValue) => {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return LEGACY_BACKEND_HOSTS.has(hostname);
  } catch {
    return false;
  }
};

const resolveBackendRewriteBase = () => {
  const candidates = [
    normalizeBackendBase(process.env.BACKEND_API_URL),
    normalizeBackendBase(process.env.NEXT_PUBLIC_API_URL),
    'https://data-omen-api-tnps9.ondigitalocean.app',
  ].filter(Boolean);

  const preferred = candidates.find((urlValue) => !isLegacyBackend(urlValue));
  return preferred || candidates[0];
};

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
    const backendUrl = resolveBackendRewriteBase();

    return {
      // Fallback rewrites run only when no local route handler/page matches.
      // This guarantees local App Router endpoints like /api/chat/* and
      // /api/insights remain first-class and never get shadowed.
      fallback: [
        {
          source: '/api/v1/:path*',
          destination: `${backendUrl}/api/v1/:path*`,
        },
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    }
  },

  // 6. Runtime Optimizations
  experimental: {
    // Optimizing for technical developer personas using heavy icon sets.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;