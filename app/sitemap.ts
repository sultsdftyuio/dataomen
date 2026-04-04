// app/sitemap.ts
import { MetadataRoute } from 'next';
import { getAllSlugs } from '@/lib/seo/registry';
import { getNormalizedPage } from '@/lib/seo/parser';

const BASE_URL = 'https://www.arcli.tech';

/**
 * Arcli Dynamic Sitemap Generator
 * Merges hardcoded static landing pages with AI-generated SEO registry pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Fetch all dynamically generated SEO pages from the registry
  // NOTE: Ensure you run `node scripts/generate-registry.mjs` to pick up new files!
  const slugs = getAllSlugs();

  const dynamicRoutes: MetadataRoute.Sitemap = slugs.map((slug) => {
    const data = getNormalizedPage(slug);
    
    // Default values for standard pages (guides, etc.)
    let priority = 0.7;
    let changeFrequency: 'daily' | 'weekly' | 'monthly' = 'monthly';

    // Boost priority for high-conversion intents (Bottom of Funnel)
    if (data?.type === 'campaign' || data?.type === 'integration') {
      priority = 0.9;
      changeFrequency = 'weekly';
    } else if (data?.type === 'comparison') {
      priority = 0.8;
      changeFrequency = 'monthly';
    }

    return {
      url: `${BASE_URL}/${slug}`,
      // Uses the explicit SEO dateModified, or falls back to now
      lastModified: data?.seo?.dateModified ? new Date(data.seo.dateModified) : new Date(),
      changeFrequency,
      priority,
    };
  });

  // 2. Define all static application routes found in app/(landing)
  // These are the "Core" pages that don't rely on the SEO registry.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/integrations`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/security`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/shopify`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/analyze-shopify-data`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/cookies`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    }
  ];

  // 3. Merge and return the complete sitemap
  return [...staticRoutes, ...dynamicRoutes];
}