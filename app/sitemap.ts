import { MetadataRoute } from 'next'
import { seoPages } from '@/lib/seo-data'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://dataomen.com'

  // Map your programmatic SEO pages
  const seoUrls = Object.keys(seoPages).map((slug) => ({
    url: `${baseUrl}/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Add static core routes
  const coreRoutes = ['', '/login', '/register', '/pricing'].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: route === '' ? 1.0 : 0.5,
  }))

  return [...coreRoutes, ...seoUrls]
}