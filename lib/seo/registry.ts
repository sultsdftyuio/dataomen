// AUTO-GENERATED — DO NOT EDIT DIRECTLY.
// Regenerate with: node scripts/generate-registry.mjs
//
// Silos tracked: 36
// Generated:     2026-04-13T15:20:11.043Z
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

// [CRITICAL FIX] Enterprise Kebab-case: Safely handles acronyms (PredictiveAIAnalytics -> predictive-ai-analytics)
const toKebab = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')         // camelCase -> camel-Case
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')    // XMLHttp -> XML-Http
    .replace(/[\s_]+/g, '-')                    // spaces/underscores to dashes
    .toLowerCase();
};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (!exportValue || typeof exportValue !== 'object') return;

    // 1. Safely handle pages exported within Arrays
    if (Array.isArray(exportValue)) {
      exportValue.forEach((pageData, idx) => {
        if (!pageData || typeof pageData !== 'object') return;
        const pathStr = (pageData as any).path || (pageData as any).slug || '';
        const slug = pathStr.replace(/^\//, '').split('/').pop() || `${toKebab(exportName)}-${idx}`;
        if ((pageData as any).blocks || (pageData as any).seo || (pageData as any).hero || (pageData as any).h1) {
          SEO_REGISTRY[slug] = pageData;
        }
      });
      return;
    }

    const isV2 = ('blocks' in exportValue) && ('meta' in exportValue || 'path' in exportValue);
    const isV1Page = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue || 'h1' in exportValue || 'blocks' in exportValue;

    // 2. Safely map direct objects using path fallbacks
    if (isV2 || isV1Page) {
      let slug = (exportValue as any).slug;
      if (!slug && (exportValue as any).path) {
        slug = (exportValue as any).path.replace(/^\//, '').split('/').pop();
      }
      if (!slug) {
        slug = exportName === 'default' ? 'unnamed-silo' : toKebab(exportName);
      }
      SEO_REGISTRY[slug] = exportValue;
      return;
    }

    // 3. Fallback for object collections Map<string, PageData>
    Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
      if (!pageData || typeof pageData !== 'object' || Array.isArray(pageData)) return;

      let slug = pageData.slug;
      if (!slug && pageData.path) {
        slug = pageData.path.replace(/^\//, '').split('/').pop();
      }
      if (!slug) {
        slug = toKebab(key);
      }
      if (pageData.blocks || pageData.seo || pageData.hero || pageData.type || pageData.title || pageData.h1) {
        SEO_REGISTRY[slug] = pageData;
      }
    });
  });
});

export function getNormalizedPage(slug: string): any | null {
  if (!slug || typeof slug !== 'string') return null;

  const cleanSlug = slug.replace(/^\//, '');
  const data = SEO_REGISTRY[cleanSlug] ?? SEO_REGISTRY[slug];
  if (!data) return null;

  // V2 (block architecture)
  if (data.blocks && (data.meta || data.seo)) {
    const heroBlock = data.blocks.find((b: any) => b?.type === 'Hero' || b?.type === 'HeroBlock');
    const heroData = heroBlock?.payload || heroBlock?.data || {};

    return {
      ...data,
      seo: {
        title:       data.meta?.title       || data.seo?.title       || 'Arcli Analytics',
        description: data.meta?.description || data.seo?.description || 'Enterprise Data Platform',
        keywords:    data.meta?.keywords    || data.seo?.keywords    || [],
        h1:          heroData.h1 || heroData.headline || heroData.title || data.meta?.title || 'Arcli AI Analytics',
      },
    };
  }

  const hero = data.hero ?? {
    title:    data.h1    || data.title || '',
    subtitle: data.subtitle || data.description || '',
    cta: { primary: { href: '/login', text: 'Get Started Free' } },
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
  // Next.js 15+ array shape safeguard
  if (!Array.isArray(slugs)) return [];

  return slugs
    .map((rawSlug) => {
      if (!rawSlug || typeof rawSlug !== 'string') return null;

      // Preserved full path for related links
      const slug = rawSlug.replace(/^\//, ''); 
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
