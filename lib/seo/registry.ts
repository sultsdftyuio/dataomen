// lib/seo/registry.ts

import { TemplateBlueprint } from './index';

// --- Silo Part Imports: Shopify ---
import * as ShopifySql from './text-to-sql-shopify-1';
import * as ShopifyDash from './templates-shopify-1';

// --- Silo Part Imports: Stripe ---
import * as StripeSql from './text-to-sql-stripe-1';
import * as StripeDash from './templates-stripe-1';

/**
 * DETERMINISTIC REPOSITORY MAPPING
 * Maps stable slug keys to production-ready TemplateBlueprints.
 * Logic: [data-source]-[pattern]-[mode/modifier]
 */
const SEO_REGISTRY: Record<string, TemplateBlueprint> = {
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
 * HEURISTIC DATA RESOLVER
 * Sections: 2.2 Normalization & 3.2 Shared Computation
 */
export function getNormalizedPage(slug: string): TemplateBlueprint | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Apply Heuristic Fallbacks (Section 2.2)
  // Ensures p.hero.h1 > p.seo.h1 > p.seo.title
  const normalizedData = {
    ...data,
    seo: {
      ...data.seo,
      h1: data.hero?.h1 || data.seo.h1 || data.seo.title,
    }
  };

  return normalizedData;
}

/**
 * STATIC ORCHESTRATOR
 * Used by generateStaticParams in app/(landing)/[slug]/page.tsx
 */
export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

/**
 * SEARCH & DISCOVERY HELPER
 * Facilitates internal linking and silo-depth analysis.
 */
export function getRelatedPages(slugs: string[]) {
  return slugs
    .map(slug => {
      const page = SEO_REGISTRY[slug];
      if (!page) return null;
      return {
        slug,
        title: page.seo.h1 || page.seo.title,
        type: page.type
      };
    })
    .filter(Boolean);
}