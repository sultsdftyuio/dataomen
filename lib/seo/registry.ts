// AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Regenerate with: node scripts/generate-registry.mjs
//
// Silos tracked: 36
// Generated:     2026-04-08T19:11:38.594Z
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
import * as silo_15 from './indie-hacker-campaigns';
import * as silo_16 from './industry-verticals-1';
import * as silo_17 from './multi-tenant-analytics-security';
import * as silo_18 from './persona-buyers-1';
import * as silo_19 from './pillar-snowflake-integration';
import * as silo_20 from './saas-integrations-1';
import * as silo_21 from './saas-integrations-2';
import * as silo_22 from './sales-pipeline-velocity';
import * as silo_23 from './semantic-metric-governance';
import * as silo_24 from './shopify-campaign';
import * as silo_25 from './templates-1';
import * as silo_26 from './templates-2';
import * as silo_27 from './templates-3';
import * as silo_28 from './templates-shopify-1';
import * as silo_29 from './templates-stripe-1';
import * as silo_30 from './text-to-sql-1';
import * as silo_31 from './text-to-sql-2';
import * as silo_32 from './text-to-sql-shopify-1';
import * as silo_33 from './text-to-sql-stripe-1';
import * as silo_34 from './workflow-jtbd-1';
import * as silo_35 from './zendesk-support-analytics';

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
  silo_26,
  silo_27,
  silo_28,
  silo_29,
  silo_30,
  silo_31,
  silo_32,
  silo_33,
  silo_34,
  silo_35
];

export const SEO_REGISTRY: Record<string, any> = {};

// [FIX] Helper to ensure safe URL formatting
const toKebab = (str: string) => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (!exportValue || typeof exportValue !== 'object' || Array.isArray(exportValue)) return;

    const isV2 = 'path' in exportValue && 'meta' in exportValue && 'blocks' in exportValue;
    // [FIX] Added 'h1' and 'blocks' to catch previously ignored partial V1 pages
    const isV1Page = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue || 'h1' in exportValue || 'blocks' in exportValue;

    if (isV2) {
      const fullPath = (exportValue as any).path.replace(/^\//, '');
      const slug = fullPath.split('/').pop() || fullPath; 
      SEO_REGISTRY[slug] = exportValue;
      return;
    }

    if (isV1Page) {
      // [FIX] Prevent default exports from hijacking the slug as "/default"
      const fallbackSlug = exportName === 'default' ? 'unnamed-silo' : toKebab(exportName);
      const slug = (exportValue as any).slug || fallbackSlug;
      SEO_REGISTRY[slug] = exportValue;
      return;
    }

    // V1 collection: Record<string, PageData>
    Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
      if (!pageData || typeof pageData !== 'object' || Array.isArray(pageData)) return;

      let slug: string;

      if ('path' in pageData && 'meta' in pageData && 'blocks' in pageData) {
        const fullPath = (pageData as any).path.replace(/^\//, '');
        slug = fullPath.split('/').pop() || fullPath; 
      } else if ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData || 'h1' in pageData || 'blocks' in pageData) {
        // [CRITICAL FIX] Converts camelCase properties (e.g., predictiveAnalytics -> predictive-analytics)
        slug = (pageData as any).slug || toKebab(key);
      } else {
        return; // Still skips invalid shapes
      }

      SEO_REGISTRY[slug] = pageData;
    });
  });
});

export function getNormalizedPage(slug: string): any | null {
  // [CRITICAL FIX] Next.js 15+ async params safeguard
  // Prevents crash when slug evaluates to undefined from un-awaited Promises
  if (!slug || typeof slug !== 'string') return null;

  const cleanSlug = slug.replace(/^\//, '');
  const data = SEO_REGISTRY[cleanSlug] ?? SEO_REGISTRY[slug];
  if (!data) return null;

  // V2 (block architecture)
  if (data.blocks && data.meta) {
    // [FIX] Defensive chaining added: `b?.type` instead of `b.type`
    const heroBlock = data.blocks.find((b: any) => b?.type === 'Hero');
    return {
      ...data,
      seo: {
        title:       data.meta.title       || 'Arcli Analytics',
        description: data.meta.description || 'Enterprise Data Platform',
        keywords:    data.meta.keywords    || [],
        h1:          heroBlock?.payload?.title || data.meta.title || 'Arcli AI Analytics',
      },
    };
  }

  // V1 (legacy / flat architecture)
  // Synthesize 'hero' from flat fields when absent (competitor-comparison schema).
  // Without this, Hero component crashes: "Cannot read properties of undefined (reading 'subtitle')"
  const hero = data.hero ?? {
    title:    data.h1    || data.title || '',
    subtitle: data.subtitle || data.description || '',
    cta: {
      primary: { href: '/login', text: 'Get Started Free' },
    },
  };

  return {
    ...data,
    hero,
    seo: {
      ...data.seo,
      title:       data.seo?.title       || data.title       || 'Arcli Analytics',
      description: data.seo?.description || data.description || 'Enterprise Data Platform',
      h1:          hero.title || hero.h1  || data.seo?.h1    || data.h1
                               || data.seo?.title            || data.title
                               || 'Arcli AI Analytics',
    },
  };
}

export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  // [CRITICAL FIX] Next.js 15+ array shape safeguard
  if (!Array.isArray(slugs)) return [];

  return slugs
    .map((rawSlug) => {
      // [CRITICAL FIX] Ensure string evaluation before replace() execution
      if (!rawSlug || typeof rawSlug !== 'string') return null;

      const slug = rawSlug.replace(/^\//, '').split('/').pop() || rawSlug; // Flatten here too for relations
      const page = SEO_REGISTRY[slug] ?? SEO_REGISTRY[rawSlug];
      if (!page) return null;

      if (page.meta && page.blocks) {
        return { slug, title: page.meta.title || slug, type: 'use-case-block' };
      }

      return {
        slug,
        title: page.hero?.title || page.hero?.h1 || page.seo?.h1
             || page.h1 || page.seo?.title || page.title || slug,
        type: page.type || 'template',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default SEO_REGISTRY;
