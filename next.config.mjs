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
        // Intercept all requests starting with /api/v1/... from the frontend
        source: '/api/v1/:path*',
        // Route them to the backend, dropping the 'v1' to match the FastAPI router prefixes (e.g., /api/datasets)
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:10000'}/api/:path*`,
      },
    ]
  },
}

export default nextConfig;