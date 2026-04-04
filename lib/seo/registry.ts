// lib/seo/registry.ts

import { TemplateBlueprint } from './index';

// --- Silo Part Imports: Shopify ---
import * as ShopifySql from './text-to-sql-shopify-1';
import * as ShopifyDash from './templates-shopify-1';

// --- Silo Part Imports: Stripe ---
import * as StripeSql from './text-to-sql-stripe-1';
import * as StripeDash from './templates-stripe-1';

/**
 * STATIC SEO REGISTRY (ARCLI STANDARD)
 * ----------------------------------------------------------------------
 * Deterministic repository mapping stable slug keys to production-ready 
 * TemplateBlueprints.
 * * Logic: [data-source]-[pattern]-[mode/modifier]
 */
export const SEO_REGISTRY: Record<string, TemplateBlueprint> = {
  // --- Shopify Silo ---
  'shopify-ltv-sql': ShopifySql.shopifyLtvSql,
  'shopify-cohort-retention-sql': ShopifySql.shopifyCohortRetentionSql,
  'shopify-rfm-segmentation-sql': ShopifySql.shopifyRfmSegmentationSql,
  
  'shopify-ltv-dashboard': ShopifyDash.shopifyLtvDashboard,
  'shopify-cohort-retention-dashboard': ShopifyDash.shopifyCohortRetentionDashboard,
  'shopify-rfm-dashboard': ShopifyDash.shopifyRfmDashboard,

  // --- Stripe Silo ---
  'stripe-mrr-sql': StripeSql.stripeMrrSql,
  'stripe-churn-rate-sql': StripeSql.stripeChurnRateSql,
  'stripe-ltv-sql': StripeSql.stripeLtvSql,

  'stripe-mrr-dashboard': StripeDash.stripeMrrDashboard,
  'stripe-churn-dashboard': StripeDash.stripeChurnDashboard,
  'stripe-ltv-dashboard': StripeDash.stripeLtvDashboard,
};

/**
 * HEURISTIC DATA RESOLVER (O(1) Lookup)
 * Resolves the raw static template data and applies Tier-1 baseline heuristics.
 * Note: Deep-data normalization (Phase 2) is handled downstream by parser.tsx.
 */
export function getNormalizedPage(slug: string): TemplateBlueprint | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Apply Tier-1 Heuristic Fallbacks 
  // Ensures the H1 cascade always has a valid fallback: hero.h1 > seo.h1 > seo.title
  const normalizedData: TemplateBlueprint = {
    ...data,
    seo: {
      ...data.seo,
      h1: data.hero?.h1 || data.seo?.h1 || data.seo?.title || 'Arcli Template',
    }
  };

  return normalizedData;
}

/**
 * STATIC ORCHESTRATOR
 * Used by `generateStaticParams` in `app/(landing)/[slug]/page.tsx` 
 * to generate all deterministic static pages at build time.
 */
export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

/**
 * SEARCH & DISCOVERY HELPER
 * Facilitates internal linking, silo-depth analysis, and related page clusters.
 * Enforces strict typing to prevent undefined UI renders.
 */
export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  return slugs
    .map((slug) => {
      const page = SEO_REGISTRY[slug];
      if (!page) return null;
      
      return {
        slug,
        title: page.hero?.h1 || page.seo?.h1 || page.seo?.title || slug,
        type: page.type || 'template'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

// Export default to support legacy hydration maps in lib/seo/index.tsx
// Prevents TypeError: modules is not iterable if the manifest crawler hits this file.
export default SEO_REGISTRY;