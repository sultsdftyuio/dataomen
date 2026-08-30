import { MetadataRoute } from 'next';
import { RESOURCE_LAST_MODIFIED, resourceGuides } from '@/lib/seo/resources';
import { SITE_URL } from '@/lib/site';

/**
 * Arcli Deterministic Sitemap
 * Only maps public routes that actually exist, so crawlers do not waste their
 * budget on legacy product pages that return 404.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/security`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy/remove`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/cookies`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const resourcePages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/resources`,
      lastModified: RESOURCE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...resourceGuides.map((guide) => ({
      url: `${SITE_URL}${guide.path}`,
      lastModified: RESOURCE_LAST_MODIFIED,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return [...staticPages, ...resourcePages];
}
