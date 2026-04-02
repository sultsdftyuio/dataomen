// app/robots.ts
import { MetadataRoute } from 'next';

/**
 * Arcli Global Crawler Configuration
 * * Security & Performance: Prevents search engine bots from wasting compute 
 * resources on authenticated routes and API endpoints. 
 * * SEO Efficiency: Directs 100% of crawl budget to our public semantic silos.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://arcli.tech';

  return {
    rules: {
      // Apply these rules to all web crawlers (Googlebot, Bingbot, etc.)
      userAgent: '*',
      
      // Allow indexing of all public-facing landing and SEO hub pages
      // CRITICAL: Explicitly allow static chunks so Googlebot can render the CSS/JS
      allow: ['/', '/_next/static/'],
      
      // Explicitly block compute-heavy or private routes
      disallow: [
        // Tenant Isolation: Never crawl the internal app
        '/dashboard/',
        
        // Compute Protection: Never crawl API routes (prevents accidental token/DB usage)
        '/api/',
        
        // Auth Flow: Keep search results clean of utility pages
        '/login/',
        '/register/',
        '/forgot-password/',
        
        // Public Shares: Prevent indexing of specific user-shared insights 
        // to maintain data privacy unless explicitly syndicated
        '/share/',
        
        // Next.js Internal Endpoints (Saves compute on optimized images and JSON data)
        '/_next/data/',
        '/_next/image/',
      ],
    },
    // Point crawlers directly to the semantic map we built earlier
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}