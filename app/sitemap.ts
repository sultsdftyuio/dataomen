// app/sitemap.ts
import { MetadataRoute } from 'next';
import { getAllSlugs } from '@/lib/seo/registry';

/**
 * Arcli Global Sitemap Generator
 * Execution Paradigm: Functional and stateless. We programmatically combine 
 * static core routes with our dynamic, outcome-driven SEO landing pages.
 * Search engines use this to map the semantic context and crawl budget of arcli.tech.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Core Domain Configuration (Always use www. to enforce canonical parity)
  const baseUrl = 'https://www.arcli.tech';
  const currentDate = new Date();

  // 1. Static Core Routes (Highest Priority)
  // These represent the primary conversion funnel and platform architecture.
  const coreRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'always',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/analyze-shopify-data`, // The Primary Shopify Pillar Page
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/platform`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/agents`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/integrations`, // The Integrations Hub Page
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/chat/demo`, // Interactive Demo Flow
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];

  // 2. Dynamic SEO Routes (High Priority Growth Engine)
  // Vectorized mapping of our semantic content silos using the lazy hydration registry.
  // We assign a 0.9 priority to signal to Google that these are high-value entry points.
  const slugs = getAllSlugs();
  const dynamicSeoRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${baseUrl}/${slug}`,
    lastModified: currentDate,
    changeFrequency: 'weekly',
    priority: 0.9, 
  }));

  // 3. Legal & Compliance Routes (Low Priority)
  // We aggressively downrank these so Google doesn't waste its crawl budget here.
  const legalRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/privacy`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/cookies`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/security`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4, // Slightly higher for B2B/Enterprise trust signals
    },
  ];

  // Analytical Efficiency: Spread operator for O(N) combination
  return [...coreRoutes, ...dynamicSeoRoutes, ...legalRoutes];
}