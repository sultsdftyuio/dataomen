// scripts/generate-registry.mjs
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

  // Inject the resilient flat-map architecture and helper functions
  const registryLogic = `
const allModules = [
  ${moduleNames.join(',\n  ')}
];

export const SEO_REGISTRY: Record<string, any> = {};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (exportValue && typeof exportValue === 'object' && !Array.isArray(exportValue)) {
      
      // Determine if this is a direct page export or a collection (Record) of pages
      const isSinglePage = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue;

      if (isSinglePage) {
        // It's a single page exported directly
        const slug = exportValue.slug || exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        SEO_REGISTRY[slug] = exportValue;
      } else {
        // It's a collection of pages (e.g. Record<string, SEOPageData>)
        // We need to iterate through the keys (which are the actual URLs/slugs)
        Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
          if (pageData && typeof pageData === 'object' && !Array.isArray(pageData) && ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData)) {
            const slug = pageData.slug || key;
            SEO_REGISTRY[slug] = pageData;
          }
        });
      }
    }
  });
});

export function getNormalizedPage(slug: string): any | null {
  const data = SEO_REGISTRY[slug];
  
  if (!data) return null;

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
    .map((slug) => {
      const page = SEO_REGISTRY[slug];
      if (!page) return null;
      
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
  
  // The corrected logs (no escape characters)
  console.log(`✅ SEO Static Registry generated successfully at: ${OUTPUT_FILE}`);
  console.log(`📦 Tracked ${fileCount} data silos.`);
}

generateRegistry();