import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/', '/_next/'], // Protect private routes from indexing
    },
    sitemap: 'https://dataomen.com/sitemap.xml',
  }
}