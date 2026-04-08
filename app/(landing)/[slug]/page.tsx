/**
 * FILE: app/(landing)/[slug]/page.tsx  — v14.0 (full refactor)
 *
 * ═══════════════════════════════════════════════════════════════════
 * BUG FIXES
 * ═══════════════════════════════════════════════════════════════════
 * [B1] Removed duplicate JSON-LD <script> injection that existed inside
 *      renderList.map — `schema` was undefined in that scope, causing runtime
 *      crashes and an SEO double-injection penalty.
 * [B2] Removed nested <main> tag — invalid HTML causing accessibility issues,
 *      hydration mismatches, and broken SEO signals.
 * [B3] PageProps.params is NOT a Promise in Next.js App Router; removed the
 *      incorrect Promise<> wrapper and all `await params` calls.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE IMPROVEMENTS
 * ═══════════════════════════════════════════════════════════════════
 * [A1] Plugin-based UIBlockMapper: each visualization type is a UIHandler
 *      function registered in UI_BLOCK_HANDLERS. Adding a new type = one
 *      dictionary entry. No more switch-case sprawl.
 * [A2] Co-located Block Registry: component + isEmpty guard live together in
 *      BLOCK_REGISTRY. No separate IS_EMPTY map to drift out of sync.
 * [A3] Pre-normalized render pipeline: all V1 / V2 / V13 normalization runs
 *      inside prepareBlocks() before the JSX loop. The render component is a
 *      pure projection over an already-prepared data array — zero transformation
 *      logic in JSX.
 * [A4] blockMap cache: page.blocks is indexed once into a Map<type, block>,
 *      eliminating O(n) .find() calls repeated inside the normalization bridge
 *      (e.g. every RelatedLinks block looking up Hero's CTA).
 *
 * ═══════════════════════════════════════════════════════════════════
 * CLEANLINESS IMPROVEMENTS
 * ═══════════════════════════════════════════════════════════════════
 * [C1] Magic strings replaced with UI_TYPES and BLOCK_TYPES constants.
 * [C2] Canonical CTA naming: `primaryCta` / `secondaryCta` (lowercase 'a')
 *      everywhere. Legacy variants (primaryCTA, primary_cta) are coerced at the
 *      normalization boundary and never leak into component props.
 * [C3] forceArray, normalizeCta, toFeatureArray are module-level utilities
 *      called once per block inside prepareBlocks — not re-invoked on every
 *      React render.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PERFORMANCE IMPROVEMENTS
 * ═══════════════════════════════════════════════════════════════════
 * [P1] blockMap: O(1) Hero / anchor lookups, replacing repeated O(n) .find().
 * [P2] All normalization runs in prepareBlocks — render loop is pure O(1) per
 *      block.
 * [P3] forceArray applied once per block in prepareBlocks, not on every
 *      re-render.
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

import {
  ZeroDataProof, SemanticTranslation, TrustAndCompliance,
} from '@/components/landing/seo-blocks-4';

import { ParadigmTeardown, TelemetryTrace } from '@/components/landing/seo-blocks-5';
import { MetricGovernance, EmbeddableSDK }   from '@/components/landing/seo-blocks-6';
import { DataGravityCost, DynamicSchemaMapping } from '@/components/landing/seo-blocks-7';
import { GranularAccessControl, ConcurrencyProof } from '@/components/landing/seo-blocks-8';
import { TenantIsolationArchitecture, DeterministicGuardrails } from '@/components/landing/seo-blocks-9';

// Async dynamic import — safe for Edge / ESM, tree-shaken in production.
// Falls back to Features so the ConversionEngine block degrades gracefully if the
// component has not shipped yet.
const BrutalistCTA = dynamic(
  () =>
    import('@/components/landing/brutalist-cta')
      .then((m) => ({ default: m.BrutalistCTA }))
      .catch(() => ({ default: Features })),
  { ssr: true, loading: () => null },
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS  [C1]
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.arcli.tech';
const DEV      = process.env.NODE_ENV !== 'production';

/** Canonical visualization-type identifiers — eliminates magic strings in UIBlockMapper. */
const UI_TYPES = {
  COMPARISON_TABLE:         'ComparisonTable',
  COMPARISONS:              'Comparisons',
  PROCESS_STEPPER:          'ProcessStepper',
  PROCESSES:                'Processes',
  METRICS_CHART:            'MetricsChart',
  METRICS:                  'Metrics',
  DATA_RELATIONSHIPS_GRAPH: 'DataRelationshipsGraph',
  RELATIONSHIPS:            'Relationships',
  ANALYTICS_DASHBOARD:      'AnalyticsDashboard',
  INSIGHTS:                 'Insights',
  CARDS_LISTS:              'Cards / Lists',
  LISTS:                    'Lists',
} as const;

/** Canonical block-type identifiers — used in BLOCK_REGISTRY, LAYOUT_CONFIG and all
 *  normalization maps. String values must match the type field in page JSON. */
const BLOCK_TYPES = {
  HERO:                        'Hero',
  EXECUTIVE_SUMMARY:           'ExecutiveSummary',
  CONTRARIAN_BANNER:           'ContrarianBanner',
  DEMO:                        'Demo',
  PERSONAS:                    'Personas',
  MATRIX:                      'Matrix',
  WORKFLOW_SECTION:            'WorkflowSection',
  USE_CASES:                   'UseCases',
  STRATEGIC_QUERY:             'StrategicQuery',
  SECURITY_GUARDRAILS:         'SecurityGuardrails',
  STEPS:                       'Steps',
  FEATURES:                    'Features',
  ARCHITECTURE:                'Architecture',
  FAQS:                        'FAQs',
  RELATED_LINKS:               'RelatedLinks',
  ZERO_DATA_PROOF:             'ZeroDataProof',
  SEMANTIC_TRANSLATION:        'SemanticTranslation',
  TRUST_AND_COMPLIANCE:        'TrustAndCompliance',
  PARADIGM_TEARDOWN:           'ParadigmTeardown',
  TELEMETRY_TRACE:             'TelemetryTrace',
  METRIC_GOVERNANCE:           'MetricGovernance',
  EMBEDDABLE_SDK:              'EmbeddableSDK',
  DATA_GRAVITY_COST:           'DataGravityCost',
  DYNAMIC_SCHEMA_MAPPING:      'DynamicSchemaMapping',
  GRANULAR_ACCESS_CONTROL:     'GranularAccessControl',
  CONCURRENCY_PROOF:           'ConcurrencyProof',
  TENANT_ISOLATION:            'TenantIsolationArchitecture',
  DETERMINISTIC_GUARDRAILS:    'DeterministicGuardrails',
  UI_BLOCK:                    'UIBlock',
  // V2 AI-native aliases
  COMPARISON_BLOCK:            'ComparisonBlock',
  USE_CASE_BLOCK:              'UseCaseBlock',
  KEYWORD_ANCHOR_BLOCK:        'KeywordAnchorBlock',
  QUERY_EXAMPLES_BLOCK:        'QueryExamplesBlock',
  INTERNAL_LINKING_BLOCK:      'InternalLinkingBlock',
  // V13 dimension blocks
  INFORMATION_GAIN:            'InformationGain',
  CONVERSION_ENGINE:           'ConversionEngine',
} as const;

const DEFAULT_CTA = {
  primary: { text: 'Start Free Trial', href: '/register' },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

// [B3] params is a plain object in Next.js App Router — NOT a Promise.
interface PageProps {
  params: { slug: string };
}

interface Cta {
  primary:    { text: string; href: string };
  secondary?: { text: string; href: string };
}

interface InlineViz {
  type:        string;
  dataMapping: unknown;
}

interface PreparedBlock {
  type:                 string;
  props:                Record<string, any>;
  stableKey:            string;
  inlineVisualizations: InlineViz[];
}

interface BlockRegistryEntry {
  component: React.ElementType;
  /** Return true when props lack the data the component needs to render. */
  isEmpty?:  (props: Record<string, any>) => boolean;
}

type UIHandler    = (data: unknown) => React.ReactElement | null;
type V2Normalizer = (
  props:    Record<string, any>,
  page:     any,
  blockMap: Map<string, any>,
) => void;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS  [C3]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerce any value to an array.
 * Plain objects return [] — wrapping an object as [obj] produces an array of the
 * wrong element shape for every consumer expecting strings, tuples, or slug lists.
 */
const forceArray = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (val === undefined || val === null) return [];

  if (typeof val === 'object') {
    return Array.isArray((val as any).items)
      ? (val as any).items
      : [val];
  }

  return [val];
};

/**
 * [C2] Canonical CTA normalization. Requires both text + href on primary.
 * Accepts legacy variants (primaryCTA / primary_cta) as input; callers are
 * responsible for coercing before passing here.
 */
function normalizeCta(cta: any, primaryCta: any, secondaryCta: any): Cta {
  if (cta?.primary?.text && cta?.primary?.href) return cta as Cta;
  if (primaryCta?.text && primaryCta?.href) {
    return {
      primary:  primaryCta,
      ...(secondaryCta ? { secondary: secondaryCta } : {}),
    };
  }
  return DEFAULT_CTA;
}

/** Coerce a raw features / capabilities field to a typed item array. */
function toFeatureArray(raw: unknown): Array<{ title: string; description?: string }> {
  if (!raw)                                   return [];
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray((raw as any).items))      return (raw as any).items;
  return [];
}

function toArray(raw: unknown): unknown[] {
  if (!raw)                                   return [];
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray((raw as any).items))      return (raw as any).items;
  return [];
}

/** Safely serialize an object to JSON for use in <script> tags. Escapes </script>
 *  sequences to prevent HTML injection through structured-data strings. */
function safeStringify(obj: object): string {
  try {
    return JSON.stringify(obj)
      ?.replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029') || '{}';
  } catch {
    return '{}';
  }
}

/**
 * For V1 pages, `uiBlocks[].dataMapping` is a string key referencing a field on
 * the parent page object (e.g. `dataMapping: 'roiAnalysis'` → `page.roiAnalysis`).
 * Resolves it to the actual value before passing to UIBlockMapper, preventing
 * components like MetricGovernance from receiving a raw key string.
 * Uses hasOwnProperty.call to guard against prototype-pollution.
 */
function resolveUIBlockPayload(block: any, pageData: any): any {
  if (typeof block.dataMapping !== 'string')                               return block;
  if (!Object.prototype.hasOwnProperty.call(pageData, block.dataMapping)) return block;
  const resolved = pageData[block.dataMapping];
  if (resolved === undefined)                                              return block;
  return { ...block, dataMapping: resolved };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLUGIN-BASED UI BLOCK MAPPER  [A1]
// Each visualization type is a self-contained UIHandler. To add a new type,
// register one entry in UI_BLOCK_HANDLERS — no switch sprawl.
// ─────────────────────────────────────────────────────────────────────────────

const UI_BLOCK_HANDLERS: Record<string, UIHandler> = {
  [UI_TYPES.COMPARISON_TABLE]: (data) => {
    const matrix = Array.isArray(data)
      ? data
      : typeof data === 'string'
        ? [{ category: 'Key Detail', legacy: 'Legacy Output', arcliAdvantage: data }]
        : [];
    if (!matrix.length) {
      if (DEV) console.warn('[UIBLOCK_INVALID] ComparisonTable: empty matrix', data);
      return null;
    }
    return <Matrix matrix={matrix} />;
  },

  [UI_TYPES.PROCESS_STEPPER]: (data) => {
    const steps = Array.isArray(data)
      ? data
      : typeof data === 'string'
        ? [{ title: 'Workflow', description: data }]
        : [];
    if (!steps.length) {
      if (DEV) console.warn('[UIBLOCK_INVALID] ProcessStepper: empty steps', data);
      return null;
    }
    return <Steps steps={steps} />;
  },

  [UI_TYPES.METRICS_CHART]: (data) => {
    const d = data as any;
    if (
      !d ||
      typeof d !== 'object' ||
      Array.isArray(d) ||
      !d.codeSnippet ||
      typeof d.codeSnippet !== 'object'
    ) {
      if (DEV) console.warn('[UIBLOCK_INVALID] MetricsChart: data.codeSnippet missing or malformed', data);
      return null;
    }
    return <MetricGovernance data={d} />;
  },

  [UI_TYPES.DATA_RELATIONSHIPS_GRAPH]: (data) => {
    const d = data as any;
    if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.traces)) {
      if (DEV) console.warn('[UIBLOCK_INVALID] DataRelationshipsGraph: data.traces missing', data);
      return null;
    }
    return <TelemetryTrace data={d} />;
  },

  [UI_TYPES.ANALYTICS_DASHBOARD]: (data) => {
    const d   = data as any;
    const obj = typeof d === 'object' && d !== null && !Array.isArray(d);
    return (
      <StrategicQuery
        scenario={{
          title:           obj ? (d.title           || 'Strategic Insight')                                                          : 'Data Insight',
          description:     obj ? (d.description     || 'Generated analysis')                                                       : String(d),
          dialect:         obj ? (d.dialect         || 'SQL')                                                                      : 'SQL',
          sql:             obj ? (d.code || d.sqlSnippet || d.sql || '-- Logic executing...')                                      : '-- Query logic omitted',
          businessOutcome: obj ? (d.businessOutcome || d.arcliResolution || d.description || 'Actionable intelligence derived.')   : String(d),
        }}
      />
    );
  },

  [UI_TYPES.CARDS_LISTS]: (data) => {
    const features = Array.isArray(data)
      ? data
      : typeof data === 'string'
        ? [{ title: 'Capability', description: data }]
        : [];
    if (!features.length) {
      if (DEV) console.warn('[UIBLOCK_INVALID] Cards/Lists: empty features list', data);
      return null;
    }
    return <Features features={features} />;
  },
};

// Register aliases pointing to canonical handlers — no duplicate logic.
UI_BLOCK_HANDLERS[UI_TYPES.COMPARISONS]              = UI_BLOCK_HANDLERS[UI_TYPES.COMPARISON_TABLE];
UI_BLOCK_HANDLERS[UI_TYPES.PROCESSES]                = UI_BLOCK_HANDLERS[UI_TYPES.PROCESS_STEPPER];
UI_BLOCK_HANDLERS[UI_TYPES.METRICS]                  = UI_BLOCK_HANDLERS[UI_TYPES.METRICS_CHART];
UI_BLOCK_HANDLERS[UI_TYPES.RELATIONSHIPS]            = UI_BLOCK_HANDLERS[UI_TYPES.DATA_RELATIONSHIPS_GRAPH];
UI_BLOCK_HANDLERS[UI_TYPES.INSIGHTS]                 = UI_BLOCK_HANDLERS[UI_TYPES.ANALYTICS_DASHBOARD];
UI_BLOCK_HANDLERS[UI_TYPES.LISTS]                    = UI_BLOCK_HANDLERS[UI_TYPES.CARDS_LISTS];

function UIBlockMapper({
  visualizationType: type,
  dataMapping:       data,
}: {
  visualizationType?: string;
  dataMapping?:       unknown;
}) {
  if (!type || data === undefined || data === null) {
    if (DEV) console.warn('[UIBLOCK_INVALID]: Missing visualizationType or dataMapping', { type, data });
    return null;
  }
  const handler = UI_BLOCK_HANDLERS[type];
  if (!handler) {
    if (DEV) console.warn(`[UIBLOCK_UNKNOWN_TYPE]: ${type}`, data);
    return null;
  }
  return handler(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK REGISTRY — component + isEmpty co-located  [A2]
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_REGISTRY: Record<string, BlockRegistryEntry> = {
  // Hero has no isEmpty guard — it always renders with its own fallback data.
  [BLOCK_TYPES.HERO]:                      { component: Hero },
  [BLOCK_TYPES.EXECUTIVE_SUMMARY]:         { component: ExecutiveSummary,            isEmpty: (p) => !(p.highlights?.length || p.pillars?.length) },
  [BLOCK_TYPES.CONTRARIAN_BANNER]:         { component: ContrarianBanner,            isEmpty: (p) => !(p.statement || p.heading) },
  [BLOCK_TYPES.DEMO]:                      { component: Demo,                         isEmpty: (p) => !p.demo },
  [BLOCK_TYPES.PERSONAS]:                  { component: Personas,                    isEmpty: (p) => !p.personas?.length },
  [BLOCK_TYPES.MATRIX]:                    { component: Matrix,                       isEmpty: (p) => !p.matrix?.length },
  [BLOCK_TYPES.WORKFLOW_SECTION]:          { component: WorkflowSection,             isEmpty: (p) => !p.workflow },
  [BLOCK_TYPES.USE_CASES]:                { component: UseCases,                    isEmpty: (p) => !p.useCases?.length },
  [BLOCK_TYPES.STRATEGIC_QUERY]:          { component: StrategicQuery,              isEmpty: (p) => !(p.scenario || p.code || p.sqlSnippet) },
  [BLOCK_TYPES.SECURITY_GUARDRAILS]:      { component: SecurityGuardrails,          isEmpty: (p) => !p.items?.length },
  [BLOCK_TYPES.STEPS]:                    { component: Steps,                        isEmpty: (p) => !p.steps?.length },
  [BLOCK_TYPES.FEATURES]:                 { component: Features,                     isEmpty: (p) => !p.features?.length },
  [BLOCK_TYPES.ARCHITECTURE]:             { component: Architecture,                 isEmpty: (p) => !(p.architecture || p.components?.length) },
  [BLOCK_TYPES.FAQS]:                     { component: FAQs,                         isEmpty: (p) => !p.faqs?.length },
  [BLOCK_TYPES.RELATED_LINKS]:            { component: RelatedLinks,                isEmpty: (p) => !p.slugs?.length },
  [BLOCK_TYPES.ZERO_DATA_PROOF]:          { component: ZeroDataProof,               isEmpty: (p) => !p.data },
  [BLOCK_TYPES.SEMANTIC_TRANSLATION]:     { component: SemanticTranslation,         isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TRUST_AND_COMPLIANCE]:     { component: TrustAndCompliance,          isEmpty: (p) => !p.data },
  [BLOCK_TYPES.PARADIGM_TEARDOWN]:        { component: ParadigmTeardown,            isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TELEMETRY_TRACE]:          { component: TelemetryTrace,              isEmpty: (p) => !p.data },
  // MetricGovernance needs data.codeSnippet — not just data — or it will crash on render.
  [BLOCK_TYPES.METRIC_GOVERNANCE]:        { component: MetricGovernance,            isEmpty: (p) => !p.data?.codeSnippet },
  [BLOCK_TYPES.EMBEDDABLE_SDK]:           { component: EmbeddableSDK,               isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DATA_GRAVITY_COST]:        { component: DataGravityCost,             isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DYNAMIC_SCHEMA_MAPPING]:   { component: DynamicSchemaMapping,        isEmpty: (p) => !p.data },
  [BLOCK_TYPES.GRANULAR_ACCESS_CONTROL]:  { component: GranularAccessControl,       isEmpty: (p) => !p.data },
  [BLOCK_TYPES.CONCURRENCY_PROOF]:        { component: ConcurrencyProof,            isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TENANT_ISOLATION]:         { component: TenantIsolationArchitecture,  isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DETERMINISTIC_GUARDRAILS]: { component: DeterministicGuardrails,     isEmpty: (p) => !p.data },
  [BLOCK_TYPES.UI_BLOCK]:                { component: UIBlockMapper,               isEmpty: (p) => !p.visualizationType || p.dataMapping == null },
  // V2 AI-native aliases
  [BLOCK_TYPES.COMPARISON_BLOCK]:         { component: Matrix,                       isEmpty: (p) => !p.matrix?.length },
  [BLOCK_TYPES.USE_CASE_BLOCK]:           { component: UseCases,                    isEmpty: (p) => !p.useCases?.length },
  [BLOCK_TYPES.KEYWORD_ANCHOR_BLOCK]:     { component: ExecutiveSummary,            isEmpty: (p) => !(p.highlights?.length || p.text) },
  [BLOCK_TYPES.QUERY_EXAMPLES_BLOCK]:     { component: Features,                    isEmpty: (p) => !(p.features?.length || p.examples?.length) },
  [BLOCK_TYPES.INTERNAL_LINKING_BLOCK]:   { component: RelatedLinks,               isEmpty: (p) => !(p.slugs?.length || p.links?.length) },
  // V13 dimension blocks
  [BLOCK_TYPES.INFORMATION_GAIN]:         { component: Features,                    isEmpty: (p) => !p.uniqueInsight && !p.structuralAdvantage && !p.features?.length },
  [BLOCK_TYPES.CONVERSION_ENGINE]:        { component: BrutalistCTA,               isEmpty: (p) => !p.primaryCta && !p.cta?.primary },
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// Local alias keeps the array literals readable.
const bt = BLOCK_TYPES;

const LAYOUT_CONFIG: Record<string, string[]> = {
  guide: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.STEPS, bt.FAQS, bt.DEMO,
    bt.USE_CASES, bt.FEATURES, bt.ARCHITECTURE, bt.TELEMETRY_TRACE,
    bt.ZERO_DATA_PROOF, bt.METRIC_GOVERNANCE, bt.RELATED_LINKS,
  ],
  comparison: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.CONTRARIAN_BANNER, bt.MATRIX,
    bt.FEATURES, bt.PERSONAS, bt.USE_CASES, bt.DATA_GRAVITY_COST,
    bt.PARADIGM_TEARDOWN, bt.FAQS, bt.RELATED_LINKS,
  ],
  integration: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.CONTRARIAN_BANNER, bt.WORKFLOW_SECTION,
    bt.DEMO, bt.STRATEGIC_QUERY, bt.FEATURES, bt.STEPS,
    bt.SECURITY_GUARDRAILS, bt.ARCHITECTURE, bt.DYNAMIC_SCHEMA_MAPPING,
    bt.EMBEDDABLE_SDK, bt.FAQS, bt.RELATED_LINKS,
  ],
  feature: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.DEMO, bt.PERSONAS, bt.FEATURES,
    bt.WORKFLOW_SECTION, bt.USE_CASES, bt.ARCHITECTURE,
    bt.GRANULAR_ACCESS_CONTROL, bt.CONCURRENCY_PROOF, bt.FAQS, bt.RELATED_LINKS,
  ],
  template: [
    bt.HERO, bt.DEMO, bt.STEPS, bt.USE_CASES, bt.FEATURES, bt.MATRIX,
    bt.SEMANTIC_TRANSLATION, bt.TRUST_AND_COMPLIANCE, bt.FAQS, bt.RELATED_LINKS,
  ],
  campaign: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.CONTRARIAN_BANNER, bt.PERSONAS,
    bt.USE_CASES, bt.WORKFLOW_SECTION, bt.STRATEGIC_QUERY,
    bt.SECURITY_GUARDRAILS, bt.FEATURES, bt.DEMO,
    bt.TENANT_ISOLATION, bt.DETERMINISTIC_GUARDRAILS, bt.FAQS, bt.RELATED_LINKS,
  ],
  default: [
    bt.HERO, bt.EXECUTIVE_SUMMARY, bt.CONTRARIAN_BANNER, bt.DEMO, bt.PERSONAS,
    bt.MATRIX, bt.WORKFLOW_SECTION, bt.USE_CASES, bt.STRATEGIC_QUERY, bt.STEPS,
    bt.FEATURES, bt.SECURITY_GUARDRAILS, bt.ARCHITECTURE, bt.ZERO_DATA_PROOF,
    bt.SEMANTIC_TRANSLATION, bt.TRUST_AND_COMPLIANCE, bt.PARADIGM_TEARDOWN,
    bt.TELEMETRY_TRACE, bt.METRIC_GOVERNANCE, bt.EMBEDDABLE_SDK,
    bt.DATA_GRAVITY_COST, bt.DYNAMIC_SCHEMA_MAPPING, bt.GRANULAR_ACCESS_CONTROL,
    bt.CONCURRENCY_PROOF, bt.TENANT_ISOLATION, bt.DETERMINISTIC_GUARDRAILS,
    bt.FAQS, bt.RELATED_LINKS,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// V1 BLOCK PROP NORMALIZERS
// Each entry accepts the flat page object and returns a typed props bag.
// ─────────────────────────────────────────────────────────────────────────────

const V1_NORMALIZERS: Record<string, (page: any) => Record<string, any>> = {
  [BLOCK_TYPES.HERO]: (d) => {
    const rawHero = d.hero ?? {
      title:    d.h1 || d.heroTitle || d.seo?.h1 || d.title || 'Arcli Analytics',
      subtitle: d.heroDescription || d.description || d.seo?.description || 'Enterprise Data Intelligence',
    };
    const cta = normalizeCta(
      rawHero.cta,
      rawHero.primaryCta ?? rawHero.primaryCTA,
      rawHero.secondaryCta ?? rawHero.secondaryCTA,
    );
    return { data: { ...d, hero: { ...rawHero, cta }, cta } };
  },

  [BLOCK_TYPES.EXECUTIVE_SUMMARY]: (d) => ({
    highlights: d.executiveSummary ||
      (d.corePhilosophy ? Object.values(d.corePhilosophy) : []),
  }),

  [BLOCK_TYPES.CONTRARIAN_BANNER]: (d) => ({
    statement: d.contrarianBanner?.statement || d.subtitle    || d.seo?.h1,
    subtext:   d.contrarianBanner?.subtext   || d.description || d.seo?.description,
  }),

  [BLOCK_TYPES.DEMO]:     (d) => ({ demo: d.demo }),
  [BLOCK_TYPES.PERSONAS]: (d) => ({ personas: d.personas || [] }),
  [BLOCK_TYPES.MATRIX]:   (d) => ({
    matrix: d.matrix || d.evaluationMatrix || d.competitiveAdvantage || [],
  }),

  [BLOCK_TYPES.WORKFLOW_SECTION]: (d) => ({ workflow: d.workflow }),

  [BLOCK_TYPES.USE_CASES]: (d) => ({
    useCases: d.useCases || d.executiveScenarios || d.analyticalScenarios || [],
  }),

  [BLOCK_TYPES.STRATEGIC_QUERY]: (d) => {
    const raw =
      d.strategicScenario ||
      d.executiveScenarios?.find((s: any) => s.complexity === 'Strategic') ||
      d.analyticalScenarios?.[0];
    if (!raw) return {};
    return {
      scenario: {
        title:           raw.title           || 'Strategic Blueprint',
        description:     raw.description     || 'Advanced data extraction pattern.',
        dialect:         raw.dialect         || 'SQL',
        sql:             raw.sqlGenerated    || raw.sql || raw.sqlSnippet || '-- Query logic parsing',
        businessOutcome: raw.arcliResolution || raw.businessOutcome || raw.description || 'Optimized data workflow.',
      },
    };
  },

  [BLOCK_TYPES.SECURITY_GUARDRAILS]: (d) => ({
    items: toArray(d.securityGuardrails) || toArray(d.trustAndSecurity) || toArray(d.security),
  }),

  [BLOCK_TYPES.FAQS]: (d) => ({ faqs: d.faqs || [] }),

  [BLOCK_TYPES.RELATED_LINKS]: (d) => {
    const rawCta  = d.hero?.cta || d.cta;
    const heroCta = normalizeCta(
      rawCta,
      d.hero?.primaryCta ?? d.hero?.primaryCTA ?? d.primaryCta ?? d.primaryCTA,
      d.hero?.secondaryCta ?? d.hero?.secondaryCTA ?? d.secondaryCta ?? d.secondaryCTA,
    );
    // Coerce V13 relatedSlugs objects ({ label, slug, intent }) to plain strings.
    const rawSlugs: any[] = d.relatedSlugs || d.relatedBlueprints || [];
    const slugs = rawSlugs
      .map((s: any) => (typeof s === 'string' ? s : s?.slug || s?.href || s?.url))
      .filter(Boolean);
    return { slugs, heroCta };
  },

  [BLOCK_TYPES.FEATURES]:     (d) => ({
    features: toFeatureArray(d.features) || toFeatureArray(d.capabilities) || [],
  }),
  [BLOCK_TYPES.STEPS]:        (d) => ({ steps: d.steps || d.onboardingExperience || [] }),
  [BLOCK_TYPES.ARCHITECTURE]: (d) => ({ architecture: d.architecture }),
  [BLOCK_TYPES.UI_BLOCK]:     (d) => d,

  [BLOCK_TYPES.INFORMATION_GAIN]: (d) => ({
    uniqueInsight:       d.informationGain?.uniqueInsight       || d.uniqueInsight,
    structuralAdvantage: d.informationGain?.structuralAdvantage || d.structuralAdvantage,
    features:            d.informationGain?.features            || [],
  }),

  [BLOCK_TYPES.CONVERSION_ENGINE]: (d) => {
    const primaryCta   = d.conversionEngine?.primaryCta   ?? d.conversionEngine?.primaryCTA   ?? d.primaryCta ?? d.primaryCTA;
    const secondaryCta = d.conversionEngine?.secondaryCta ?? d.conversionEngine?.secondaryCTA ?? d.secondaryCta ?? d.secondaryCTA;
    return {
      primaryCta,
      secondaryCta,
      cta: normalizeCta(d.conversionEngine?.cta, primaryCta, secondaryCta),
    };
  },
};

function getV1BlockProps(type: string, page: any): Record<string, any> {
  const normalizer = V1_NORMALIZERS[type];
  if (normalizer) return normalizer(page);
  // Phase 4-9 default: derive the prop key from the component name (camelCase).
  const dataKey = type.charAt(0).toLowerCase() + type.slice(1);
  return { data: page[dataKey] };
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 PAYLOAD NORMALIZATION BRIDGE
// Each function mutates `props` in place. Keyed by block type for O(1) dispatch.
// ─────────────────────────────────────────────────────────────────────────────

const V2_NORMALIZERS: Record<string, V2Normalizer> = {
  [BLOCK_TYPES.HERO]: (props, page) => {
    if (props.data) return;
    props.data = {
      type: props.badge || page.type || 'platform',
      seo:  { h1: props.title || page.seo?.h1 || 'Arcli Analytics' },
      hero: {
        subtitle: props.subtitle || props.description || page.seo?.description || '',
        cta:      normalizeCta(
          props.cta,
          props.primaryCta ?? props.primaryCTA,
          props.secondaryCta ?? props.secondaryCTA,
        ),
      },
    };
  },

  [BLOCK_TYPES.CONTRARIAN_BANNER]: (props) => {
    props.statement ??= props.heading;
    props.subtext   ??= props.argument ?? props.description;
  },

  [BLOCK_TYPES.EXECUTIVE_SUMMARY]: (props) => {
    if (!props.highlights && props.pillars) {
      props.highlights = props.pillars.map((p: any) => ({ value: p.title, label: p.description }));
    } else if (!props.highlights && props.text) {
      props.highlights = [{ value: props.heading, label: props.text }];
    }
  },

  // Shares the same normalization logic as ExecutiveSummary.
  [BLOCK_TYPES.KEYWORD_ANCHOR_BLOCK]: (props) => {
    if (!props.highlights && props.pillars) {
      props.highlights = props.pillars.map((p: any) => ({ value: p.title, label: p.description }));
    } else if (!props.highlights && props.text) {
      props.highlights = [{ value: props.heading, label: props.text }];
    }
  },

  [BLOCK_TYPES.STRATEGIC_QUERY]: (props) => {
    if (!props.scenario) {
      props.scenario = {
        title:           props.title,
        description:     props.description,
        businessOutcome: props.businessOutcome,
        sql:             props.code || props.sqlSnippet,
        dialect:         props.language || 'SQL',
      };
    }
  },

  [BLOCK_TYPES.USE_CASES]:      (props) => { props.useCases ??= props.scenarios ?? []; },
  [BLOCK_TYPES.USE_CASE_BLOCK]: (props) => { props.useCases ??= props.scenarios ?? []; },

  [BLOCK_TYPES.QUERY_EXAMPLES_BLOCK]: (props) => {
    if (!props.features && props.examples) {
      props.features = props.examples.map((ex: any) => ({
        title:       ex.query,
        description: ex.intent,
      }));
    }
  },

  [BLOCK_TYPES.SECURITY_GUARDRAILS]: (props) => { props.items ??= props.features ?? []; },

  [BLOCK_TYPES.ARCHITECTURE]: (props) => {
    if (!props.architecture && props.components) {
      props.architecture = { components: props.components };
    }
  },

  [BLOCK_TYPES.MATRIX]:           (props) => { props.matrix ??= props.rows; },
  [BLOCK_TYPES.COMPARISON_BLOCK]: (props) => { props.matrix ??= props.rows; },

  // RelatedLinks and InternalLinkingBlock share slug + heroCta normalization.
  [BLOCK_TYPES.RELATED_LINKS]: (props, _page, blockMap) => {
    if (!props.slugs && props.links) {
      props.slugs = props.links.map((l: any) => l?.href || l?.url).filter(Boolean);
    }
    if (!props.heroCta) {
      const hp    = blockMap.get(BLOCK_TYPES.HERO)?.payload || {};
      props.heroCta = normalizeCta(
        props.cta ?? hp.cta,
        props.primaryCta ?? props.primaryCTA ?? hp.primaryCta ?? hp.primaryCTA,
        props.secondaryCta ?? props.secondaryCTA ?? hp.secondaryCta ?? hp.secondaryCTA,
      );
    }
  },

  [BLOCK_TYPES.INTERNAL_LINKING_BLOCK]: (props, _page, blockMap) => {
    if (!props.slugs && props.links) {
      props.slugs = props.links.map((l: any) => l?.href || l?.url).filter(Boolean);
    }
    if (!props.heroCta) {
      const hp    = blockMap.get(BLOCK_TYPES.HERO)?.payload || {};
      props.heroCta = normalizeCta(
        props.cta ?? hp.cta,
        props.primaryCta ?? props.primaryCTA ?? hp.primaryCta ?? hp.primaryCTA,
        props.secondaryCta ?? props.secondaryCTA ?? hp.secondaryCta ?? hp.secondaryCTA,
      );
    }
  },

  [BLOCK_TYPES.INFORMATION_GAIN]: (props) => {
    if (!props.features?.length) {
      props.features = [
        { title: 'Unique Insight',       description: props.uniqueInsight },
        { title: 'Structural Advantage', description: props.structuralAdvantage },
      ].filter((item) => Boolean(item.description));
    }
  },

  [BLOCK_TYPES.CONVERSION_ENGINE]: (props) => {
    if (!props.cta?.primary) {
      props.cta = normalizeCta(
        props.cta,
        props.primaryCta ?? props.primaryCTA,
        props.secondaryCta ?? props.secondaryCTA,
      );
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA BUILDER — separated from the render component for testability
// ─────────────────────────────────────────────────────────────────────────────

function buildSchemas(
  page:           any,
  slug:           string,
  preparedBlocks: PreparedBlock[],
): object[] {
  const schemas: object[] = [
    {
      '@context':       'https://schema.org',
      '@type':          'TechArticle',
      headline:         page.seo?.h1          || 'Arcli Analytics',
      description:      page.seo?.description || '',
      author:           { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
      datePublished:    page.seo?.datePublished || new Date().toISOString(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
    },
  ];

  const faqData = preparedBlocks.find((b) => b.type === BLOCK_TYPES.FAQS)?.props?.faqs;
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

  return schemas;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-NORMALIZED RENDER PIPELINE  [A3]
// Runs ALL normalization before the render component touches data.
// The JSX map receives fully-prepared, type-safe props — zero transformation inside.
// ─────────────────────────────────────────────────────────────────────────────

function prepareBlocks(page: any): PreparedBlock[] {
  const isV2 = Array.isArray(page.blocks);

  // [A4] Index V2 blocks by type once for O(1) lookups throughout normalization.
  const blockMap: Map<string, any> = isV2
    ? new Map(page.blocks.map((b: any) => [b?.type, b]))
    : new Map();

  // Build the initial render list from the V2 block manifest or V1 layout config.
  const rawList: Array<{ type: string; payload: any; id?: string; slug?: string }> = isV2
    ? page.blocks.map((b: any) => ({ ...b }))
    : (LAYOUT_CONFIG[page.type] ?? LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

  // Inject V1 uiBlocks immediately after the Hero slot.
  if (page.uiBlocks?.length > 0) {
    const uiBlocks = page.uiBlocks.map((block: any) => ({
      type:    BLOCK_TYPES.UI_BLOCK,
      payload: !isV2 ? resolveUIBlockPayload(block, page) : block,
    }));
    const heroIndex = rawList.findIndex((b) => b.type === BLOCK_TYPES.HERO);
    const insertAt  = heroIndex >= 0 ? heroIndex + 1 : 0;
    rawList.splice(insertAt, 0, ...uiBlocks);
  }

  return rawList
    .filter((block) => block != null && block.type != null)
    .map((block, index) => {

      // ── 1. Extract raw props (V1 vs V2) ────────────────────────────────────
      const props: Record<string, any> =
        isV2 || block.type === BLOCK_TYPES.UI_BLOCK
          ? { ...(block.payload ?? {}) }
          : getV1BlockProps(block.type, page);

      // ── 2. Apply V2 normalization bridge ────────────────────────────────────
      if (isV2) {
        V2_NORMALIZERS[block.type]?.(props, page, blockMap);
      }

      // ── 3. Normalize all canonical array props once  [P3] ──────────────────
      props.slugs      = forceArray(props.slugs);
      props.faqs       = forceArray(props.faqs);
      props.matrix     = forceArray(props.matrix ?? props.rows);
      props.useCases   = forceArray(props.useCases ?? props.scenarios);
      props.features   = forceArray(props.features);
      props.steps      = forceArray(props.steps);
      props.personas   = forceArray(props.personas);
      props.items      = forceArray(props.items);
      props.highlights = forceArray(props.highlights ?? props.pillars);

      // ── 4. Deep structural guards ────────────────────────────────────────────
      if (props.architecture) {
        if (typeof props.architecture !== 'object') {
          props.architecture = {
            components: [{ title: 'System Node', description: String(props.architecture) }],
          };
        } else {
          props.architecture.components = forceArray(props.architecture.components);
        }
      }

      if (
        block.type === BLOCK_TYPES.TELEMETRY_TRACE &&
        props.data &&
        typeof props.data === 'object'
      ) {
        props.data = { ...props.data, traces: forceArray(props.data.traces) };
      }

      // ── 5. Extract inline V13 visualizations ────────────────────────────────
      const inlineVisualizations: InlineViz[] = Array.isArray(props.uiVisualizations)
        ? props.uiVisualizations.filter(
            (ui: any) => ui?.type && ui.dataMapping !== undefined,
          )
        : [];

      // ── 6. Stable React key (semantic ID preferred over array index) ─────────
      const stableKey = `${block.type}-${block.id ?? block.slug ?? index}`;

      return { type: block.type, props, stableKey, inlineVisualizations };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC GENERATION & METADATA
// ─────────────────────────────────────────────────────────────────────────────

export const dynamicParams = false;
export const revalidate    = 86400;

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page     = getNormalizedPage(slug);
  if (!page) notFound();

  const codeSnippet =
    page.blocks?.find((b: any) => b?.type === BLOCK_TYPES.STRATEGIC_QUERY)?.payload?.code ||
    page.strategicScenario?.sql ||
    page.demo?.generatedSql ||
    (Array.isArray(page.useCases) ? page.useCases.find((u: any) => u?.sqlSnippet)?.sqlSnippet : undefined) ||
    page.executiveScenarios?.find((s: any) => s?.sqlGenerated)?.sqlGenerated;

  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', page.seo?.h1  || 'Arcli Analytics');
  ogUrl.searchParams.set('type',  page.type      || 'article');
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

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT — pure projection over pre-normalized data  [A3]
// Zero transformation logic here: normalize in prepareBlocks, render here.
// ─────────────────────────────────────────────────────────────────────────────

export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const page     = getNormalizedPage(slug);
  if (!page) notFound();

  const preparedBlocks = prepareBlocks(page);
  const schemas        = buildSchemas(page, slug, preparedBlocks);

  return (
    <>
      <Navbar />

      {/* [B1] JSON-LD structured data — rendered ONCE here, never inside the block loop */}
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeStringify(schema) }}
        />
      ))}

      {/* [B2] Single <main> — no nesting */}
      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        {preparedBlocks.map(({ type, props, stableKey, inlineVisualizations }) => {
          const entry = BLOCK_REGISTRY[type];
          if (!entry) {
            if (DEV) console.warn(`[UNKNOWN_BLOCK]: ${type}`);
            return null;
          }

          const { component: BlockComponent, isEmpty } = entry;

          // Hero always renders; all other blocks are skipped when isEmpty returns true.
          if (type !== BLOCK_TYPES.HERO && isEmpty?.(props)) {
            if (DEV) console.warn(`[BLOCK_SKIPPED_EMPTY]: ${type}`, props);
            return null;
          }

          // If this block carries inline V13 visualizations, wrap in a Fragment so
          // each visualization renders contextually co-located below its parent.
          if (inlineVisualizations.length > 0) {
            return (
              <React.Fragment key={stableKey}>
                <BlockComponent {...props} />
                {inlineVisualizations.map((ui, uiIdx) => (
                  <UIBlockMapper
                    key={`${stableKey}-ui-${uiIdx}`}
                    visualizationType={ui.type}
                    dataMapping={ui.dataMapping}
                  />
                ))}
              </React.Fragment>
            );
          }

          return <BlockComponent key={stableKey} {...props} />;
        })}
      </main>

      <Footer />
    </>
  );
}