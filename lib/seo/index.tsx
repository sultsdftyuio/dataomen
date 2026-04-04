// lib/seo/index.tsx

// --- Static Import Layer ---
// Using the statically generated registry instead of dynamic fs/require
// to guarantee 100% compatibility with Next.js/Turbopack serverless builds.
import { seoRegistry } from './registry';

// --- 1. The Polymorphic Type Definition System ---
// Decoupled from static imports to ensure exhaustive type-checking in the UI layer
// without requiring all massive silos to be loaded into memory synchronously.

export interface BaseSEOPageData {
  type: 'guide' | 'comparison' | 'integration' | 'feature' | 'template' | 'campaign' | 'default';
  seo: {
    title: string;
    description: string;
    h1: string;
    datePublished?: string;
    dateModified?: string;
    // Added to support advanced SEO template architectures
    canonicalDomain?: string; 
    keywords?: string[];
    intent?: 'template' | 'guide' | 'comparison' | string;
    [key: string]: any; // Allows future nested meta extensions
  };
  hero: any; // Note: Can be strictly typed to a specific Hero interface
  demo?: any;
  personas?: any;
  matrix?: any;
  workflow?: any;
  useCases?: any;
  steps?: any;
  features?: any;
  architecture?: any;
  faqs?: { 
    q: string; 
    a: string; 
    persona?: string; // Added for persona-driven targeted FAQs 
    [key: string]: any; 
  }[];
  relatedSlugs?: string[];
  [key: string]: any; // Polymorphic catch-all for silo-specific root data (e.g., assets, technicalStack)
}

export interface TemplateBlueprint extends BaseSEOPageData {
  type: 'template';
  // Add template-specific structural overrides here if necessary
}

export type SEOPageData = BaseSEOPageData | TemplateBlueprint;

// --- 2. Centralized Registry Manifest Loading ---

let seoPagesCache: Record<string, SEOPageData> | null = null;
let seoCategoryCache: Record<string, Record<string, SEOPageData>> | null = null;

/**
 * Shared Computation Layer: Hydrates the full SEO registry from the static map.
 * Evaluates lazily to optimize Next.js server startup and memory chunking.
 * Statically traceable by Webpack/Turbopack.
 */
function hydrateRegistry() {
  if (seoPagesCache) return;

  seoPagesCache = {};
  seoCategoryCache = {};

  try {
    if (!seoRegistry) {
      console.warn('⚠️ Static SEO Registry not found. Ensure generate-registry.mjs ran successfully.');
      return;
    }
    
    // Loop through the statically mapped categories and modules
    for (const [category, modules] of Object.entries(seoRegistry)) {
      seoCategoryCache[category] = {};
      
      for (const mod of modules as any[]) {
        try {
            // Dynamically extract the exported data object (e.g., coreFeaturesPart1)
            // from the statically imported module.
            const exportedDataKey = Object.keys(mod).find(key => key !== 'default');
            
            if (exportedDataKey && mod[exportedDataKey]) {
              const data = mod[exportedDataKey];
              
              seoCategoryCache[category] = { ...seoCategoryCache[category], ...data };
              seoPagesCache = { ...seoPagesCache, ...data };
            }
        } catch (loadError) {
            console.error(`Failed to map SEO module data in category: ${category}`);
        }
      }
    }
  } catch (error) {
    console.error('Error hydrating SEO Registry:', error);
    seoPagesCache = {};
    seoCategoryCache = {};
  }
}

export type SEOCategory = string;

// --- 3. Engineering Excellence Selectors (O(1) Lookups) ---

/**
 * Retrieves full metadata for a specific slug.
 */
export const getPage = (slug: string): SEOPageData | undefined => {
  hydrateRegistry();
  return seoPagesCache?.[slug];
};

/**
 * Returns all unique slugs for Next.js generateStaticParams().
 */
export const getAllSlugs = (): string[] => {
  hydrateRegistry();
  return Object.keys(seoPagesCache || {});
};

/**
 * Type-Guard: Template Identifier
 */
export function isTemplatePage(page: SEOPageData): page is TemplateBlueprint {
  return page.type === 'template';
}

/**
 * Retrieves all pages belonging to a specific architectural silo.
 */
export const getPagesByCategory = (category: SEOCategory): Record<string, SEOPageData> => {
  hydrateRegistry();
  return seoCategoryCache?.[category] || {};
};

/**
 * Internal Linking Optimizer
 * Returns full page data for a list of slugs, used to build "Related Articles".
 */
export const getRelatedPages = (slugs: string[]): SEOPageData[] => {
  hydrateRegistry();
  return slugs
    .map(slug => seoPagesCache?.[slug])
    .filter((page): page is SEOPageData => !!page);
};

// --- 4. Arcli Constants ---

export const ARCLI_SUPPORT_EMAIL = 'support@arcli.tech';
export const ARCLI_DOMAIN = 'arcli.tech';