import React from 'react';
import { coreFeatures } from './core-features';
import { textToSqlFeatures } from './text-to-sql';
import { fileAnalysis } from './file-analysis';
import { databaseIntegrations } from './databaseIntegrations';
import { saasIntegrations } from './saas-integrations';
import { competitorComparisons } from './competitorComparisons';
import { howToGuides } from './guides';
import { dashboardTemplates } from './templates';

/**
 * Arcli SEO System Configuration
 * This central index aggregates all performance-tuned SEO data into a 
 * single, type-safe registry for the landing page router.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  steps: { name: string; text: string }[];
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  comparison?: { 
    competitor: string; 
    arcliWins: string[]; // Synchronized with rebranding
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

/**
 * Combined SEO Pages - Main Export
 * Merges all modularized category records into a single lookup object.
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
};

/**
 * Export by category for easier navigation and silo-based internal linking.
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
};

/**
 * Utility Functions
 * High-performance accessors for the SEO metadata layer.
 */

// Get all pages of a specific type (e.g., all 'comparison' pages)
export const getPagesByType = (type: SEOPageData['type']): Record<string, SEOPageData> => {
  return Object.entries(seoPages)
    .filter(([_, page]) => page.type === type)
    .reduce((acc, [slug, page]) => ({ ...acc, [slug]: page }), {});
};

// Get all unique page slugs for static path generation
export const getAllSlugs = (): string[] => Object.keys(seoPages);

// Retrieve metadata for a specific slug with fallback
export const getPage = (slug: string): SEOPageData | undefined => seoPages[slug];

// Access pages grouped by their specific category
export const getPagesByCategory = (category: keyof typeof seoPagesByCategory): Record<string, SEOPageData> => {
  return seoPagesByCategory[category];
};