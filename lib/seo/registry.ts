// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Run `node scripts/generate-registry.mjs` to update.

import * as silo_0 from './ab-testing-diagnostics';
import * as silo_1 from './ai-agents-anomaly-detection';
import * as silo_2 from './blended-roas-analytics';
import * as silo_3 from './competitor-comparisons-1';
import * as silo_4 from './competitor-comparisons-2';
import * as silo_5 from './compliance-standards-1';
import * as silo_6 from './core-features-1';
import * as silo_7 from './core-features-2';
import * as silo_8 from './database-integrations-1';
import * as silo_9 from './database-integrations-2';
import * as silo_10 from './database-integrations-3';
import * as silo_11 from './file-analysis-1';
import * as silo_12 from './file-analysis-2';
import * as silo_13 from './guides-1';
import * as silo_14 from './guides-2';
import * as silo_16 from './indie-hacker-campaigns';
import * as silo_17 from './industry-verticals-1';
import * as silo_18 from './multi-tenant-analytics-security';
import * as silo_20 from './persona-buyers-1';
import * as silo_21 from './pillar-snowflake-integration';
import * as silo_24 from './saas-integrations-1';
import * as silo_25 from './saas-integrations-2';
import * as silo_26 from './sales-pipeline-velocity';
import * as silo_27 from './semantic-metric-governance';
import * as silo_28 from './shopify-campaign';
import * as silo_29 from './templates-1';
import * as silo_30 from './templates-2';
import * as silo_31 from './templates-3';
import * as silo_32 from './templates-shopify-1';
import * as silo_33 from './templates-stripe-1';
import * as silo_34 from './text-to-sql-1';
import * as silo_35 from './text-to-sql-2';
import * as silo_36 from './text-to-sql-shopify-1';
import * as silo_37 from './text-to-sql-stripe-1';
import * as silo_38 from './workflow-jtbd-1';
import * as silo_39 from './zendesk-support-analytics';

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
  silo_10,
  silo_11,
  silo_12,
  silo_13,
  silo_14,
  silo_16,
  silo_17,
  silo_18,
  silo_20,
  silo_21,
  silo_24,
  silo_25,
  silo_26,
  silo_27,
  silo_28,
  silo_29,
  silo_30,
  silo_31,
  silo_32,
  silo_33,
  silo_34,
  silo_35,
  silo_36,
  silo_37,
  silo_38,
  silo_39
];

export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (exportValue && typeof exportValue === 'object' && !Array.isArray(exportValue)) {
      
      // V2 Schema Detection (Arcli Enterprise Block Architecture)
      const isV2Schema = 'path' in exportValue && 'meta' in exportValue && 'blocks' in exportValue;

      // V1 Schema Detection (Legacy Landing Architecture)
      const isV1SinglePage = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue;

      if (isV2Schema) {
        // Strip leading slash from path to create the router slug (e.g., "/use-cases/x" -> "use-cases/x")
        const slug = (exportValue as any).path.replace(/^\//, '');
        SEO_REGISTRY[slug] = exportValue;
      } else if (isV1SinglePage) {
        // Legacy single page exported directly
        const slug = (exportValue as any).slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        SEO_REGISTRY[slug] = exportValue;
      } else {
        // Legacy collection of pages (Record<string, SEOPageData>)
        Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
          if (pageData && typeof pageData === 'object' && !Array.isArray(pageData)) {
            // Check if nested page is V2
            if ('path' in pageData && 'meta' in pageData && 'blocks' in pageData) {
               const slug = pageData.path.replace(/^\//, '');
               SEO_REGISTRY[slug] = pageData;
            } 
            // Check if nested page is V1
            else if ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData) {
              const slug = pageData.slug || key;
              SEO_REGISTRY[slug] = pageData;
            }
          }
        });
      }
    }
  });
});

/**
 * Normalizes both V1 and V2 architectures into a predictable format 
 * so the Next.js page renderer doesn't crash on differing schemas.
 */
export function getNormalizedPage(slug: string): any | null {
  // Try exact match or exact match minus leading slash
  const cleanSlug = slug.replace(/^\//, '');
  const data = SEO_REGISTRY[cleanSlug] || SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Normalize V2 (Block Architecture) 
  if (data.blocks && data.meta) {
    // Attempt to extract H1 from Hero block payload if it exists
    const heroBlock = data.blocks.find((b: any) => b.type === 'Hero');
    
    return {
      ...data,
      seo: {
        title: data.meta.title || 'Arcli Analytics',
        description: data.meta.description || 'Enterprise Data Platform',
        keywords: data.meta.keywords || [],
        h1: heroBlock?.payload?.title || data.meta.title || 'Arcli AI Analytics',
      }
    };
  }

  // Normalize V1 (Legacy Architecture)
  return {
    ...data,
    seo: {
      ...data.seo,
      title: data.seo?.title || data.title || 'Arcli Analytics',
      description: data.seo?.description || data.description || 'Enterprise Data Platform',
      h1: data.hero?.title || data.hero?.h1 || data.seo?.h1 || data.h1 || data.seo?.title || data.title || 'Arcli AI Analytics',
    }
  };
}

export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  return slugs
    .map((rawSlug) => {
      const slug = rawSlug.replace(/^\//, '');
      const page = SEO_REGISTRY[slug] || SEO_REGISTRY[rawSlug];
      if (!page) return null;
      
      // Handle V2 Schema
      if (page.meta && page.blocks) {
        return {
          slug,
          title: page.meta.title || slug,
          type: 'use-case-block'
        }
      }

      // Handle V1 Schema
      return {
        slug,
        title: page.hero?.title || page.hero?.h1 || page.seo?.h1 || page.h1 || page.seo?.title || page.title || slug,
        type: page.type || 'template'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default SEO_REGISTRY;
