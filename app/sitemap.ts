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
      url: `${SITE_URL}/`,
    },
    {
      url: `${SITE_URL}/security`,
    },
    {
      url: `${SITE_URL}/privacy`,
    },
    {
      url: `${SITE_URL}/privacy/remove`,
    },
    {
      url: `${SITE_URL}/terms`,
    },
    {
      url: `${SITE_URL}/cookies`,
    },
  ];

  const resourcePages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/resources`,
    },
    ...resourceGuides.map((guide) => ({
      url: `${SITE_URL}${guide.path}`,
      lastModified: RESOURCE_LAST_MODIFIED,
    })),
  ];

  return [...staticPages, ...resourcePages];
}
