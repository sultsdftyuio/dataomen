// lib/seo/index.tsx
import fs from 'fs';
import path from 'path';

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
  faqs?: { q: string; a: string }[];
  relatedSlugs?: string[];
  [key: string]: any; // Polymorphic catch-all for silo-specific data
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
 * Shared Computation Layer: Hydrates the full SEO registry from the manifest.
 * Evaluates lazily to optimize Next.js server startup and memory chunking.
 */
function hydrateRegistry() {
  if (seoPagesCache) return;

  seoPagesCache = {};
  seoCategoryCache = {};

  try {
    const manifestPath = path.join(process.cwd(), 'lib/seo/registry-manifest.json');
    
    // Controlled Determinism: Fallback safety if the prebuild script hasn't run
    if (!fs.existsSync(manifestPath)) {
      console.warn('⚠️ SEO Registry Manifest not found. Run generate-registry.mjs pre-build.');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    for (const [category, files] of Object.entries(manifest.silos)) {
      seoCategoryCache[category] = {};
      
      for (const file of files as string[]) {
        // Note for Next.js: For full production build environments where tsx isn't 
        // compiled dynamically, ensure Webpack/Turbopack is configured to trace these, 
        // or configure the pre-build script to generate an index.js map instead.
        try {
            // FIXED FOR TURBOPACK: Use a localized, statically analyzable path template 
            // instead of path.join so the bundler correctly maps the lib/seo directory.
            const cleanFileName = file.replace('./', '').replace('.tsx', '');
            const mod = require('./' + cleanFileName + '.tsx');
            
            // Dynamically extract the exported data object (e.g., coreFeaturesPart1)
            const exportedDataKey = Object.keys(mod).find(key => key !== 'default');
            if (exportedDataKey && mod[exportedDataKey]) {
              const data = mod[exportedDataKey];
              
              seoCategoryCache[category] = { ...seoCategoryCache[category], ...data };
              seoPagesCache = { ...seoPagesCache, ...data };
            }
        } catch (loadError) {
            console.error(`Failed to dynamic-load SEO module: ${file}`);
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