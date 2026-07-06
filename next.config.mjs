/** * ARCLI.TECH - Next.js Orchestration Config
 * Strategy: Hybrid Performance & Modular Proxy
 * Purpose: Bridge Vercel (UI/Edge) and DigitalOcean (Compute/FastAPI)
 * Support: support@arcli.tech
 */

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i;

// Only block Next.js from routing to its own UI domains.
// This allows 'api.arcli.tech' and 'localhost' to pass through normally.
const FRONTEND_HOSTS = new Set(['arcli.tech', 'www.arcli.tech']);

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const normalizeBackendBase = (rawValue) => {
  const candidate = trimTrailingSlash((rawValue || '').trim());
  if (!candidate || !ABSOLUTE_HTTP_URL_REGEX.test(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');

    // Strip common API prefixes from the base URL so the rewrite rules can manage them deterministically
    if (!normalizedPath || normalizedPath === '/' || normalizedPath === '/api' || normalizedPath === '/api/v1' || normalizedPath === '/v1') {
      return parsed.origin;
    }

    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

const isFrontendDomain = (urlValue) => {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return FRONTEND_HOSTS.has(hostname);
  } catch {
    return false;
  }
};

const resolveBackendRewriteBase = () => {
  const candidates = [
    normalizeBackendBase(process.env.BACKEND_API_URL),
    normalizeBackendBase(process.env.NEXT_PUBLIC_API_URL),
    'https://arcli-s2mti.ondigitalocean.app', // Updated to the active DigitalOcean cluster
  ].filter(Boolean);

  // Prevent Next.js from proxying to itself by filtering out ONLY UI frontend domains
  const preferred = candidates.find((urlValue) => !isFrontendDomain(urlValue));
  
  // Fallback safely to the active DigitalOcean cluster
  return preferred || 'https://arcli-s2mti.ondigitalocean.app'; 
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Analytical Efficiency: In-Process Engine Preparation
  // Optimized for high-concurrency WASM and binary compute packages.
  serverExternalPackages: [
    'duckdb', 
    'polars', 
    '@libsql/client',
    'duckdb-wasm'
  ],

  // 2. Engineering Excellence: Managed Build Pipeline
  // Build-time checks are handled via dedicated CI/CD workflows (GitHub Actions).
  typescript: {
    ignoreBuildErrors: false
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
      // 🚨 CRITICAL FIX: 'beforeFiles' forces Next.js to proxy these routes 
      // BEFORE it looks inside your local app/api/ folder.
      beforeFiles: [
        {
          source: '/api/v1/:path*',
          destination: `${backendUrl}/v1/:path*`,
        }
      ],
      afterFiles: [],
      fallback: [
        // Generic fallback for any other endpoints
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        }
      ]
    };
  },

  // 6. Runtime Optimizations
  experimental: {
    // Optimizing for technical developer personas using heavy icon sets.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
