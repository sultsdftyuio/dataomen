// scripts/generate-registry.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEO_DIR = path.join(__dirname, '../lib/seo');
const OUTPUT_FILE = path.join(SEO_DIR, 'registry.ts');

/**
 * Phase 1: Pre-build Registry Generator
 * Scans the /lib/seo directory for silo files and compiles a statically
 * analyzable TypeScript registry. This completely eliminates Next.js/Webpack 
 * dynamic require() issues in Vercel production builds.
 */
function generateRegistry() {
  console.log('🔍 Scanning SEO Silos for Static Registry...');
  
  if (!fs.existsSync(SEO_DIR)) {
    console.error(`❌ SEO Directory not found at ${SEO_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SEO_DIR);
  const silos = {};
  
  let importStatements = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.\n`;
  importStatements += `// Run \`npm run lint:seo\` or \`node scripts/generate-registry.mjs\` to update.\n\n`;

  let fileCount = 0;

  files.forEach((file, index) => {
    // Ignore non-tsx files, the index, parser, and pure type files
    if (!file.endsWith('.tsx') || file === 'index.tsx' || file === 'parser.tsx' || file === 'seo-data.tsx') return;

    const baseName = file.replace('.tsx', '');
    
    // Extract base category name (e.g., 'core-features-1' -> 'core-features')
    const match = file.match(/^([a-zA-Z-]+)(?:-\d+)?\.tsx$/);
    if (match) {
      const category = match[1];
      const importName = `silo_${index}`; // Unique alias for static import
      
      importStatements += `import * as ${importName} from './${baseName}';\n`;
      
      if (!silos[category]) {
        silos[category] = [];
      }
      
      silos[category].push(importName);
      fileCount++;
    }
  });

  // Build the exported static registry object
  let exportStatement = `\nexport const seoRegistry: Record<string, any[]> = {\n`;
  for (const [category, modules] of Object.entries(silos)) {
    exportStatement += `  '${category}': [${modules.join(', ')}],\n`;
  }
  exportStatement += `};\n`;

  fs.writeFileSync(OUTPUT_FILE, importStatements + exportStatement);
  console.log(`✅ SEO Static Registry generated successfully at: ${OUTPUT_FILE}`);
  console.log(`📦 Tracked ${fileCount} files across Categories: ${Object.keys(silos).join(', ')}`);
}

generateRegistry();