// app/robots.ts
import { MetadataRoute } from 'next';

/**
 * Arcli Global Crawler Configuration
 * * Performance: Forced static generation prevents Vercel Serverless cold starts 
 * from triggering Googlebot "unreachable" timeouts.
 * * Security: Prevents search engine bots from wasting compute on API endpoints.
 * * SEO: Directs 100% of crawl budget to our public semantic silos.
 */

// CRITICAL: Instructs the Next.js compiler to prerender this as a static asset.
// This guarantees instant Edge delivery without waking up the Vercel backend.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  // Utilizing the production domain as the unshakeable source of truth.
  const baseUrl = 'https://arcli.tech';

  return {
    rules: {
      // Apply these rules universally to all authorized indexing bots
      userAgent: '*',
      
      // Allow indexing of all public-facing landing and SEO hub pages
      allow: [
        '/', 
        '/_next/static/' // Required for Googlebot to render our JS/CSS architectures
      ],
      
      // Strict Disallow definitions to protect compute and tenant isolation
      disallow: [
        // Tenant Isolation: Never crawl the internal app interfaces
        '/dashboard/',
        
        // Compute Protection: Hard-block APIs to prevent accidental DB usage/token burn
        '/api/',
        
        // Auth Flow: Keep search results mathematically clean of utility states
        '/login/',
        '/register/',
        '/forgot-password/',
        
        // Public Shares: Maintain data privacy for un-syndicated tenant insights
        '/share/',
        
        // Next.js Internals: Save compute on optimized images and raw data blobs
        '/_next/data/',
        '/_next/image/',
      ],
    },
    // Direct crawlers to the optimized XML map for structured discovery
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}