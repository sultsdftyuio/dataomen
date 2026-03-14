import React from 'react';
import { coreFeatures } from './core-features';
import { textToSqlFeatures } from './text-to-sql';
import { fileAnalysis } from './file-analysis';
import { databaseIntegrations } from './databaseIntegrations';
import { saasIntegrations } from './saas-integrations';
import { competitorComparisons } from './competitorComparisons';
import { howToGuides } from './guides';
import { dashboardTemplates } from './templates';

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
    dataOmenWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

/**
 * Combined SEO Pages - Main Export
 * All pages are organized by category in separate files
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
 * Export by category for easier navigation
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
 */

// Get all pages of a specific type
export const getPagesByType = (type: SEOPageData['type']): Record<string, SEOPageData> => {
  return Object.entries(seoPages)
    .filter(([_, page]) => page.type === type)
    .reduce((acc, [slug, page]) => ({ ...acc, [slug]: page }), {});
};

// Get all page slugs
export const getAllSlugs = (): string[] => Object.keys(seoPages);

// Get a specific page
export const getPage = (slug: string): SEOPageData | undefined => seoPages[slug];

// Get pages by category name
export const getPagesByCategory = (category: keyof typeof seoPagesByCategory): Record<string, SEOPageData> => {
  return seoPagesByCategory[category];
};