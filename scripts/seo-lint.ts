// scripts/seo-lint.ts
/**
 * Arcli SEO Linter - Pre-commit & Build Quality Control
 * * Execution:
 * Add to package.json scripts: "lint:seo": "tsx scripts/seo-lint.ts"
 * Run as a pre-commit hook using Husky or directly in GitHub Actions.
 */

import { getAllSlugs, getPage } from '../lib/seo/index';

async function runLinter() {
  console.log('🔍 Starting Strict SEO Data Linting...\n');
  
  const slugs = getAllSlugs();
  if (!slugs || slugs.length === 0) {
    console.warn('⚠️ No SEO pages found in registry. Did you run the manifest generator?');
    process.exit(1);
  }

  let hasErrors = false;
  const seenDescriptions = new Map<string, string>(); // Maps normalized description -> slug
  let checked = 0;

  for (const slug of slugs) {
    const page = getPage(slug);
    if (!page) continue;
    checked++;

    const errorsForPage: string[] = [];

    // --- RULE 1: Title Character Limits (Hard SEO Limit) ---
    // Target: Max 60 characters to prevent SERP truncation
    const title = page.seo?.title || page.title;
    if (!title) {
      errorsForPage.push('Missing SEO Title.');
    } else if (title.length > 60) {
      errorsForPage.push(`Title exceeds 60 characters (${title.length} chars): "${title}"`);
    }

    // --- RULE 2: Cannibalization & Duplicate Content Check ---
    // Target: Descriptions must be unique to prevent Google from clustering distinct pages
    const description = page.seo?.description || page.description;
    if (!description) {
      errorsForPage.push('Missing SEO Description.');
    } else {
      const normalizedDesc = description.trim().toLowerCase();
      if (seenDescriptions.has(normalizedDesc)) {
        errorsForPage.push(`Exact duplicate description found. Also used in: /${seenDescriptions.get(normalizedDesc)}`);
      } else {
        seenDescriptions.set(normalizedDesc, slug);
      }
    }

    // --- RULE 3: Structural Integrity (Data-Driven UI Validation) ---
    // Target: Feature pages must pass SQL/Scenarios to the Demo UI block
    if (page.type === 'feature') {
      const hasScenarios = page.analyticalScenarios || page.useCases || page.executiveScenarios;
      const hasScenariosArray = Array.isArray(hasScenarios) && hasScenarios.length > 0;
      
      if (!hasScenariosArray) {
        errorsForPage.push(`Feature-type page is missing 'analyticalScenarios' (or 'useCases'). The Phase 3 Demo block requires this data to render the interactive UI.`);
      }
    }

    // Capture & Format Execution Log
    if (errorsForPage.length > 0) {
      console.error(`❌ [/${slug}] Failed Validation:`);
      errorsForPage.forEach(err => console.error(`   - ${err}`));
      console.error('');
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error(`🛑 SEO Linting Failed. Please fix the errors above to maintain SERP integrity.`);
    process.exit(1); // Fails the build or commit
  } else {
    console.log(`✅ SEO Linting Passed! Checked ${checked} algorithmic pages for structural and semantic integrity.`);
    process.exit(0);
  }
}

// Execute the Linter
runLinter();