// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Run `npm run lint:seo` or `node scripts/generate-registry.mjs` to update.

import * as silo_0 from './competitor-comparisons-1';
import * as silo_1 from './competitor-comparisons-2';
import * as silo_2 from './core-features-1';
import * as silo_3 from './core-features-2';
import * as silo_4 from './database-integrations-1';
import * as silo_5 from './database-integrations-2';
import * as silo_6 from './file-analysis-1';
import * as silo_7 from './file-analysis-2';
import * as silo_8 from './guides-1';
import * as silo_9 from './guides-2';
import * as silo_11 from './indie-hacker-campaigns';
import * as silo_15 from './saas-integrations-1';
import * as silo_16 from './saas-integrations-2';
import * as silo_17 from './shopify-campaign';
import * as silo_18 from './templates-1';
import * as silo_19 from './templates-2';
import * as silo_20 from './templates-3';
import * as silo_21 from './templates-shopify-1';
import * as silo_22 from './templates-stripe-1';
import * as silo_23 from './text-to-sql-1';
import * as silo_24 from './text-to-sql-2';
import * as silo_25 from './text-to-sql-shopify-1';
import * as silo_26 from './text-to-sql-stripe-1';

const allModules = [
  silo_0,
  silo_1,
  silo_2,
  silo_3,
  silo_4,
  silo_5,
  silo_6,
  silo_7,
  silo_8,
  silo_9,
  silo_11,
  silo_15,
  silo_16,
  silo_17,
  silo_18,
  silo_19,
  silo_20,
  silo_21,
  silo_22,
  silo_23,
  silo_24,
  silo_25,
  silo_26
];

/**
 * STATIC SEO REGISTRY (ARCLI STANDARD)
 * Auto-generated deterministic mapping of stable slug keys to production-ready pages.
 */
export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, pageData]) => {
    if (pageData && typeof pageData === 'object' && !Array.isArray(pageData)) {
      // Derive slug: Prefer explicit pageData.slug if present, otherwise fallback
      // to formatting the export name (e.g. shopifyLtvSql -> shopify-ltv-sql).
      const slug = pageData.slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      SEO_REGISTRY[slug] = pageData;
    }
  });
});

/**
 * HEURISTIC DATA RESOLVER (O(1) Lookup)
 * Resolves the raw static template data and applies Tier-1 baseline heuristics.
 */
export function getNormalizedPage(slug: string): any | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Apply Tier-1 Heuristic Fallbacks 
  // Ensures the H1 cascade always has a valid fallback: hero.h1 > seo.h1 > seo.title
  return {
    ...data,
    seo: {
      ...data.seo,
      h1: data.hero?.h1 || data.seo?.h1 || data.seo?.title || 'Arcli Template',
    }
  };
}

/**
 * STATIC ORCHESTRATOR
 * Used by `generateStaticParams` to generate all deterministic static pages at build time.
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

// Export default to support legacy hydration maps (prevents TypeError on old files)
export default SEO_REGISTRY;
