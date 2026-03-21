import React from 'react';

// Master Type Imports from our specialized silos
import { coreFeatures } from './core-features';
import { textToSqlFeatures } from './text-to-sql';
import { fileAnalysis } from './file-analysis';
import { databaseIntegrations } from './databaseIntegrations';
import { saasIntegrations } from './saas-integrations';
import { competitorComparisons } from './competitorComparisons';
import { howToGuides } from './guides';
import { dashboardTemplates, TemplateBlueprint } from './templates';

// --- 1. The Polymorphic Registry System ---

/**
 * Since each SEO silo now has a unique architectural schema (UI design),
 * we define a union type. This fixes the "property missing" errors 
 * and enables Type-Safe component rendering based on the 'type' field.
 */
export type SEOPageData = 
  | typeof coreFeatures[keyof typeof coreFeatures]
  | typeof textToSqlFeatures[keyof typeof textToSqlFeatures]
  | typeof fileAnalysis[keyof typeof fileAnalysis]
  | typeof databaseIntegrations[keyof typeof databaseIntegrations]
  | typeof saasIntegrations[keyof typeof saasIntegrations]
  | typeof competitorComparisons[keyof typeof competitorComparisons]
  | typeof howToGuides[keyof typeof howToGuides]
  | TemplateBlueprint; // Explicitly uses the TemplateBlueprint from templates.tsx

// --- 2. Data Aggregation (The Registry) ---

/**
 * Main Registry lookup.
 * Uses 'any' for the record value only during the merge to prevent 
 * deep-nested inheritance conflicts, but casts back to our Union 
 * for safe consumption in the app.
 */
export const seoPages: Record<string, SEOPageData> = {
  ...coreFeatures,
  ...textToSqlFeatures,
  ...fileAnalysis,
  ...databaseIntegrations,
  ...saasIntegrations,
  ...competitorComparisons,
  ...howToGuides,
  ...dashboardTemplates
} as Record<string, SEOPageData>;

/**
 * Silo-Based Registry.
 * Used for generating the /sitemap.xml and category-specific navigations.
 */
export const seoPagesByCategory = {
  coreFeatures,
  textToSqlFeatures,
  fileAnalysis,
  databaseIntegrations,
  saasIntegrations,
  competitorComparisons,
  howToGuides,
  dashboardTemplates
} as const;

export type SEOCategory = keyof typeof seoPagesByCategory;

// --- 3. High-Performance Selectors ---

/**
 * Retrieve metadata for a specific slug.
 * The calling component should check 'page.type' to decide which UI layout to use.
 */
export const getPage = (slug: string): SEOPageData | undefined => {
  return seoPages[slug];
};

/**
 * Returns all slugs for Next.js Dynamic Routes (generateStaticParams).
 */
export const getAllSlugs = (): string[] => {
  return Object.keys(seoPages);
};

/**
 * Type-Guard Utility.
 * Helps the frontend identify which specific design blueprint is being used.
 */
export function isTemplatePage(page: SEOPageData): page is TemplateBlueprint {
  return page.type === 'template';
}

/**
 * Retrieves all pages belonging to a specific programmatic silo.
 */
export const getPagesByCategory = (category: SEOCategory) => {
  return seoPagesByCategory[category];
};

/**
 * Utility for SEO Internal Linking.
 * Suggests related pages within the same architectural silo to boost domain authority.
 */
export const getRelatedPages = (slugs: string[]): SEOPageData[] => {
  return slugs
    .map(slug => seoPages[slug])
    .filter((page): page is SEOPageData => !!page);
};