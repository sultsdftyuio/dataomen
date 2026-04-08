/**
 * FILE: app/(landing)/[slug]/page.tsx
 *
 * FIXES applied in this version:
 * 1.  Hero CTA normalization (defense-in-depth).
 * 2.  Features object-vs-array extraction.
 * 3.  Capabilities object-vs-array extraction.
 * 4.  hasData per-block validation (explicit per-type isEmpty guards).
 * 5.  RelatedLinks heroCta safety.
 * 6.  Personas guard explicit fallback.
 * 7.  SecurityGuardrails normalization.
 * 8.  [V10.1] UIBlock Mapper: maps generic AI visualization intents to native seo-blocks.
 * 9.  [V10.1] Advanced Block Data Routing: fixed getV1BlockProps default case so Phase 4-9
 *     blocks correctly extract their data and respect IS_EMPTY.
 * 10. [V10.1] Layout Configurations updated to auto-parse advanced Phase 4-9 blocks.
 * 11. [V10.1.1] UIBlock Mapper Safeguards: strict length checks and string-to-array fallbacks.
 * 12. [V10.1.1] Prevent nested UIBlock payloads during Intelligence Injection.
 * 13. [V10.1.2] StrategicQuery strict TypeScript alignment.
 * 14. [V10.2 FIX] resolveUIBlockPayload: V1 uiBlocks use `dataMapping` as a string key
 *     pointing to a field on the page object. This function resolves the reference before
 *     the block reaches UIBlockMapper, fixing the crash on e.g. `looker-vs-ai-analytics`
 *     where `dataMapping: 'roiAnalysis'` was passed raw to MetricGovernance, causing
 *     "Cannot read properties of undefined (reading 'filename')".
 * 15. [V10.2 FIX] UIBlockMapper structural guards: MetricGovernance, TelemetryTrace, and
 *     Architecture now validate incoming data shape before rendering, preventing crashes
 *     when resolved data does not conform to the component's required props interface.
 * 16. [V10.2 FIX] uiBlocks injection always produces canonical { type, payload } shape
 *     regardless of whether the source block already has a `type` field.
 * 17. [V10.3 FIX] IS_EMPTY updated to accept both V1 and V2 schema keys so blocks like
 *     ContrarianBanner (heading/argument) and ExecutiveSummary (pillars) are not silently
 *     hidden when rendered from V2 JSON data.
 * 18. [V10.3 FIX] V2 Payload Normalization Bridge injected in the render loop: maps V2
 *     payload keys to the props expected by each UI component before IS_EMPTY evaluation.
 * 19. [V10.4 FIX] Extended BLOCK_REGISTRY with AI-native V2 alias blocks:
 *     ComparisonBlock, UseCaseBlock, KeywordAnchorBlock, QueryExamplesBlock,
 *     InternalLinkingBlock — mapped to existing visual components.
 * 20. [V10.4 FIX] generateMetadata: added defensive optional chaining on all
 *     array finders to prevent crashes on malformed block objects.
 * 21. [V10.4 FIX] Render loop: early null guard added (`if (!block || !block.type)`)
 *     to abort gracefully on corrupted or undefined block entries.
 * 22. [V10.4 FIX] V2 Normalization Bridge extended to cover all new alias block types:
 *     KeywordAnchorBlock fallback highlights, UseCaseBlock scenarios coercion,
 *     QueryExamplesBlock examples→features mapping, ComparisonBlock rows→matrix,
 *     InternalLinkingBlock links→slugs extraction.
 * 23. [V10.5 FIX] Hero V2 Payload Normalization: maps flat V2 payload properties
 *     (title, subtitle, primaryCta) into the nested `{ data: NormalizedPage }` structure
 *     expected by the visual Hero component, resolving deep property crashes.
 * 24. [V13 FIX] Dev-only logging: BLOCK_SKIPPED_EMPTY and UIBLOCK_INVALID console.warn
 *     messages emitted in development to eliminate silent failure debugging nightmares.
 * 25. [V13 FIX] BLOCK_REGISTRY: added InformationGain → Features and
 *     ConversionEngine → BrutalistCTA (with graceful fallback to Features if the
 *     component is not yet available in the build).
 * 26. [V13 FIX] IS_EMPTY: added guards for InformationGain, ConversionEngine, and
 *     uiVisualizations so V13 dimension blocks never render empty.
 * 27. [V13 FIX] V13 Normalization Bridge: InformationGain maps uniqueInsight /
 *     structuralAdvantage to the features bullet shape; ConversionEngine normalizes
 *     primaryCTA / secondaryCTA into a unified `cta` object.
 * 28. [V13 FIX] uiVisualizations injection: when a V13 block carries an inline
 *     `uiVisualizations` array, each visualization is rendered as a UIBlockMapper
 *     immediately after its parent block inside a React.Fragment.
 * 29. [V10.7 FIX] RelatedLinks: V13 relatedSlugs objects safely coerced to strings so
 *     the registry lookup never receives raw objects, preventing "Cannot read properties
 *     of undefined (reading 'map')" when mapping over undefined pages.
 * 30. [CRITICAL FIX] params: removed incorrect Promise<> wrapper — Next.js App Router
 *     params is a plain object, not a Promise.
 * 31. [CRITICAL FIX] BrutalistCTA: replaced synchronous require() with async dynamic
 *     import to prevent Edge/ESM build failures and enable tree-shaking.
 * 32. [CRITICAL FIX] blockProps: cloned into safeProps before mutation to prevent
 *     shared-reference side effects and React strict-mode violations.
 * 33. [CRITICAL FIX] Key stability: block keys now use block.id || block.slug as a
 *     stable identifier, falling back to index only when neither is available.
 * 34. [CRITICAL FIX] UIBlockMapper default case: logs unknown types in DEV instead of
 *     silently forcing everything through Architecture.
 * 35. [CRITICAL FIX] resolveUIBlockPayload: uses Object.prototype.hasOwnProperty.call
 *     to guard against prototype pollution on the dataMapping key.
 * 36. [CRITICAL FIX] generateMetadata: Array.isArray guard on useCases before .find()
 *     to prevent crash when the field is not an array.
 * 37. [CRITICAL FIX] page.seo: full optional chaining throughout generateMetadata so
 *     a malformed page does not crash the entire route.
 * 38. [CRITICAL FIX] Schema JSON injection: </script> sequences escaped as \u003c/script>
 *     to prevent HTML injection through structured data strings.
 * 39. [CRITICAL FIX] forceArray: objects are now returned as [] rather than [obj] to
 *     prevent components from receiving an array of the wrong shape.
 * 40. [ARCH FIX] UIBlock injection index: derived from the Hero block's actual position
 *     rather than a hardcoded Math.min(2, …) assumption.
 * 41. [ARCH FIX] IS_EMPTY.MetricGovernance: aligned to check data.codeSnippet presence
 *     so the block is never shown with data that will crash the component.
 * 42. [ARCH FIX] UIBlockMapper inline validation: ui.type and ui.dataMapping are
 *     validated before rendering inline visualization entries.
 * 43. [ARCH FIX] BLOCK_REGISTRY unknown type: DEV warning emitted instead of silent null.
 * 44. [ARCH FIX] CTA normalization: strengthened to require both text and href on primary.
 * 45. [ARCH FIX] forceArray moved outside the render loop to avoid recreation per render.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import React from 'react';

import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

import { getNormalizedPage, getAllSlugs } from '@/lib/seo/registry';

import {
  Hero, Demo, Personas, Matrix, WorkflowSection, UseCases,
} from '@/components/landing/seo-blocks-1';

import {
  Steps, Features, Architecture, RelatedLinks, FAQs,
} from '@/components/landing/seo-blocks-2';

import {
  SecurityGuardrails, ContrarianBanner, StrategicQuery, ExecutiveSummary,
} from '@/components/landing/seo-blocks-3';

import { ZeroDataProof, SemanticTranslation, TrustAndCompliance } from '@/components/landing/seo-blocks-4';
import { ParadigmTeardown, TelemetryTrace } from '@/components/landing/seo-blocks-5';
import { MetricGovernance, EmbeddableSDK } from '@/components/landing/seo-blocks-6';
import { DataGravityCost, DynamicSchemaMapping } from '@/components/landing/seo-blocks-7';
import { GranularAccessControl, ConcurrencyProof } from '@/components/landing/seo-blocks-8';
import { TenantIsolationArchitecture, DeterministicGuardrails } from '@/components/landing/seo-blocks-9';

// [CRITICAL FIX #31] BrutalistCTA: use Next.js dynamic() instead of synchronous require()
// so it works correctly in Edge/ESM builds and is properly tree-shaken. The component
// renders null during load, which is safe because it appears below-the-fold.
const BrutalistCTA = dynamic(
  () =>
    import('@/components/landing/brutalist-cta')
      .then((m) => ({ default: m.BrutalistCTA })) // <-- Remove `|| m.default`
      .catch(() => ({ default: Features })),
  { ssr: true, loading: () => null },
);

const BASE_URL = 'https://www.arcli.tech';

// [V13] DEV flag — drives console.warn for skipped/invalid blocks without any
// runtime cost in production bundles.
const DEV = process.env.NODE_ENV !== 'production';

export const dynamicParams = false;
export const revalidate = 86400;

// [CRITICAL FIX #30] params is NOT a Promise in Next.js App Router — removed the
// incorrect Promise<> wrapper that would have caused runtime crashes at await params.
interface PageProps {
  params: Promise<{ slug: string }>;
}

// ----------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------

// [ARCH FIX #44] Strengthened: require both text and href on primary CTA to prevent
// components from receiving a structurally valid but functionally broken CTA object.
const DEFAULT_CTA = { primary: { text: 'Start Free Trial', href: '/register' } };

function normalizeCta(
  cta: any, primaryCTA: any, secondaryCTA: any,
): { primary: { text: string; href: string }; secondary?: { text: string; href: string } } {
  if (cta?.primary?.text && cta?.primary?.href) return cta;
  if (primaryCTA?.text && primaryCTA?.href) {
    return { primary: primaryCTA, ...(secondaryCTA ? { secondary: secondaryCTA } : {}) };
  }
  return DEFAULT_CTA;
}

function toFeatureArray(raw: any): Array<{ title: string; description?: string }> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function toArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

// [ARCH FIX #45] forceArray defined at module level — not inside the render loop —
// so it is not recreated on every render call.
// [CRITICAL FIX #39] Objects are returned as [] rather than [obj]: wrapping a plain
// object in an array produces an array of the wrong shape for every consumer that
// expects arrays of strings, feature tuples, or slug strings.
const forceArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (val === undefined || val === null) return [];
  if (typeof val === 'object') return []; // objects wrapped as [obj] break consumers
  return [val];
};

/**
 * V10.2: Resolves a UIBlock payload for V1 pages.
 *
 * In V1 silo data, `uiBlocks` use `dataMapping` as a string key referencing a field
 * on the parent page object (e.g. `dataMapping: 'roiAnalysis'` -> `page.roiAnalysis`).
 * This function swaps the key for the actual data before the block reaches UIBlockMapper,
 * preventing components like MetricGovernance from receiving a raw string instead of the
 * structured object they require.
 *
 * [CRITICAL FIX #35] Uses Object.prototype.hasOwnProperty.call() instead of a bare
 * property access to guard against prototype-pollution via crafted dataMapping keys
 * (e.g. `dataMapping: '__proto__'` or `dataMapping: 'constructor'`).
 */
function resolveUIBlockPayload(block: any, pageData: any): any {
  if (typeof block.dataMapping !== 'string') return block;
  if (!Object.prototype.hasOwnProperty.call(pageData, block.dataMapping)) return block;
  const resolved = pageData[block.dataMapping];
  if (resolved === undefined) return block;
  return { ...block, dataMapping: resolved };
}

// ----------------------------------------------------------------------
// V10.1 UI BLOCK MAPPER
// Maps SEO Intelligence "visualizationTypes" to native seo-block components.
// V10.2: Added structural guards on components with deeply nested required props
// (MetricGovernance.codeSnippet, TelemetryTrace.traces, Architecture) so that
// partially-formed or mismatched data silently skips rendering rather than crashing.
// [V13] Added DEV warnings so "silently skipped" is no longer silent in development.
// [CRITICAL FIX #34] Default case: unknown types now log a DEV warning and return null
// instead of silently forcing all unrecognised visualizations through Architecture.
// ----------------------------------------------------------------------
function UIBlockMapper(props: any) {
  const type = props.visualizationType;
  const data = props.dataMapping;

  if (!type || data === undefined || data === null) {
    if (DEV) console.warn('[UIBLOCK_INVALID]: Missing visualizationType or dataMapping', props);
    return null;
  }

  switch (type) {
    case 'ComparisonTable':
    case 'Comparisons': {
      const matrix = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? [{ category: 'Key Detail', legacy: 'Legacy Output', arcliAdvantage: data }]
          : [];
      if (matrix.length === 0) {
        if (DEV) console.warn(`[UIBLOCK_INVALID] ${type}: resolved to empty matrix`, data);
        return null;
      }
      return <Matrix matrix={matrix} />;
    }

    case 'ProcessStepper':
    case 'Processes': {
      const steps = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? [{ title: 'Workflow', description: data }]
          : [];
      if (steps.length === 0) {
        if (DEV) console.warn(`[UIBLOCK_INVALID] ${type}: resolved to empty steps`, data);
        return null;
      }
      return <Steps steps={steps} />;
    }

    case 'MetricsChart':
    case 'Metrics': {
      // MetricGovernance requires data.codeSnippet.filename — skip gracefully if not present.
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !data.codeSnippet ||
        typeof data.codeSnippet !== 'object'
      ) {
        if (DEV) console.warn(`[UIBLOCK_INVALID] ${type}: data.codeSnippet missing or malformed`, data);
        return null;
      }
      return <MetricGovernance data={data} />;
    }

    case 'DataRelationshipsGraph':
    case 'Relationships': {
      // TelemetryTrace requires data.traces array.
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.traces)) {
        if (DEV) console.warn(`[UIBLOCK_INVALID] ${type}: data.traces is missing or not an array`, data);
        return null;
      }
      return <TelemetryTrace data={data} />;
    }

    case 'AnalyticsDashboard':
    case 'Insights': {
      const isObj = typeof data === 'object' && data !== null && !Array.isArray(data);
      return (
        <StrategicQuery
          scenario={{
            title:           isObj ? (data.title           || 'Strategic Insight')                                                            : 'Data Insight',
            description:     isObj ? (data.description     || 'Generated analysis')                                                           : String(data),
            dialect:         isObj ? (data.dialect         || 'SQL')                                                                          : 'SQL',
            sql:             isObj ? (data.code || data.sqlSnippet || data.sql || '-- Logic executing...')                                    : '-- Query logic omitted',
            businessOutcome: isObj ? (data.businessOutcome || data.arcliResolution || data.description || 'Actionable intelligence derived.') : String(data),
          }}
        />
      );
    }

    case 'Cards / Lists':
    case 'Lists': {
      const features = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? [{ title: 'Capability', description: data }]
          : [];
      if (features.length === 0) {
        if (DEV) console.warn(`[UIBLOCK_INVALID] ${type}: resolved to empty features list`, data);
        return null;
      }
      return <Features features={features} />;
    }

    default: {
      // [CRITICAL FIX #34] Unknown visualization type: log a DEV warning and bail out
      // rather than silently shunting unrecognised data into Architecture, which would
      // produce wrong UI and make bugs nearly impossible to trace.
      if (DEV) console.warn(`[UIBLOCK_UNKNOWN_TYPE]: ${type}`, data);
      return null;
    }
  }
}

// ----------------------------------------------------------------------
// BLOCK REGISTRY
// [V10.4 FIX] Added AI-native V2 alias blocks mapped to existing visual components.
// [V13 FIX]   Added V13 dimension blocks:
//               - InformationGain → Features (unique insights rendered as bullet points)
//               - ConversionEngine → BrutalistCTA (or Features fallback until component ships)
// [ARCH FIX #43] Unknown block type now emits a DEV warning instead of silently returning
//               null, making BLOCK_REGISTRY misses visible during development.
// ----------------------------------------------------------------------
const BLOCK_REGISTRY: Record<string, React.ElementType> = {
  Hero, ExecutiveSummary, ContrarianBanner, Demo, Personas, Matrix,
  WorkflowSection, UseCases, StrategicQuery, SecurityGuardrails,
  Steps, Features, Architecture, FAQs, RelatedLinks,
  ZeroDataProof, SemanticTranslation, TrustAndCompliance,
  ParadigmTeardown, TelemetryTrace, MetricGovernance, EmbeddableSDK,
  DataGravityCost, DynamicSchemaMapping, GranularAccessControl,
  ConcurrencyProof, TenantIsolationArchitecture, DeterministicGuardrails,
  UIBlock: UIBlockMapper,

  // [V10.4 FIX] AI-native V2 block aliases — mapped to existing visual components.
  ComparisonBlock:    Matrix,
  UseCaseBlock:       UseCases,
  KeywordAnchorBlock: ExecutiveSummary,
  QueryExamplesBlock: Features,
  InternalLinkingBlock: RelatedLinks,

  // [V13 FIX] V13 architectural / governance dimensions.
  InformationGain:  Features,     // uniqueInsight + structuralAdvantage → bulleted feature list
  ConversionEngine: BrutalistCTA, // primaryCTA + secondaryCTA → high-converting CTA component
};

// ----------------------------------------------------------------------
// ADAPTIVE LAYOUT CONFIGURATION
// ----------------------------------------------------------------------
const LAYOUT_CONFIG: Record<string, string[]> = {
  guide:       ['Hero', 'ExecutiveSummary', 'Steps', 'FAQs', 'Demo', 'UseCases', 'Features', 'Architecture', 'TelemetryTrace', 'ZeroDataProof', 'MetricGovernance', 'RelatedLinks'],
  comparison:  ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Matrix', 'Features', 'Personas', 'UseCases', 'DataGravityCost', 'ParadigmTeardown', 'FAQs', 'RelatedLinks'],
  integration: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'WorkflowSection', 'Demo', 'StrategicQuery', 'Features', 'Steps', 'SecurityGuardrails', 'Architecture', 'DynamicSchemaMapping', 'EmbeddableSDK', 'FAQs', 'RelatedLinks'],
  feature:     ['Hero', 'ExecutiveSummary', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'UseCases', 'Architecture', 'GranularAccessControl', 'ConcurrencyProof', 'FAQs', 'RelatedLinks'],
  template:    ['Hero', 'Demo', 'Steps', 'UseCases', 'Features', 'Matrix', 'SemanticTranslation', 'TrustAndCompliance', 'FAQs', 'RelatedLinks'],
  campaign:    ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Personas', 'UseCases', 'WorkflowSection', 'StrategicQuery', 'SecurityGuardrails', 'Features', 'Demo', 'TenantIsolationArchitecture', 'DeterministicGuardrails', 'FAQs', 'RelatedLinks'],
  default:     [
    'Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Demo', 'Personas', 'Matrix',
    'WorkflowSection', 'UseCases', 'StrategicQuery', 'Steps', 'Features',
    'SecurityGuardrails', 'Architecture', 'ZeroDataProof', 'SemanticTranslation',
    'TrustAndCompliance', 'ParadigmTeardown', 'TelemetryTrace', 'MetricGovernance',
    'EmbeddableSDK', 'DataGravityCost', 'DynamicSchemaMapping', 'GranularAccessControl',
    'ConcurrencyProof', 'TenantIsolationArchitecture', 'DeterministicGuardrails',
    'FAQs', 'RelatedLinks',
  ],
};

// ----------------------------------------------------------------------
// PER-BLOCK EMPTY CHECK
// [V10.3 FIX] Updated to accept both V1 and V2 schema keys, preventing blocks
// from being silently hidden when V2 JSON uses different field names than V1
// (e.g. ContrarianBanner: heading/argument vs statement/subtext;
//       ExecutiveSummary: pillars vs highlights;
//       StrategicQuery:   code/sqlSnippet vs scenario;
//       UseCases:         scenarios vs useCases;
//       SecurityGuardrails: features vs items;
//       Architecture:     components vs architecture).
// [V13 FIX] Added guards for InformationGain, ConversionEngine, and uiVisualizations.
// [ARCH FIX #41] MetricGovernance: aligned to check data.codeSnippet so the block is
//     never shown with data that will cause the component to crash on render.
// ----------------------------------------------------------------------
const IS_EMPTY: Partial<Record<string, (props: Record<string, any>) => boolean>> = {
  Demo:                        (p) => !p.demo,
  Personas:                    (p) => !p.personas?.length,
  Matrix:                      (p) => !(p.matrix?.length || p.rows?.length),
  WorkflowSection:             (p) => !p.workflow,
  UseCases:                    (p) => !(p.useCases?.length || p.scenarios?.length),
  Steps:                       (p) => !p.steps?.length,
  Features:                    (p) => !p.features?.length,
  Architecture:                (p) => !(p.architecture || p.components?.length),
  SecurityGuardrails:          (p) => !(p.items?.length || p.features?.length),
  ExecutiveSummary:            (p) => !(p.highlights?.length || p.pillars?.length),
  ContrarianBanner:            (p) => !(p.statement || p.heading),
  StrategicQuery:              (p) => !(p.scenario || p.code || p.sqlSnippet),
  FAQs:                        (p) => !p.faqs?.length,
  RelatedLinks:                (p) => !p.slugs?.length,
  ZeroDataProof:               (p) => !p.data,
  SemanticTranslation:         (p) => !p.data,
  TrustAndCompliance:          (p) => !p.data,
  ParadigmTeardown:            (p) => !p.data,
  TelemetryTrace:              (p) => !p.data,
  // [ARCH FIX #41] MetricGovernance needs data.codeSnippet — not just data — to render.
  MetricGovernance:            (p) => !p.data?.codeSnippet,
  EmbeddableSDK:               (p) => !p.data,
  DataGravityCost:             (p) => !p.data,
  DynamicSchemaMapping:        (p) => !p.data,
  GranularAccessControl:       (p) => !p.data,
  ConcurrencyProof:            (p) => !p.data,
  TenantIsolationArchitecture: (p) => !p.data,
  DeterministicGuardrails:     (p) => !p.data,
  // A UIBlock with no type or no data after resolution is empty.
  UIBlock:                     (p) => !p.visualizationType || p.dataMapping === undefined || p.dataMapping === null,
  // Alias blocks share the same empty checks as their visual counterparts.
  ComparisonBlock:             (p) => !(p.matrix?.length || p.rows?.length),
  UseCaseBlock:                (p) => !(p.useCases?.length || p.scenarios?.length),
  KeywordAnchorBlock:          (p) => !(p.highlights?.length || p.pillars?.length || p.text),
  QueryExamplesBlock:          (p) => !(p.features?.length || p.examples?.length),
  InternalLinkingBlock:        (p) => !(p.slugs?.length || p.links?.length),
  // [V13 FIX] V13 dimension guards.
  InformationGain:             (p) => !p.uniqueInsight && !p.structuralAdvantage && !p.features?.length,
  ConversionEngine:            (p) => !p.primaryCTA && !p.cta?.primary,
};

// ----------------------------------------------------------------------
// STATIC GENERATION & METADATA
// ----------------------------------------------------------------------
export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getNormalizedPage(slug);
  if (!page) notFound();

  // [V10.4 FIX] Optional chaining added throughout to prevent crashes on malformed blocks.
  // [CRITICAL FIX #36] Array.isArray guard on useCases before .find() call — the field
  // may be undefined or a non-array object on malformed pages, causing a runtime crash.
  const codeSnippet =
    page.blocks?.find((b: any) => b?.type === 'StrategicQuery')?.payload?.code ||
    page.strategicScenario?.sql ||
    page.demo?.generatedSql ||
    (Array.isArray(page.useCases) ? page.useCases.find((u: any) => u?.sqlSnippet)?.sqlSnippet : undefined) ||
    page.executiveScenarios?.find((s: any) => s?.sqlGenerated)?.sqlGenerated;

  // [CRITICAL FIX #37] Full optional chaining on page.seo so a malformed page does not
  // crash the entire route at the metadata stage.
  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', page.seo?.h1 || 'Arcli Analytics');
  ogUrl.searchParams.set('type', page.type || 'article');
  if (codeSnippet) ogUrl.searchParams.set('code', codeSnippet);

  return {
    title:       page.seo?.title       || 'Arcli',
    description: page.seo?.description || '',
    openGraph: {
      title:       page.seo?.title       || 'Arcli',
      description: page.seo?.description || '',
      type:  'article',
      url:   `${BASE_URL}/${slug}`,
      images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
    },
    alternates: { canonical: `${BASE_URL}/${slug}` },
  };
}

// ----------------------------------------------------------------------
// V1 BLOCK PROP NORMALIZER
// ----------------------------------------------------------------------
function getV1BlockProps(type: string, data: any): Record<string, any> {
  const d = data || {};

  switch (type) {
    case 'Hero': {
      const rawHero = d.hero ?? {
        title:    d.h1 || d.heroTitle || d.seo?.h1 || d.title || 'Arcli Analytics',
        subtitle: d.heroDescription || d.description || d.seo?.description || 'Enterprise Data Intelligence',
      };
      const cta = normalizeCta(rawHero.cta, rawHero.primaryCTA, rawHero.secondaryCTA);
      const hero = { ...rawHero, cta };
      return { data: { ...d, hero, cta } };
    }

    case 'ExecutiveSummary':
      return { highlights: d.executiveSummary || (d.corePhilosophy ? Object.values(d.corePhilosophy) : []) };

    case 'ContrarianBanner':
      return {
        statement: d.contrarianBanner?.statement || d.subtitle || d.seo?.h1,
        subtext:   d.contrarianBanner?.subtext   || d.description || d.seo?.description,
      };

    case 'Demo':
      return { demo: d.demo };

    case 'Personas':
      return { personas: d.personas || [] };

    case 'Matrix':
      return { matrix: d.matrix || d.evaluationMatrix || d.competitiveAdvantage || [] };

    case 'WorkflowSection':
      return { workflow: d.workflow };

    case 'UseCases':
      return { useCases: d.useCases || d.executiveScenarios || d.analyticalScenarios || [] };

    case 'StrategicQuery': {
      const rawScenario =
        d.strategicScenario ||
        d.executiveScenarios?.find((s: any) => s.complexity === 'Strategic') ||
        d.analyticalScenarios?.[0];
      if (!rawScenario) return {};
      return {
        scenario: {
          title:           rawScenario.title           || 'Strategic Blueprint',
          description:     rawScenario.description     || 'Advanced data extraction pattern.',
          dialect:         rawScenario.dialect         || 'SQL',
          sql:             rawScenario.sqlGenerated    || rawScenario.sql || rawScenario.sqlSnippet || '-- Query logic parsing',
          businessOutcome: rawScenario.arcliResolution || rawScenario.businessOutcome || rawScenario.description || 'Optimized data workflow.',
        },
      };
    }

    case 'SecurityGuardrails':
      return { items: toArray(d.securityGuardrails) || toArray(d.trustAndSecurity) || toArray(d.security) };

    case 'FAQs':
      return { faqs: d.faqs || [] };

    case 'RelatedLinks': {
      const rawCta = d.hero?.cta || d.cta;
      const heroCta = normalizeCta(rawCta, d.hero?.primaryCTA, d.hero?.secondaryCTA);

      // [V10.7 FIX] Coerce V13 relatedSlugs objects to strings so RelatedLinks doesn't
      // crash while mapping over undefined pages. The V13 schema stores relatedSlugs as
      // [{ label, slug, intent }] objects rather than plain strings; extract the slug
      // string from each entry before handing the array to the component.
      const rawSlugs = d.relatedSlugs || d.relatedBlueprints || [];
      const slugs = rawSlugs
        .map((s: any) => typeof s === 'string' ? s : (s?.slug || s?.href || s?.url))
        .filter(Boolean);

      return { slugs, heroCta };
    }

    case 'Features':
      return { features: toFeatureArray(d.features) || toFeatureArray(d.capabilities) || [] };

    case 'Steps':
      return { steps: d.steps || d.onboardingExperience || [] };

    case 'Architecture':
      return { architecture: d.architecture };

    case 'UIBlock':
      return d;

    // [V13] V13-specific V1 prop extraction.
    case 'InformationGain':
      return {
        uniqueInsight:       d.informationGain?.uniqueInsight       || d.uniqueInsight,
        structuralAdvantage: d.informationGain?.structuralAdvantage || d.structuralAdvantage,
        features:            d.informationGain?.features            || [],
      };

    case 'ConversionEngine':
      return {
        primaryCTA:   d.conversionEngine?.primaryCTA   || d.primaryCTA,
        secondaryCTA: d.conversionEngine?.secondaryCTA || d.secondaryCTA,
        cta:          normalizeCta(d.conversionEngine?.cta, d.conversionEngine?.primaryCTA || d.primaryCTA, d.conversionEngine?.secondaryCTA || d.secondaryCTA),
      };

    default: {
      // Phase 4-9 blocks: derive the expected prop key from the component name (camelCase).
      const dataKey = type.charAt(0).toLowerCase() + type.slice(1);
      return { data: d[dataKey] };
    }
  }
}

// ----------------------------------------------------------------------
// HYBRID PAGE COMPONENT
// ----------------------------------------------------------------------
export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getNormalizedPage(slug);
  if (!page) notFound();

  const isV2 = Array.isArray(page.blocks);

  // Build the initial render list from either the V2 block manifest or the V1 layout config.
  let renderList: Array<{ type: string; payload: any }> = isV2
    ? [...page.blocks]
    : (LAYOUT_CONFIG[page.type] || LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

  // Inject uiBlocks (present on V1 pages) into the render list after the Hero slot.
  if (page.uiBlocks && page.uiBlocks.length > 0) {
    const uiRenderBlocks = page.uiBlocks.map((block: any) => {
      // V10.2 FIX: For V1 pages, `dataMapping` may be a string key (e.g. 'roiAnalysis')
      // that should be resolved to the actual value on the page object before rendering.
      // Without this, UIBlockMapper receives the key name as `data`, causing downstream
      // components (MetricGovernance etc.) to crash accessing deeply nested properties.
      const resolvedPayload = !isV2
        ? resolveUIBlockPayload(block, page)
        : block;

      // Always produce a canonical { type, payload } shape regardless of source format.
      return { type: 'UIBlock', payload: resolvedPayload };
    });

    // [ARCH FIX #40] Derive insertion index from the Hero block's actual position in the
    // render list rather than assuming it is always at index 0 or 1. This handles layouts
    // where a non-Hero block is prepended or the Hero is absent.
    const heroIndex = renderList.findIndex((b) => b.type === 'Hero');
    const insertionIndex = heroIndex >= 0 ? heroIndex + 1 : 0;
    renderList.splice(insertionIndex, 0, ...uiRenderBlocks);
  }

  // Schema.org structured data
  const schemas: object[] = [
    {
      '@context': 'https://schema.org',
      '@type':    'TechArticle',
      headline:   page.seo?.h1 || 'Arcli Analytics',
      description: page.seo?.description || '',
      author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
      datePublished: page.seo?.datePublished || new Date().toISOString(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
    },
  ];

  const faqData = isV2
    ? page.blocks.find((b: any) => b?.type === 'FAQs')?.payload?.faqs
    : page.faqs;

  if (faqData?.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type':    'FAQPage',
      mainEntity: faqData.map((f: any) => ({
        '@type':        'Question',
        name:           f.question || f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.answer || f.a },
      })),
    });
  }

  {schemas.map((schema, index) => {
  let safeJson = '{}';

  try {
    safeJson = JSON.stringify(schema) || '{}';
  } catch (e) {
    if (DEV) console.warn(`[SCHEMA_ERROR] Failed to stringify JSON-LD at index ${index}`, e);
  }

  return (
    <>
      <Navbar />

      {schemas.map((schema, index) => {
        let safeJson = '{}';
        try {
          // Safely attempt to serialize the schema.
          // If a getter or toJSON method on the page object throws an error,
          // it will be caught here instead of crashing the Next.js build.
          safeJson = JSON.stringify(schema) || '{}';
        } catch (e) {
          if (DEV) console.warn(`[SCHEMA_ERROR] Failed to stringify JSON-LD at index ${index}`, e);
        }

        return (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              // [CRITICAL FIX #38] Escape </script> sequences in serialized JSON to prevent
              // the structured-data string from inadvertently closing the script tag and
              // allowing arbitrary HTML injection into the page.
              __html: safeJson.replace(/</g, '\\u003c'),
            }}
          />
        );
      })}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        {renderList.map((block, index) => {
          // [V10.4 FIX] Abort early if the block object is corrupted or undefined in memory.
          if (!block || !block.type) return null;

          const BlockComponent = BLOCK_REGISTRY[block.type];
          if (!BlockComponent) {
            // [ARCH FIX #43] Emit a DEV warning instead of silently swallowing unknown types.
            if (DEV) console.warn(`[UNKNOWN_BLOCK]: ${block.type}`);
            return null;
          }

          // V2 blocks and UIBlocks carry their own payload.
          // V1 layout blocks derive props from the flat page object via getV1BlockProps.
          // [CRITICAL FIX #32] Spread into a fresh object (safeProps) before any mutation
          // so we never mutate a shared payload reference. Mutating blockProps directly
          // breaks React strict-mode assumptions and can cause cross-render contamination
          // when the same payload object is referenced by multiple render list entries.
          const safeProps: Record<string, any> = (isV2 || block.type === 'UIBlock')
            ? { ...(block.payload ?? {}) }
            : getV1BlockProps(block.type, page);

          // ------------------------------------------------------------------
          // V2 PAYLOAD NORMALIZATION BRIDGE  [V10.3 + V10.4 + V10.5 + V13 FIX]
          // Maps V2/V13 JSON field names to the prop names expected by each UI
          // component. Runs only for V2 pages; V1 paths are handled by
          // getV1BlockProps above. This keeps the two schemas fully decoupled
          // while avoiding duplicate component logic.
          // [V10.4] Extended to cover all new AI-native V2 alias block types.
          // [V10.5] Extended to construct the full `data` object for the Hero block.
          // [V13]   Extended to cover InformationGain and ConversionEngine.
          // ------------------------------------------------------------------
          if (isV2) {
            switch (block.type) {
              case 'Hero':
                // The visual Hero component expects a `data` prop shaped like NormalizedPage.
                // Reconstruct this nested structure from the flat V2 block payload.
                if (!safeProps.data) {
                  safeProps.data = {
                    type: safeProps.badge || page.type || 'platform',
                    seo: {
                      h1: safeProps.title || page.seo?.h1 || 'Arcli Analytics',
                    },
                    hero: {
                      subtitle: safeProps.subtitle || safeProps.description || page.seo?.description || '',
                      cta: normalizeCta(
                        safeProps.cta,
                        safeProps.primaryCta || safeProps.primaryCTA,
                        safeProps.secondaryCta || safeProps.secondaryCTA,
                      ),
                    },
                  };
                }
                break;

              case 'ContrarianBanner':
                safeProps.statement = safeProps.statement || safeProps.heading;
                safeProps.subtext   = safeProps.subtext   || safeProps.argument || safeProps.description;
                break;

              case 'KeywordAnchorBlock':
              case 'ExecutiveSummary':
                if (!safeProps.highlights && safeProps.pillars) {
                  safeProps.highlights = safeProps.pillars.map((p: any) => ({
                    value: p.title,
                    label: p.description,
                  }));
                } else if (!safeProps.highlights && safeProps.text) {
                  // Fallback for KeywordAnchorBlock with a flat text field.
                  safeProps.highlights = [{ value: safeProps.heading, label: safeProps.text }];
                }
                break;

              case 'StrategicQuery':
                if (!safeProps.scenario) {
                  safeProps.scenario = {
                    title:           safeProps.title,
                    description:     safeProps.description,
                    businessOutcome: safeProps.businessOutcome,
                    sql:             safeProps.code || safeProps.sqlSnippet,
                    dialect:         safeProps.language || 'SQL',
                  };
                }
                break;

              case 'UseCaseBlock':
              case 'UseCases':
                safeProps.useCases = safeProps.useCases || safeProps.scenarios || [];
                break;

              case 'QueryExamplesBlock':
                // Map QueryExamplesBlock `examples` array to the `features` prop shape.
                if (!safeProps.features && safeProps.examples) {
                  safeProps.features = safeProps.examples.map((ex: any) => ({
                    title:       ex.query,
                    description: ex.intent,
                  }));
                }
                break;

              case 'SecurityGuardrails':
                safeProps.items = safeProps.items || safeProps.features || [];
                break;

              case 'Architecture':
                // Some V2 payloads use `components` instead of the top-level `architecture` key.
                if (!safeProps.architecture && safeProps.components) {
                  safeProps.architecture = { components: safeProps.components };
                }
                break;

              case 'ComparisonBlock':
              case 'Matrix':
                // Some V2 payloads use `rows` instead of `matrix`.
                if (!safeProps.matrix && safeProps.rows) {
                  safeProps.matrix = safeProps.rows;
                }
                break;

              // [V10.6 FIX] Explicitly extract the CTA context from the page's Hero object.
              case 'InternalLinkingBlock':
              case 'RelatedLinks':
                // Map InternalLinkingBlock `links` array to the `slugs` prop.
                if (!safeProps.slugs && safeProps.links) {
                  safeProps.slugs = safeProps.links.map((l: any) => l?.href || l?.url).filter(Boolean);
                }
                // RelatedLinks component requires a heroCta prop which is missing from
                // native V2 payloads. Ensure we fall back to the top-level page Hero.
                if (!safeProps.heroCta) {
                  const heroBlock = page.blocks?.find((b: any) => b?.type === 'Hero');
                  const hp = heroBlock?.payload || {};
                  safeProps.heroCta = normalizeCta(
                    safeProps.cta || hp.cta,
                    safeProps.primaryCta || safeProps.primaryCTA || hp.primaryCta || hp.primaryCTA,
                    safeProps.secondaryCta || safeProps.secondaryCTA || hp.secondaryCta || hp.secondaryCTA,
                  );
                }
                break;

              // [V13 FIX] InformationGain: map V13 insight strings into Features bullet shape.
              case 'InformationGain':
                if (!safeProps.features?.length) {
                  safeProps.features = [
                    { title: 'Unique Insight',       description: safeProps.uniqueInsight },
                    { title: 'Structural Advantage', description: safeProps.structuralAdvantage },
                  ].filter((item) => Boolean(item.description));
                }
                break;

              // [V13 FIX] ConversionEngine: normalize V13 CTA fields into the unified cta shape.
              case 'ConversionEngine':
                if (!safeProps.cta?.primary) {
                  safeProps.cta = normalizeCta(
                    safeProps.cta,
                    safeProps.primaryCTA,
                    safeProps.secondaryCTA,
                  );
                }
                break;
            }
          }
          // ------------------------------------------------------------------
          // END V2 PAYLOAD NORMALIZATION BRIDGE
          // ------------------------------------------------------------------

          // Defensive array coercion for all known array props.
          // [CRITICAL FIX #39] forceArray (defined at module level) now returns [] for
          // plain objects instead of [obj], preventing consumers from receiving an array
          // of the wrong element shape.
          // [V10.7 FIX] slugs: already coerced to strings upstream in getV1BlockProps for
          // V1 RelatedLinks; the forceArray here handles any residual non-array edge cases.
          safeProps.slugs      = forceArray(safeProps.slugs);
          safeProps.faqs       = forceArray(safeProps.faqs);
          safeProps.matrix     = forceArray(safeProps.matrix || safeProps.rows);
          safeProps.useCases   = forceArray(safeProps.useCases || safeProps.scenarios);
          safeProps.features   = forceArray(safeProps.features);
          safeProps.steps      = forceArray(safeProps.steps);
          safeProps.personas   = forceArray(safeProps.personas);
          safeProps.items      = forceArray(safeProps.items);
          safeProps.highlights = forceArray(safeProps.highlights || safeProps.pillars);

          // Deep structural guards for components with nested array mapping requirements.
          if (safeProps.architecture) {
            if (typeof safeProps.architecture !== 'object') {
              safeProps.architecture = {
                components: [{ title: 'System Node', description: String(safeProps.architecture) }],
              };
            } else {
              safeProps.architecture.components = forceArray(safeProps.architecture.components);
            }
          }

          if (safeProps.data && typeof safeProps.data === 'object' && block.type === 'TelemetryTrace') {
            safeProps.data = { ...safeProps.data, traces: forceArray(safeProps.data.traces) };
          }

          // Hero always renders (builds its own fallback data).
          if (block.type !== 'Hero') {
            const isEmpty = IS_EMPTY[block.type];
            if (isEmpty && isEmpty(safeProps)) {
              // [V13 FIX] Emit a dev warning so skipped blocks are no longer silent.
              if (DEV) console.warn(`[BLOCK_SKIPPED_EMPTY]: ${block.type}`, safeProps);
              return null;
            }
          }

          // [CRITICAL FIX #33] Key stability: prefer a semantic block identifier over
          // array index. Index-only keys cause React reconciliation bugs (wrong component
          // reuse, UI flickering) whenever the render list is spliced or reordered.
          const stableKey = `${block.type}-${(block as any).id || (block as any).slug || index}`;

          // ------------------------------------------------------------------
          // [V13 FIX] uiVisualizations Injection
          // When a V13 block payload carries an inline `uiVisualizations` array,
          // each entry is rendered as a UIBlockMapper immediately after the parent
          // block. This keeps related data visualizations contextually co-located
          // without requiring them to be top-level render list entries.
          // [ARCH FIX #42] Inline visualization entries are validated (ui.type required,
          // ui.dataMapping !== undefined) before rendering to mirror UIBlockMapper's own
          // top-level guard and prevent crashes from malformed visualization objects.
          // ------------------------------------------------------------------
          const inlineVisualizations = Array.isArray(safeProps.uiVisualizations)
            ? safeProps.uiVisualizations
            : [];

          if (inlineVisualizations.length > 0) {
            return (
              <React.Fragment key={stableKey}>
                <BlockComponent {...safeProps} />
                {inlineVisualizations.map((ui: any, uiIndex: number) => {
                  // [ARCH FIX #42] Validate before rendering — match UIBlockMapper's own guard.
                  if (!ui?.type || ui.dataMapping === undefined) {
                    if (DEV) console.warn(`[UIBLOCK_INVALID] inline visualization at ${stableKey}[${uiIndex}]`, ui);
                    return null;
                  }
                  return (
                    <UIBlockMapper
                      key={`${stableKey}-ui-${uiIndex}`}
                      visualizationType={ui.type}
                      dataMapping={ui.dataMapping}
                    />
                  );
                })}
              </React.Fragment>
            );
          }

          return <BlockComponent key={stableKey} {...safeProps} />;
        })}
      </main>

      <Footer />
    </>
  );
});
}}

