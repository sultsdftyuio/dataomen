// scripts/generate-registry.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEO_DIR = path.join(__dirname, '../lib/seo');
const OUTPUT_FILE = path.join(SEO_DIR, 'registry.ts');

/**
 * Phase 1: Pre-build Registry Generator (ARCLI V2)
 * Scans the /lib/seo directory for silo files and compiles a statically
 * analyzable TypeScript registry. This generates a flat O(1) lookup map 
 * to completely eliminate Next.js/Webpack hydration crashes in Vercel.
 */
function generateRegistry() {
  console.log('🔍 Scanning SEO Silos for Static Registry...');
  
  if (!fs.existsSync(SEO_DIR)) {
    console.error(`❌ SEO Directory not found at ${SEO_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SEO_DIR);
  
  let importStatements = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.\n`;
  importStatements += `// Run \`node scripts/generate-registry.mjs\` to update.\n\n`;

  let fileCount = 0;
  const moduleNames = [];

  files.forEach((file, index) => {
    // Ignore non-tsx files and core utility/index files
    if (
      !file.endsWith('.tsx') || 
      file === 'index.tsx' || 
      file === 'parser.tsx' || 
      file === 'seo-data.tsx' ||
      file === 'registry.tsx' ||
      file === 'registry.ts'
    ) return;

    const baseName = file.replace('.tsx', '');
    // Use an index-based alias to prevent invalid JS variable names from dashed filenames
    const importName = `silo_${index}`; 
      
    importStatements += `import * as ${importName} from './${baseName}';\n`;
    moduleNames.push(importName);
    fileCount++;
  });

  // Inject the resilient flat-map architecture and helper functions
  const registryLogic = `
const allModules = [
  ${moduleNames.join(',\n  ')}
];

/**
 * STATIC SEO REGISTRY (ARCLI STANDARD)
 * Auto-generated deterministic mapping of stable slug keys to production-ready pages.
 */
export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, pageData]) => {
    if (pageData && typeof pageData === 'object' && !Array.isArray(pageData) && pageData.type) {
      
      let slug = '';

      // 1. Intelligent Canonical Slug Extraction
      // Maps 'https://arcli.tech/industries/healthcare' -> 'healthcare' 
      // This ensures exact compatibility with Next.js app/(landing)/[slug] router.
      if (pageData.seo?.canonicalDomain) {
        try {
          const url = new URL(pageData.seo.canonicalDomain);
          const segments = url.pathname.split('/').filter(Boolean);
          if (segments.length > 0) {
            slug = segments[segments.length - 1];
          }
        } catch (e) {
          // Silent fallback if URL parsing fails
        }
      }

      // 2. Fallback: Kebab-case the export name (e.g. healthcareIndustry -> healthcare-industry)
      if (!slug) {
        slug = pageData.slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      }

      SEO_REGISTRY[slug] = pageData;
    }
  });
});

/**
 * HEURISTIC DATA RESOLVER (O(1) Lookup)
 * Resolves the raw static template data and applies Tier-1 baseline heuristics.
 */
export function getNormalizedPage(slug: string): any | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Apply Tier-1 Heuristic Fallbacks 
  // Ensures the H1 cascade always has a valid fallback
  return {
    ...data,
    seo: {
      ...data.seo,
      h1: data.hero?.title || data.seo?.h1 || data.seo?.title || 'Arcli AI Analytics',
    }
  };
}

/**
 * STATIC ORCHESTRATOR
 * Used by \`generateStaticParams\` to generate all deterministic static pages at build time.
 */
export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

/**
 * SEARCH & DISCOVERY HELPER
 * Facilitates internal linking, silo-depth analysis, and related page clusters.
 * Enforces strict typing to prevent undefined UI renders.
 */
export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  return slugs
    .map((slug) => {
      const page = SEO_REGISTRY[slug];
      if (!page) return null;
      
      return {
        slug,
        title: page.hero?.title || page.seo?.h1 || page.seo?.title || slug,
        type: page.type || 'template'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

// Export default to support legacy hydration maps
export default SEO_REGISTRY;
`;

  fs.writeFileSync(OUTPUT_FILE, importStatements + registryLogic);
  console.log(`✅ SEO Static Registry generated successfully at: ${OUTPUT_FILE}`);
  console.log(`📦 Tracked ${fileCount} data silos and automatically flattened their exports into SEO_REGISTRY.`);
}

generateRegistry();