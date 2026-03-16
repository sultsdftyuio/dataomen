// lib/seo/index.tsx
import React from 'react';

// Modular Silo Imports
import { coreFeatures } from './core-features';
import { textToSqlFeatures } from './text-to-sql';
import { fileAnalysis } from './file-analysis';
import { databaseIntegrations } from './databaseIntegrations';
import { saasIntegrations } from './saas-integrations';
import { competitorComparisons } from './competitorComparisons';
import { howToGuides } from './guides';
import { dashboardTemplates } from './templates';

// --- 1. Type Safety & Interfaces ---

/**
 * Arclis SEO System Configuration Interface.
 * Marked entirely as `readonly` to enforce strict functional immutability 
 * during Next.js static generation and client hydration.
 */
export interface SEOPageData {
  readonly type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly subtitle: string;
  readonly icon: React.ReactElement;
  readonly features: readonly string[];
  readonly steps: readonly { 
    readonly name: string; 
    readonly text: string; 
  }[];
  readonly useCases: readonly { 
    readonly title: string; 
    readonly description: string; 
  }[];
  readonly faqs: readonly { 
    readonly q: string; 
    readonly a: string; 
  }[];
  readonly comparison?: { 
    readonly competitor: string; 
    readonly arcliWins: readonly string[]; // Synchronized with rebranding
    readonly competitorFlaws: readonly string[]; 
  };
  readonly relatedSlugs: readonly string[];
}

// --- 2. Data Aggregation (The Registry) ---

/**
 * Combined SEO Pages - Main Export
 * Merges all modularized category records into a single O(1) lookup object.
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
 * Categorized Export
 * For silo-based internal linking and categorized sitemap generation.
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

// --- 3. High-Performance Selectors & Utilities ---

/**
 * Retrieve metadata for a specific slug with fallback.
 * O(1) time complexity.
 */
export const getPage = (slug: string): SEOPageData | undefined => {
  return seoPages[slug];
};

/**
 * Get all unique page slugs for Next.js static path generation.
 * Used inside `generateStaticParams()`.
 */
export const getAllSlugs = (): string[] => {
  return Object.keys(seoPages);
};

/**
 * Get all pages of a specific type (e.g., all 'comparison' pages).
 * Useful for building dynamic index pages or sidebar navigation.
 */
export const getPagesByType = (type: SEOPageData['type']): Record<string, SEOPageData> => {
  return Object.entries(seoPages).reduce((acc, [slug, page]) => {
    if (page.type === type) {
      acc[slug] = page;
    }
    return acc;
  }, {} as Record<string, SEOPageData>);
};

/**
 * Access pages grouped by their specific programmatic category.
 */
export const getPagesByCategory = (category: SEOCategory): Record<string, SEOPageData> => {
  return seoPagesByCategory[category];
};