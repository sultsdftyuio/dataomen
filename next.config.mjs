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
        // Intercept all requests starting with /api/v1/...
        source: '/api/v1/:path*',
        // Route them to the Render backend (or fallback to localhost locally)
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:10000'}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig;