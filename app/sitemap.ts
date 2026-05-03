// app/sitemap.ts
import { MetadataRoute } from 'next';
import { getAllSlugs, getNormalizedPage } from '@/lib/seo/registry';

const BASE_URL = 'https://arcli.tech';

/**
 * Arcli Dynamic Sitemap Generator
 * Merges hardcoded static landing pages with AI-generated SEO registry pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Fetch all dynamically generated SEO pages from the registry
  // NOTE: Ensure you run `node scripts/generate-registry.mjs` to pick up new files!
  const rawSlugs = await getAllSlugs();
  const slugs = Array.isArray(rawSlugs) ? rawSlugs : [];

  const dynamicRoutes: MetadataRoute.Sitemap = await Promise.all(
    slugs
      .filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0)
      .map(async (slug) => {
        const data = await getNormalizedPage(slug);
      
      // Default values for standard pages (guides, etc.)
      let priority = 0.7;
      let changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' = 'monthly';

      // Boost priority for high-conversion intents (Bottom of Funnel)
      if (data?.type === 'campaign' || data?.type === 'integration') {
        priority = 0.9;
        changeFrequency = 'weekly';
      } else if (data?.type === 'comparison') {
        priority = 0.8;
        changeFrequency = 'monthly';
      }

      // Safely parse the date, fallback to current date if missing or invalid
      let lastModified = new Date();
      if (data?.seo?.dateModified) {
        const parsedDate = new Date(data.seo.dateModified);
        if (!isNaN(parsedDate.getTime())) {
          lastModified = parsedDate;
        }
      }

      // Prevent accidental double slashes in URLs if slugs start with '/'
      const cleanSlug = slug.replace(/^\/+/, '');

        return {
          url: `${BASE_URL}/${cleanSlug}`,
          lastModified,
          changeFrequency,
          priority,
        };
      })
  );

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