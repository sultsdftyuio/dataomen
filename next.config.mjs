/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        // Intercept all requests to /api/v1/...
        source: '/api/v1/:path*',
        // Route them to the Render backend (or fallback to localhost for dev)
        // Ensure you add NEXT_PUBLIC_API_URL to your Vercel Environment Variables!
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:10000'}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig;