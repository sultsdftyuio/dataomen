// lib/seo/index.tsx
import React from 'react';

// Import Split Silos - Part 1
import { coreFeaturesPart1 } from './core-features-1';
import { textToSqlFeaturesPart1 } from './text-to-sql-1';
import { fileAnalysisPart1 } from './file-analysis-1';
import { databaseIntegrationsPart1 } from './database-integrations-1';
import { saasIntegrationsPart1 } from './saas-integrations-1';
import { competitorComparisonsPart1 } from './competitor-comparisons-1';
import { howToGuidesPart1 } from './guides-1';
import { dashboardTemplatesPart1, TemplateBlueprint } from './templates-1';

// Import Split Silos - Part 2
import { coreFeaturesPart2 } from './core-features-2';
import { textToSqlFeaturesPart2 } from './text-to-sql-2';
import { fileAnalysisPart2 } from './file-analysis-2';
import { databaseIntegrationsPart2 } from './database-integrations-2';
import { saasIntegrationsPart2 } from './saas-integrations-2';
import { competitorComparisonsPart2 } from './competitor-comparisons-2';
import { howToGuidesPart2 } from './guides-2';
import { dashboardTemplatesPart2 } from './templates-2';

/**
 * High-Performance Merging Utility
 * Merges split SEO modules while maintaining the original object structure.
 */
const allCoreFeatures = { ...coreFeaturesPart1, ...coreFeaturesPart2 };
const allTextToSql = { ...textToSqlFeaturesPart1, ...textToSqlFeaturesPart2 };
const allFileAnalysis = { ...fileAnalysisPart1, ...fileAnalysisPart2 };
const allDatabaseIntegrations = { ...databaseIntegrationsPart1, ...databaseIntegrationsPart2 };
const allSaasIntegrations = { ...saasIntegrationsPart1, ...saasIntegrationsPart2 };
const allCompetitorComparisons = { ...competitorComparisonsPart1, ...competitorComparisonsPart2 };
const allHowToGuides = { ...howToGuidesPart1, ...howToGuidesPart2 };
const allDashboardTemplates = { ...dashboardTemplatesPart1, ...dashboardTemplatesPart2 };

// --- 1. The Polymorphic Registry System ---

/**
 * SEOPageData Union Type
 * Designed to handle the structural variations between Features, Integrations, 
 * Comparisons, and Blueprints. Enables exhaustive type-checking in the UI layer.
 */
export type SEOPageData = 
  | typeof allCoreFeatures[keyof typeof allCoreFeatures]
  | typeof allTextToSql[keyof typeof allTextToSql]
  | typeof allFileAnalysis[keyof typeof allFileAnalysis]
  | typeof allDatabaseIntegrations[keyof typeof allDatabaseIntegrations]
  | typeof allSaasIntegrations[keyof typeof allSaasIntegrations]
  | typeof allCompetitorComparisons[keyof typeof allCompetitorComparisons]
  | typeof allHowToGuides[keyof typeof allHowToGuides]
  | TemplateBlueprint;

// --- 2. Data Aggregation (The Registry) ---

/**
 * Global SEO Registry
 * Optimized for O(1) lookups during Next.js dynamic routing.
 */
export const seoPages: Record<string, SEOPageData> = {
  ...allCoreFeatures,
  ...allTextToSql,
  ...allFileAnalysis,
  ...allDatabaseIntegrations,
  ...allSaasIntegrations,
  ...allCompetitorComparisons,
  ...allHowToGuides,
  ...allDashboardTemplates
} as Record<string, SEOPageData>;

/**
 * Categorized Registry
 * Powers the /sitemap.xml generation and vertical-specific navigation components.
 */
export const seoPagesByCategory = {
  coreFeatures: allCoreFeatures,
  textToSqlFeatures: allTextToSql,
  fileAnalysis: allFileAnalysis,
  databaseIntegrations: allDatabaseIntegrations,
  saasIntegrations: allSaasIntegrations,
  competitorComparisons: allCompetitorComparisons,
  howToGuides: allHowToGuides,
  dashboardTemplates: allDashboardTemplates
} as const;

export type SEOCategory = keyof typeof seoPagesByCategory;

// --- 3. Engineering Excellence Selectors ---

/**
 * Retrieves full metadata for a specific slug.
 * The consuming page component should switch layouts based on page.type.
 */
export const getPage = (slug: string): SEOPageData | undefined => {
  return seoPages[slug];
};

/**
 * Returns all unique slugs for Next.js generateStaticParams().
 */
export const getAllSlugs = (): string[] => {
  return Object.keys(seoPages);
};

/**
 * Type-Guard: Template Identifier
 * Isolates TemplateBlueprint logic from standard SEO page structures.
 */
export function isTemplatePage(page: SEOPageData): page is TemplateBlueprint {
  return page.type === 'template';
}

/**
 * Retrieves all pages belonging to a specific architectural silo.
 */
export const getPagesByCategory = (category: SEOCategory) => {
  return seoPagesByCategory[category];
};

/**
 * Internal Linking Optimizer
 * Returns full page data for a list of slugs, used to build "Related Articles"
 * or "Recommended Blueprints" sections to boost domain authority.
 */
export const getRelatedPages = (slugs: string[]): SEOPageData[] => {
  return slugs
    .map(slug => seoPages[slug])
    .filter((page): page is SEOPageData => !!page);
};

/**
 * Contact/Support Meta
 * Hardcoded for Arcli domain integrity.
 */
export const ARCLI_SUPPORT_EMAIL = 'support@arcli.tech';
export const ARCLI_DOMAIN = 'arcli.tech';