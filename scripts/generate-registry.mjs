import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEO_DIR = path.join(__dirname, '../lib/seo');
const OUTPUT_FILE = path.join(SEO_DIR, 'registry.ts');

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
    // Ignore non-tsx files and core utility files
    if (
      !file.endsWith('.tsx') || 
      file === 'index.tsx' || 
      file === 'parser.tsx' || 
      file === 'seo-data.tsx' ||
      file === 'registry.tsx' ||
      file === 'registry.ts'
    ) return;

    const baseName = file.replace('.tsx', '');
    const importName = `silo_${index}`; 
      
    importStatements += `import * as ${importName} from './${baseName}';\n`;
    moduleNames.push(importName);
    fileCount++;
  });

  // Inject the resilient flat-map architecture with V1 & V2 schema support
  const registryLogic = `
const allModules = [
  ${moduleNames.join(',\n  ')}
];

export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (exportValue && typeof exportValue === 'object' && !Array.isArray(exportValue)) {
      
      // V2 Schema Detection (Arcli Enterprise Block Architecture)
      const isV2Schema = 'path' in exportValue && 'meta' in exportValue && 'blocks' in exportValue;

      // V1 Schema Detection (Legacy Landing Architecture)
      const isV1SinglePage = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue;

      if (isV2Schema) {
        // Strip leading slash from path to create the router slug (e.g., "/use-cases/x" -> "use-cases/x")
        const slug = (exportValue as any).path.replace(/^\\//, '');
        SEO_REGISTRY[slug] = exportValue;
      } else if (isV1SinglePage) {
        // Legacy single page exported directly
        const slug = (exportValue as any).slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        SEO_REGISTRY[slug] = exportValue;
      } else {
        // Legacy collection of pages (Record<string, SEOPageData>)
        Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
          if (pageData && typeof pageData === 'object' && !Array.isArray(pageData)) {
            // Check if nested page is V2
            if ('path' in pageData && 'meta' in pageData && 'blocks' in pageData) {
               const slug = pageData.path.replace(/^\\//, '');
               SEO_REGISTRY[slug] = pageData;
            } 
            // Check if nested page is V1
            else if ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData) {
              const slug = pageData.slug || key;
              SEO_REGISTRY[slug] = pageData;
            }
          }
        });
      }
    }
  });
});

/**
 * Normalizes both V1 and V2 architectures into a predictable format 
 * so the Next.js page renderer doesn't crash on differing schemas.
 */
export function getNormalizedPage(slug: string): any | null {
  // Try exact match or exact match minus leading slash
  const cleanSlug = slug.replace(/^\\//, '');
  const data = SEO_REGISTRY[cleanSlug] || SEO_REGISTRY[slug];
  
  if (!data) return null;

  // Normalize V2 (Block Architecture) 
  if (data.blocks && data.meta) {
    // Attempt to extract H1 from Hero block payload if it exists
    const heroBlock = data.blocks.find((b: any) => b.type === 'Hero');
    
    return {
      ...data,
      seo: {
        title: data.meta.title || 'Arcli Analytics',
        description: data.meta.description || 'Enterprise Data Platform',
        keywords: data.meta.keywords || [],
        h1: heroBlock?.payload?.title || data.meta.title || 'Arcli AI Analytics',
      }
    };
  }

  // Normalize V1 (Legacy Architecture)
  return {
    ...data,
    seo: {
      ...data.seo,
      title: data.seo?.title || data.title || 'Arcli Analytics',
      description: data.seo?.description || data.description || 'Enterprise Data Platform',
      h1: data.hero?.title || data.hero?.h1 || data.seo?.h1 || data.h1 || data.seo?.title || data.title || 'Arcli AI Analytics',
    }
  };
}

export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  return slugs
    .map((rawSlug) => {
      const slug = rawSlug.replace(/^\\//, '');
      const page = SEO_REGISTRY[slug] || SEO_REGISTRY[rawSlug];
      if (!page) return null;
      
      // Handle V2 Schema
      if (page.meta && page.blocks) {
        return {
          slug,
          title: page.meta.title || slug,
          type: 'use-case-block'
        }
      }

      // Handle V1 Schema
      return {
        slug,
        title: page.hero?.title || page.hero?.h1 || page.seo?.h1 || page.h1 || page.seo?.title || page.title || slug,
        type: page.type || 'template'
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default SEO_REGISTRY;
`;

  fs.writeFileSync(OUTPUT_FILE, importStatements + registryLogic);
  
  console.log(`✅ SEO Static Registry generated successfully at: ${OUTPUT_FILE}`);
  console.log(`📦 Tracked ${fileCount} data silos.`);
}

generateRegistry();