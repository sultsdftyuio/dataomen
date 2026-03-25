// app/sitemap.ts
import { MetadataRoute } from 'next';
import { seoPages } from '@/lib/seo/index';

/**
 * Arcli Global Sitemap Generator
 * * Execution Paradigm: Functional and stateless. We programmatically combine 
 * static core routes with our dynamic, outcome-driven SEO landing pages.
 * Search engines use this to map the semantic context of arcli.tech.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Core Domain Configuration
  const baseUrl = 'https://arcli.tech';
  const currentDate = new Date();

  // 1. Static Core Routes (High Priority)
  // These represent the primary conversion funnel and platform architecture.
  const coreRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'always',
      priority: 1.0,
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
      url: `${baseUrl}/integrations`, // The Hub Page we just built
      lastModified: currentDate,
      changeFrequency: 'weekly',
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

  // 2. Dynamic SEO Routes (Mid Priority)
  // Vectorized mapping of our semantic content silos. This ensures long-tail 
  // search discovery without penalizing the DOM of our application UI.
  const dynamicSeoRoutes: MetadataRoute.Sitemap = Object.keys(seoPages).map((slug) => ({
    url: `${baseUrl}/${slug}`,
    lastModified: currentDate,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // 3. Legal & Compliance Routes (Low Priority)
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
      url: `${baseUrl}/security`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4, // Slightly higher for enterprise trust signals
    },
  ];

  // Analytical Efficiency: Spread operator for O(N) combination
  return [...coreRoutes, ...dynamicSeoRoutes, ...legalRoutes];
}