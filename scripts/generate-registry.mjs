// scripts/generate-registry.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEO_DIR = path.join(__dirname, '../lib/seo');
const OUTPUT_FILE = path.join(SEO_DIR, 'registry-manifest.json');

/**
 * Phase 1: Pre-build Registry Generator
 * Scans the /lib/seo directory for silo files and compiles a lightweight
 * mapping of categories and parts to their respective file paths.
 * This powers dynamic imports and prevents loading all silos into memory.
 */
function generateRegistry() {
  console.log('🔍 Scanning SEO Silos...');
  
  const files = fs.readdirSync(SEO_DIR);
  const manifest = {
    generatedAt: new Date().toISOString(),
    silos: {}
  };

  files.forEach(file => {
    // Ignore non-tsx files, the index, parser, and pure type files
    if (!file.endsWith('.tsx') || file === 'index.tsx' || file === 'parser.tsx' || file === 'seo-data.tsx') return;

    const filePath = `./${file.replace('.tsx', '')}`;
    
    // Extract base category name (e.g., 'core-features-1' -> 'core-features')
    const match = file.match(/^([a-zA-Z-]+)(?:-\d+)?\.tsx$/);
    if (match) {
      const category = match[1];
      
      if (!manifest.silos[category]) {
        manifest.silos[category] = [];
      }
      
      manifest.silos[category].push(filePath);
    }
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`✅ SEO Registry Manifest generated successfully at: ${OUTPUT_FILE}`);
  console.log(`📦 Tracked Categories: ${Object.keys(manifest.silos).join(', ')}`);
}

generateRegistry();