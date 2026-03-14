import { MetadataRoute } from 'next';
// Updated import path
import { seoPages } from '@/lib/seo/index';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://dataomen.com';

  // Base routes
  const routes = [
    '',
    '/pricing',
    '/register',
    '/login',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // Map over the massive dictionary you built
  const dynamicRoutes = Object.keys(seoPages).map((slug) => ({
    url: `${baseUrl}/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...routes, ...dynamicRoutes];
}