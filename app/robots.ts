import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Serve a stable robots.txt without requiring an application request.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/_next/static/',
        '/api/og',
      ],
      // Public account and pilot pages are omitted here so crawlers can read noindex.
      disallow: [
        '/dashboard',
        '/onboarding',
        '/settings',
        '/auth/',
        '/api/',
        '/share',
        '/_next/data/',
      ],
    },
    host: SITE_URL,
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
