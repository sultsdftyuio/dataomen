// scripts/generate-registry.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEO_DIR = path.join(__dirname, '../lib/seo');
const OUTPUT_FILE = path.join(SEO_DIR, 'registry.ts');

// Files in lib/seo/ that are NOT data silos and should never be imported
const EXCLUDED_FILES = new Set([
  'index.tsx',
  'parser.tsx',
  'seo-data.tsx',
  'registry.tsx',
  'registry.ts',
]);

function generateRegistry() {
  console.log('🔍 Scanning SEO silos...\n');

  if (!fs.existsSync(SEO_DIR)) {
    console.error(`❌ SEO directory not found: ${SEO_DIR}`);
    process.exit(1);
  }

  // Sort for deterministic output — prevents noisy diffs when files are added
  const siloFiles = fs.readdirSync(SEO_DIR)
    .filter(f => f.endsWith('.tsx') && !EXCLUDED_FILES.has(f))
    .sort();

  if (siloFiles.length === 0) {
    console.error('❌ No silo files found. Aborting.');
    process.exit(1);
  }

  const moduleNames = siloFiles.map((_, i) => `silo_${i}`);

  const importLines = siloFiles
    .map((file, i) => `import * as silo_${i} from './${file.replace('.tsx', '')}';`)
    .join('\n');

  const header = [
    `// AUTO-GENERATED — DO NOT EDIT DIRECTLY.`,
    `// Regenerate with: node scripts/generate-registry.mjs`,
    `//`,
    `// Silos tracked: ${siloFiles.length}`,
    `// Generated:     ${new Date().toISOString()}`,
    ``,
  ].join('\n');

  const registryLogic = `
const allModules = [
  ${moduleNames.join(',\n  ')}
];

export const SEO_REGISTRY: Record<string, any> = {};

// [CRITICAL FIX] Enterprise Kebab-case: Safely handles acronyms (PredictiveAIAnalytics -> predictive-ai-analytics)
const toKebab = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')         // camelCase -> camel-Case
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')    // XMLHttp -> XML-Http
    .replace(/[\\s_]+/g, '-')                    // spaces/underscores to dashes
    .toLowerCase();
};

allModules.forEach((mod) => {
  Object.entries(mod).forEach(([exportName, exportValue]) => {
    if (!exportValue || typeof exportValue !== 'object' || Array.isArray(exportValue)) return;

    const isV2 = 'path' in exportValue && 'meta' in exportValue && 'blocks' in exportValue;
    // Added 'h1' and 'blocks' to catch previously ignored partial V1 pages
    const isV1Page = 'seo' in exportValue || 'hero' in exportValue || 'type' in exportValue || 'title' in exportValue || 'h1' in exportValue || 'blocks' in exportValue;

    if (isV2) {
      // Preserved full path for Next.js [...slug] Catch-All routing
      const slug = (exportValue as any).path.replace(/^\\//, ''); 
      SEO_REGISTRY[slug] = exportValue;
      return;
    }

    if (isV1Page) {
      // Prevent default exports from hijacking the slug as "/default"
      const fallbackSlug = exportName === 'default' ? 'unnamed-silo' : toKebab(exportName);
      const slug = (exportValue as any).slug || fallbackSlug;
      SEO_REGISTRY[slug] = exportValue;
      return;
    }

    // V1 collection: Record<string, PageData>
    Object.entries(exportValue).forEach(([key, pageData]: [string, any]) => {
      if (!pageData || typeof pageData !== 'object' || Array.isArray(pageData)) return;

      let slug: string;

      if ('path' in pageData && 'meta' in pageData && 'blocks' in pageData) {
        // Preserved full path for Next.js [...slug] Catch-All routing
        slug = (pageData as any).path.replace(/^\\//, '');
      } else if ('seo' in pageData || 'hero' in pageData || 'type' in pageData || 'title' in pageData || 'h1' in pageData || 'blocks' in pageData) {
        // Converts camelCase properties safely using enterprise regex
        slug = (pageData as any).slug || toKebab(key);
      } else {
        return; // Still skips invalid shapes
      }

      SEO_REGISTRY[slug] = pageData;
    });
  });
});

export function getNormalizedPage(slug: string): any | null {
  // Next.js 15+ async params safeguard
  if (!slug || typeof slug !== 'string') return null;

  const cleanSlug = slug.replace(/^\\\//, '').toLowerCase();

  // 1. Exact Match
  let data = SEO_REGISTRY[cleanSlug] ?? SEO_REGISTRY[slug];

  // 2. [CRITICAL FIX] Fuzzy Match (Resolves 404s when AI prepends folders like "seo/")
  if (!data) {
    const registryKeys = Object.keys(SEO_REGISTRY);
    const fuzzyKey = registryKeys.find(key => {
      const lowerKey = key.toLowerCase();
      return lowerKey === cleanSlug || lowerKey === cleanSlug + '-page' || lowerKey.endsWith('/' + cleanSlug); // Catch "seo/predictive-ai-analytics"
    });
    if (fuzzyKey) data = SEO_REGISTRY[fuzzyKey];
  }

  if (!data) return null;

  // V2 (block architecture)
  if (data.blocks && data.meta) {
    const heroBlock = data.blocks.find((b: any) => b?.type === 'Hero' || b?.type === 'HeroBlock');
    // [CRITICAL FIX] Ensure we pull data from either .data or .payload to prevent skeleton pages
    const heroData = heroBlock?.data || heroBlock?.payload || {};
    
    return {
      ...data,
      seo: {
        title:       data.meta.title       || 'Arcli Analytics',
        description: data.meta.description || 'Enterprise Data Platform',
        keywords:    data.meta.keywords    || [],
        h1:          heroData.title || data.meta.title || 'Arcli AI Analytics',
      },
    };
  }

  // V1 (legacy / flat architecture)
  const hero = data.hero ?? {
    title:    data.h1    || data.title || '',
    subtitle: data.subtitle || data.description || '',
    cta: {
      primary: { href: '/login', text: 'Get Started Free' },
    },
  };

  return {
    ...data,
    hero,
    seo: {
      ...data.seo,
      title:       data.seo?.title       || data.title       || 'Arcli Analytics',
      description: data.seo?.description || data.description || 'Enterprise Data Platform',
      h1:          hero.title || hero.h1  || data.seo?.h1    || data.h1
                               || data.seo?.title            || data.title
                               || 'Arcli AI Analytics',
    },
  };
}

export function getAllSlugs(): string[] {
  return Object.keys(SEO_REGISTRY);
}

export function getRelatedPages(slugs: string[]): Array<{ slug: string; title: string; type: string }> {
  // Next.js 15+ array shape safeguard
  if (!Array.isArray(slugs)) return [];

  return slugs
    .map((rawSlug) => {
      if (!rawSlug || typeof rawSlug !== 'string') return null;

      // Preserved full path for related links
      const slug = rawSlug.replace(/^\\//, ''); 
      const page = SEO_REGISTRY[slug] ?? SEO_REGISTRY[rawSlug];
      if (!page) return null;

      if (page.meta && page.blocks) {
        return { slug, title: page.meta.title || slug, type: 'use-case-block' };
      }

      return {
        slug,
        title: page.hero?.title || page.hero?.h1 || page.seo?.h1
             || page.h1 || page.seo?.title || page.title || slug,
        type: page.type || 'template',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default SEO_REGISTRY;
`;

  const output = header + importLines + '\n' + registryLogic;
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

  console.log(`✅ Registry written to: ${OUTPUT_FILE}`);
  console.log(`📦 ${siloFiles.length} silos registered:\n`);
  siloFiles.forEach((f, i) => console.log(`   silo_${i.toString().padStart(2, '0')}  ${f}`));
  console.log('');
}

generateRegistry();