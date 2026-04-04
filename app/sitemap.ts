// app/sitemap.ts
import { MetadataRoute } from 'next';
import { getAllSlugs } from '@/lib/seo/registry';
import { getNormalizedPage } from '@/lib/seo/parser';

const BASE_URL = 'https://www.arcli.tech';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Fetch all dynamically generated SEO pages
  const slugs = getAllSlugs();

  const dynamicRoutes: MetadataRoute.Sitemap = slugs.map((slug) => {
    const data = getNormalizedPage(slug);
    
    // Dynamically score priority based on page intent (Bottom-of-funnel gets priority)
    let priority = 0.7;
    let changeFrequency: 'daily' | 'weekly' | 'monthly' = 'monthly';

    if (data?.type === 'campaign' || data?.type === 'integration') {
      priority = 0.9;
      changeFrequency = 'weekly';
    } else if (data?.type === 'comparison') {
      priority = 0.8;
      changeFrequency = 'monthly';
    }

    return {
      url: `${BASE_URL}/${slug}`,
      // Fallback to current date if the SEO data doesn't explicitly declare a modified date
      lastModified: data?.seo?.dateModified ? new Date(data.seo.dateModified) : new Date(),
      changeFrequency,
      priority,
    };
  });

  // 2. Define your core static application routes
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
    }
  ];

  // 3. Merge and return the complete sitemap to Google/Bing
  return [...staticRoutes, ...dynamicRoutes];
}