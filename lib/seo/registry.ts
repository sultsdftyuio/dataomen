// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Run `node scripts/generate-registry.mjs` to update.

import * as silo_0 from './competitor-comparisons-1';
import * as silo_1 from './competitor-comparisons-2';
import * as silo_2 from './compliance-standards-1';
import * as silo_3 from './core-features-1';
import * as silo_4 from './core-features-2';
import * as silo_5 from './database-integrations-1';
import * as silo_6 from './database-integrations-2';
import * as silo_7 from './database-integrations-3';
import * as silo_8 from './file-analysis-1';
import * as silo_9 from './file-analysis-2';
import * as silo_10 from './guides-1';
import * as silo_11 from './guides-2';
import * as silo_13 from './indie-hacker-campaigns';
import * as silo_14 from './industry-verticals-1';
import * as silo_16 from './persona-buyers-1';
import * as silo_17 from './pillar-snowflake-integration';
import * as silo_20 from './saas-integrations-1';
import * as silo_21 from './saas-integrations-2';
import * as silo_22 from './shopify-campaign';
import * as silo_23 from './templates-1';
import * as silo_24 from './templates-2';
import * as silo_25 from './templates-3';
import * as silo_26 from './templates-shopify-1';
import * as silo_27 from './templates-stripe-1';
import * as silo_28 from './text-to-sql-1';
import * as silo_29 from './text-to-sql-2';
import * as silo_30 from './text-to-sql-shopify-1';
import * as silo_31 from './text-to-sql-stripe-1';
import * as silo_32 from './workflow-jtbd-1';

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
  silo_13,
  silo_14,
  silo_16,
  silo_17,
  silo_20,
  silo_21,
  silo_22,
  silo_23,
  silo_24,
  silo_25,
  silo_26,
  silo_27,
  silo_28,
  silo_29,
  silo_30,
  silo_31,
  silo_32
];

export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (exportValue && typeof exportValue === 'object' && !Array.isArray(exportValue)) {
      
      // Determine if this is a direct page export or a collection (Record) of pages
      const isSinglePage = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue;

      if (isSinglePage) {
        // It's a single page exported directly
        const slug = exportValue.slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        SEO_REGISTRY[slug] = exportValue;
      } else {
        // It's a collection of pages (e.g. Record<string, SEOPageData>)
        // We need to iterate through the keys (which are the actual URLs/slugs)
        Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
          if (pageData && typeof pageData === 'object' && !Array.isArray(pageData) && ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData)) {
            const slug = pageData.slug || key;
            SEO_REGISTRY[slug] = pageData;
          }
        });
      }
    }
  });
});

export function getNormalizedPage(slug: string): any | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

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
    .map((slug) => {
      const page = SEO_REGISTRY[slug];
      if (!page) return null;
      
      return {
        slug,
        title: page.hero?.title || page.hero?.h1 || page.seo?.h1 || page.h1 || page.seo?.title || page.title || slug,
        type: page.type || 'template'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default SEO_REGISTRY;
