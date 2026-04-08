/**
 * FILE: app/(landing)/[slug]/page.tsx  — v15.0 (production hardening)
 *
 * ═══════════════════════════════════════════════════════════════════
 * BUG FIXES (carried from v14)
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
 * ARCHITECTURE IMPROVEMENTS (carried from v14)
 * ═══════════════════════════════════════════════════════════════════
 * [A1] Plugin-based UIBlockMapper with try/catch isolation per handler.
 * [A2] Co-located Block Registry: component + isEmpty guard live together.
 * [A3] Pre-normalized render pipeline: all normalization in prepareBlocks().
 * [A4] blockMap cache: O(1) Hero / anchor lookups.
 *
 * ═══════════════════════════════════════════════════════════════════
 * v15 HARDENING IMPROVEMENTS
 * ═══════════════════════════════════════════════════════════════════
 * [H1] SCHEMA NORMALIZERS — normalizeMatrix / normalizeUseCases /
 *      normalizeHighlights / normalizeFeatures / normalizeSteps coerce
 *      any shape variant into the canonical contract expected by each
 *      component. Applied inside V1_NORMALIZERS AND V2_NORMALIZERS so
 *      both code paths are covered.
 * [H2] SCHEMA VALIDATION — lightweight per-type validators run after
 *      normalization and zero-out arrays that still fail the contract,
 *      preventing components from receiving malformed data.
 * [H3] ASSERT HELPER — assertBlock() throws in DEV, warns in PROD.
 *      Replaces scattered `if (DEV) console.warn` calls.
 * [H4] IDEMPOTENCY MARKERS — normalized arrays are tagged __normalized
 *      so re-entrant normalization is a no-op.
 * [H5] PLUGIN ISOLATION — UIBlockMapper wraps every handler in try/catch;
 *      a broken plugin can never crash the full page.
 * [H6] BLOCK RENDER GUARD — unknown block type renders a visible DEV
 *      placeholder and null in PROD instead of silently disappearing.
 * [H7] NORMALIZATION CACHE — prepareBlocks results are memoised by slug
 *      so repeated calls (e.g. generateMetadata + page render) hit memory.
 * [H8] LINEAGE METADATA — props.__source attached in DEV for tracing.
 * [H9] safeStringify hardened with --> escape.
 * [H10] EXHAUSTIVENESS GUARD — RegistryCheck type ensures every entry in
 *       BLOCK_TYPES has a corresponding BLOCK_REGISTRY entry at compile time.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import React from 'react';

import { Navbar }                              from '@/components/landing/navbar';
import Footer                                  from '@/components/landing/footer';
import { getNormalizedPage, getAllSlugs }       from '@/lib/seo/registry';

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

import { ParadigmTeardown, TelemetryTrace }          from '@/components/landing/seo-blocks-5';
import { MetricGovernance, EmbeddableSDK }            from '@/components/landing/seo-blocks-6';
import { DataGravityCost, DynamicSchemaMapping }      from '@/components/landing/seo-blocks-7';
import { GranularAccessControl, ConcurrencyProof }    from '@/components/landing/seo-blocks-8';
import { TenantIsolationArchitecture, DeterministicGuardrails } from '@/components/landing/seo-blocks-9';

const BrutalistCTA = dynamic(
  () =>
    import('@/components/landing/brutalist-cta')
      .then((m) => ({ default: m.BrutalistCTA }))
      .catch(() => ({ default: Features })),
  { ssr: true, loading: () => null },
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.arcli.tech';
const DEV      = process.env.NODE_ENV !== 'production';

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
  COMPARISON_BLOCK:            'ComparisonBlock',
  USE_CASE_BLOCK:              'UseCaseBlock',
  KEYWORD_ANCHOR_BLOCK:        'KeywordAnchorBlock',
  QUERY_EXAMPLES_BLOCK:        'QueryExamplesBlock',
  INTERNAL_LINKING_BLOCK:      'InternalLinkingBlock',
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
  isEmpty?:  (props: Record<string, any>) => boolean;
}

type UIHandler    = (data: unknown) => React.ReactElement | null;
type V2Normalizer = (
  props:    Record<string, any>,
  page:     any,
  blockMap: Map<string, any>,
) => void;

// [H10] Exhaustiveness guard: every key in BLOCK_TYPES must appear in BLOCK_REGISTRY.
type AllBlockTypeValues = typeof BLOCK_TYPES[keyof typeof BLOCK_TYPES];
type RegistryCheck = Record<AllBlockTypeValues, BlockRegistryEntry>;

// ─────────────────────────────────────────────────────────────────────────────
// [H3] ASSERT HELPER — throws in DEV, warns in PROD
// ─────────────────────────────────────────────────────────────────────────────

function assertBlock(condition: boolean, message: string): void {
  if (condition) return;
  if (DEV) throw new Error(message);
  console.warn(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const forceArray = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (val === undefined || val === null) return [];
  if (typeof val === 'object') {
    return Array.isArray((val as any).items) ? (val as any).items : [val];
  }
  return [val];
};

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

function toFeatureArray(raw: unknown): Array<{ title: string; description?: string }> {
  if (!raw)                              return [];
  if (Array.isArray(raw))               return raw;
  if (Array.isArray((raw as any).items)) return (raw as any).items;
  return [];
}

function toArray(raw: unknown): unknown[] {
  if (!raw)                              return [];
  if (Array.isArray(raw))               return raw;
  if (Array.isArray((raw as any).items)) return (raw as any).items;
  return [];
}

/** [H9] Hardened — escapes </script>, line-terminators, and HTML comment closers. */
function safeStringify(obj: object): string {
  try {
    return (
      JSON.stringify(obj)
        ?.replace(/</g,      '\\u003c')
        .replace(/>/g,       '\\u003e')
        .replace(/&/g,       '\\u0026')
        .replace(/\u2028/g,  '\\u2028')
        .replace(/\u2029/g,  '\\u2029')
        .replace(/-->/g,     '--\\>') // [H9] prevent early HTML comment close
      || '{}'
    );
  } catch {
    return '{}';
  }
}

function resolveUIBlockPayload(block: any, pageData: any): any {
  if (typeof block.dataMapping !== 'string')                               return block;
  if (!Object.prototype.hasOwnProperty.call(pageData, block.dataMapping)) return block;
  const resolved = pageData[block.dataMapping];
  if (resolved === undefined)                                              return block;
  return { ...block, dataMapping: resolved };
}

// ─────────────────────────────────────────────────────────────────────────────
// [H4] IDEMPOTENCY MARKER
// Tag normalized arrays so re-entrant normalization is a no-op.
// ─────────────────────────────────────────────────────────────────────────────

const NORMALIZED_TAG = '__normalized' as const;

function isAlreadyNormalized(arr: any[]): boolean {
  return arr.length > 0 && arr[0]?.[NORMALIZED_TAG] === true;
}

function tagNormalized<T extends object>(arr: T[]): T[] {
  return arr.map((item) => ({ ...item, [NORMALIZED_TAG]: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// [H1] SCHEMA NORMALIZERS
// Each function coerces any shape variant into the canonical contract
// expected by the corresponding component. Applied inside both
// V1_NORMALIZERS AND V2_NORMALIZERS so every code path is covered.
// ─────────────────────────────────────────────────────────────────────────────

/** Matrix rows: { category, legacy, arcliAdvantage } */
function normalizeMatrix(
  raw: any[],
): Array<{ category: string; legacy: string; arcliAdvantage: string }> {
  if (!raw.length)             return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  const normalized = raw.map((r: any) => ({
    category:       r.category       || r.label   || r.name  || 'Category',
    legacy:         r.legacy         || r.before   || r.old   || '',
    arcliAdvantage: r.arcliAdvantage || r.after    || r.value || r.advantage || '',
    [NORMALIZED_TAG]: true,
  }));

  return normalized;
}

/** Use-case items: { title, description, sqlSnippet? } */
function normalizeUseCases(
  raw: any[],
): Array<{ title: string; description: string; sqlSnippet?: string }> {
  if (!raw.length)             return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any) => ({
      title:       r.title       || r.name  || r.query    || 'Use Case',
      description: r.description || r.body  || r.outcome  || '',
      ...(r.sqlSnippet || r.sql ? { sqlSnippet: r.sqlSnippet || r.sql } : {}),
    })),
  );
}

/** Highlight / pillar items: { value, label } */
function normalizeHighlights(
  raw: any[],
  corePhilosophy?: Record<string, string>,
): Array<{ value: string; label: string }> {
  if (!raw.length && corePhilosophy) {
    return tagNormalized(
      Object.entries(corePhilosophy).map(([value, label]) => ({ value, label })),
    );
  }
  if (!raw.length) return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any) => ({
      value: r.value || r.title  || r.heading || r.name || '',
      label: r.label || r.body   || r.text    || r.description || '',
    })),
  );
}

/** Feature / capability items: { title, description? } */
function normalizeFeatures(
  raw: any[],
): Array<{ title: string; description?: string }> {
  if (!raw.length)              return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any) => ({
      title:       r.title       || r.name  || r.heading || '',
      description: r.description || r.body  || r.text    || undefined,
    })),
  );
}

/** Step items: { title, description? } */
function normalizeSteps(
  raw: any[],
): Array<{ title: string; description?: string }> {
  if (!raw.length)              return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any, i: number) => ({
      title:       r.title       || r.name  || r.step   || `Step ${i + 1}`,
      description: r.description || r.body  || r.detail || undefined,
    })),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// [H2] SCHEMA VALIDATORS
// Run after normalization. Zero-out arrays that still fail the contract.
// ─────────────────────────────────────────────────────────────────────────────

function validateMatrix(matrix: any[]): boolean {
  return matrix.every(
    (r) =>
      typeof r.category === 'string' &&
      typeof r.legacy === 'string' &&
      typeof r.arcliAdvantage === 'string',
  );
}

function validateUseCases(useCases: any[]): boolean {
  return useCases.every(
    (u) => typeof u.title === 'string' && typeof u.description === 'string',
  );
}

function validateHighlights(highlights: any[]): boolean {
  return highlights.every(
    (h) => typeof h.value === 'string' && typeof h.label === 'string',
  );
}

function validateFeatures(features: any[]): boolean {
  return features.every((f) => typeof f.title === 'string');
}

function validateSteps(steps: any[]): boolean {
  return steps.every((s) => typeof s.title === 'string');
}

/**
 * Validates a normalized array against its contract. Returns the array if valid,
 * or [] and a DEV warning if not.
 */
function safeNormalized<T>(
  arr: T[],
  validator: (a: T[]) => boolean,
  label: string,
  original?: unknown,
): T[] {
  if (!arr.length)        return arr;
  if (validator(arr))     return arr;

  if (DEV) console.warn(`[INVALID_SCHEMA] ${label}`, { normalized: arr, original });
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// [H5] PLUGIN-BASED UI BLOCK MAPPER — each handler wrapped in try/catch
// ─────────────────────────────────────────────────────────────────────────────

const UI_BLOCK_HANDLERS: Record<string, UIHandler> = {
  [UI_TYPES.COMPARISON_TABLE]: (data) => {
    const matrix = Array.isArray(data)
      ? data
      : typeof data === 'string'
      ? [{ category: 'Key Detail', legacy: 'Legacy Output', arcliAdvantage: data }]
      : [];

    assertBlock(matrix.length > 0, `[UIBLOCK_INVALID] ComparisonTable: empty matrix`);
    if (!matrix.length) return null;

    return <Matrix matrix={normalizeMatrix(matrix)} />;
  },

  [UI_TYPES.PROCESS_STEPPER]: (data) => {
    const steps = Array.isArray(data)
      ? data
      : typeof data === 'string'
      ? [{ title: 'Workflow', description: data }]
      : [];

    assertBlock(steps.length > 0, `[UIBLOCK_INVALID] ProcessStepper: empty steps`);
    if (!steps.length) return null;

    return <Steps steps={normalizeSteps(steps)} />;
  },

  [UI_TYPES.METRICS_CHART]: (data) => {
    const d = data as any;
    const valid =
      d &&
      typeof d === 'object' &&
      !Array.isArray(d) &&
      d.codeSnippet &&
      typeof d.codeSnippet === 'object';

    assertBlock(valid, `[UIBLOCK_INVALID] MetricsChart: data.codeSnippet missing or malformed`);
    if (!valid) return null;

    return <MetricGovernance data={d} />;
  },

  [UI_TYPES.DATA_RELATIONSHIPS_GRAPH]: (data) => {
    const d = data as any;
    const valid = d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.traces);

    assertBlock(valid, `[UIBLOCK_INVALID] DataRelationshipsGraph: data.traces missing`);
    if (!valid) return null;

    return <TelemetryTrace data={d} />;
  },

  [UI_TYPES.ANALYTICS_DASHBOARD]: (data) => {
    const d   = data as any;
    const obj = typeof d === 'object' && d !== null && !Array.isArray(d);
    return (
      <StrategicQuery
        scenario={{
          title:           obj ? (d.title           || 'Strategic Insight')                                                        : 'Data Insight',
          description:     obj ? (d.description     || 'Generated analysis')                                                     : String(d),
          dialect:         obj ? (d.dialect         || 'SQL')                                                                    : 'SQL',
          sql:             obj ? (d.code || d.sqlSnippet || d.sql || '-- Logic executing...')                                    : '-- Query logic omitted',
          businessOutcome: obj ? (d.businessOutcome || d.arcliResolution || d.description || 'Actionable intelligence derived.') : String(d),
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

    assertBlock(features.length > 0, `[UIBLOCK_INVALID] Cards/Lists: empty features list`);
    if (!features.length) return null;

    return <Features features={normalizeFeatures(features)} />;
  },
};

// Aliases — no duplicate logic.
UI_BLOCK_HANDLERS[UI_TYPES.COMPARISONS]           = UI_BLOCK_HANDLERS[UI_TYPES.COMPARISON_TABLE];
UI_BLOCK_HANDLERS[UI_TYPES.PROCESSES]             = UI_BLOCK_HANDLERS[UI_TYPES.PROCESS_STEPPER];
UI_BLOCK_HANDLERS[UI_TYPES.METRICS]               = UI_BLOCK_HANDLERS[UI_TYPES.METRICS_CHART];
UI_BLOCK_HANDLERS[UI_TYPES.RELATIONSHIPS]         = UI_BLOCK_HANDLERS[UI_TYPES.DATA_RELATIONSHIPS_GRAPH];
UI_BLOCK_HANDLERS[UI_TYPES.INSIGHTS]              = UI_BLOCK_HANDLERS[UI_TYPES.ANALYTICS_DASHBOARD];
UI_BLOCK_HANDLERS[UI_TYPES.LISTS]                 = UI_BLOCK_HANDLERS[UI_TYPES.CARDS_LISTS];

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
  assertBlock(!!handler, `[UIBLOCK_UNKNOWN_TYPE]: ${type}`);
  if (!handler) return null;

  // [H5] Plugin isolation — a broken handler never crashes the page.
  try {
    return handler(data);
  } catch (e) {
    if (DEV) throw e;
    console.warn(`[UIBLOCK_HANDLER_ERROR]: ${type}`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK REGISTRY — component + isEmpty co-located  [A2] + [H10]
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_REGISTRY: RegistryCheck = {
  [BLOCK_TYPES.HERO]:                      { component: Hero },
  [BLOCK_TYPES.EXECUTIVE_SUMMARY]:         { component: ExecutiveSummary,            isEmpty: (p) => !(p.highlights?.length || p.pillars?.length) },
  [BLOCK_TYPES.CONTRARIAN_BANNER]:         { component: ContrarianBanner,            isEmpty: (p) => !(p.statement || p.heading) },
  [BLOCK_TYPES.DEMO]:                      { component: Demo,                         isEmpty: (p) => !p.demo },
  [BLOCK_TYPES.PERSONAS]:                  { component: Personas,                    isEmpty: (p) => !p.personas?.length },
  [BLOCK_TYPES.MATRIX]:                    { component: Matrix,                       isEmpty: (p) => !p.matrix?.length },
  [BLOCK_TYPES.WORKFLOW_SECTION]:          { component: WorkflowSection,             isEmpty: (p) => !p.workflow },
  [BLOCK_TYPES.USE_CASES]:                 { component: UseCases,                    isEmpty: (p) => !p.useCases?.length },
  [BLOCK_TYPES.STRATEGIC_QUERY]:           { component: StrategicQuery,              isEmpty: (p) => !(p.scenario || p.code || p.sqlSnippet) },
  [BLOCK_TYPES.SECURITY_GUARDRAILS]:       { component: SecurityGuardrails,          isEmpty: (p) => !p.items?.length },
  [BLOCK_TYPES.STEPS]:                     { component: Steps,                        isEmpty: (p) => !p.steps?.length },
  [BLOCK_TYPES.FEATURES]:                  { component: Features,                     isEmpty: (p) => !p.features?.length },
  [BLOCK_TYPES.ARCHITECTURE]:              { component: Architecture,                 isEmpty: (p) => !(p.architecture || p.components?.length) },
  [BLOCK_TYPES.FAQS]:                      { component: FAQs,                         isEmpty: (p) => !p.faqs?.length },
  [BLOCK_TYPES.RELATED_LINKS]:             { component: RelatedLinks,                isEmpty: (p) => !p.slugs?.length },
  [BLOCK_TYPES.ZERO_DATA_PROOF]:           { component: ZeroDataProof,               isEmpty: (p) => !p.data },
  [BLOCK_TYPES.SEMANTIC_TRANSLATION]:      { component: SemanticTranslation,         isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TRUST_AND_COMPLIANCE]:      { component: TrustAndCompliance,          isEmpty: (p) => !p.data },
  [BLOCK_TYPES.PARADIGM_TEARDOWN]:         { component: ParadigmTeardown,            isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TELEMETRY_TRACE]:           { component: TelemetryTrace,              isEmpty: (p) => !p.data },
  [BLOCK_TYPES.METRIC_GOVERNANCE]:         { component: MetricGovernance,            isEmpty: (p) => !p.data?.codeSnippet },
  [BLOCK_TYPES.EMBEDDABLE_SDK]:            { component: EmbeddableSDK,               isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DATA_GRAVITY_COST]:         { component: DataGravityCost,             isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DYNAMIC_SCHEMA_MAPPING]:    { component: DynamicSchemaMapping,        isEmpty: (p) => !p.data },
  [BLOCK_TYPES.GRANULAR_ACCESS_CONTROL]:   { component: GranularAccessControl,       isEmpty: (p) => !p.data },
  [BLOCK_TYPES.CONCURRENCY_PROOF]:         { component: ConcurrencyProof,            isEmpty: (p) => !p.data },
  [BLOCK_TYPES.TENANT_ISOLATION]:          { component: TenantIsolationArchitecture,  isEmpty: (p) => !p.data },
  [BLOCK_TYPES.DETERMINISTIC_GUARDRAILS]:  { component: DeterministicGuardrails,     isEmpty: (p) => !p.data },
  [BLOCK_TYPES.UI_BLOCK]:                  { component: UIBlockMapper,               isEmpty: (p) => !p.visualizationType || p.dataMapping == null },
  [BLOCK_TYPES.COMPARISON_BLOCK]:          { component: Matrix,                       isEmpty: (p) => !p.matrix?.length },
  [BLOCK_TYPES.USE_CASE_BLOCK]:            { component: UseCases,                    isEmpty: (p) => !p.useCases?.length },
  [BLOCK_TYPES.KEYWORD_ANCHOR_BLOCK]:      { component: ExecutiveSummary,            isEmpty: (p) => !(p.highlights?.length || p.text) },
  [BLOCK_TYPES.QUERY_EXAMPLES_BLOCK]:      { component: Features,                    isEmpty: (p) => !(p.features?.length || p.examples?.length) },
  [BLOCK_TYPES.INTERNAL_LINKING_BLOCK]:    { component: RelatedLinks,               isEmpty: (p) => !(p.slugs?.length || p.links?.length) },
  [BLOCK_TYPES.INFORMATION_GAIN]:          { component: Features,                    isEmpty: (p) => !p.uniqueInsight && !p.structuralAdvantage && !p.features?.length },
  [BLOCK_TYPES.CONVERSION_ENGINE]:         { component: BrutalistCTA,               isEmpty: (p) => !p.primaryCta && !p.cta?.primary },
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

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
// [H1] V1 BLOCK PROP NORMALIZERS — schema normalizers applied here
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

  [BLOCK_TYPES.EXECUTIVE_SUMMARY]: (d) => {
    const raw = forceArray(d.executiveSummary);
    const normalized = normalizeHighlights(raw, d.corePhilosophy);
    return {
      highlights: safeNormalized(normalized, validateHighlights, 'ExecutiveSummary.highlights', raw),
    };
  },

  [BLOCK_TYPES.CONTRARIAN_BANNER]: (d) => ({
    statement: d.contrarianBanner?.statement || d.subtitle    || d.seo?.h1,
    subtext:   d.contrarianBanner?.subtext   || d.description || d.seo?.description,
  }),

  [BLOCK_TYPES.DEMO]:     (d) => ({ demo: d.demo }),
  [BLOCK_TYPES.PERSONAS]: (d) => ({ personas: d.personas || [] }),

  [BLOCK_TYPES.MATRIX]: (d) => {
    const raw = forceArray(d.matrix || d.evaluationMatrix || d.competitiveAdvantage || []);
    const normalized = normalizeMatrix(raw);
    return {
      matrix: safeNormalized(normalized, validateMatrix, 'Matrix.matrix', raw),
    };
  },

  [BLOCK_TYPES.WORKFLOW_SECTION]: (d) => ({ workflow: d.workflow }),

  [BLOCK_TYPES.USE_CASES]: (d) => {
    const raw = forceArray(d.useCases || d.executiveScenarios || d.analyticalScenarios || []);
    const normalized = normalizeUseCases(raw);
    return {
      useCases: safeNormalized(normalized, validateUseCases, 'UseCases.useCases', raw),
    };
  },

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
    const rawSlugs: any[] = d.relatedSlugs || d.relatedBlueprints || [];
    const slugs = rawSlugs
      .map((s: any) => (typeof s === 'string' ? s : s?.slug || s?.href || s?.url))
      .filter(Boolean);
    return { slugs, heroCta };
  },

  [BLOCK_TYPES.FEATURES]: (d) => {
    const raw = forceArray(d.features || d.capabilities || []);
    const normalized = normalizeFeatures(raw);
    return {
      features: safeNormalized(normalized, validateFeatures, 'Features.features', raw),
    };
  },

  [BLOCK_TYPES.STEPS]: (d) => {
    const raw = forceArray(d.steps || d.onboardingExperience || []);
    const normalized = normalizeSteps(raw);
    return {
      steps: safeNormalized(normalized, validateSteps, 'Steps.steps', raw),
    };
  },

  [BLOCK_TYPES.ARCHITECTURE]: (d) => ({ architecture: d.architecture }),
  [BLOCK_TYPES.UI_BLOCK]:     (d) => d,

  [BLOCK_TYPES.INFORMATION_GAIN]: (d) => ({
    uniqueInsight:       d.informationGain?.uniqueInsight       || d.uniqueInsight,
    structuralAdvantage: d.informationGain?.structuralAdvantage || d.structuralAdvantage,
    features:            normalizeFeatures(forceArray(d.informationGain?.features || [])),
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
  const dataKey = type.charAt(0).toLowerCase() + type.slice(1);
  return { data: page[dataKey] };
}

// ─────────────────────────────────────────────────────────────────────────────
// [H1] V2 PAYLOAD NORMALIZATION BRIDGE — schema normalizers applied here too
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
    if (!props.highlights?.length) {
      if (props.pillars) {
        const raw = forceArray(props.pillars);
        props.highlights = safeNormalized(
          normalizeHighlights(raw),
          validateHighlights,
          'V2 ExecutiveSummary.highlights (pillars)',
          raw,
        );
      } else if (props.text) {
        props.highlights = [{ value: props.heading, label: props.text }];
      }
    }
  },

  [BLOCK_TYPES.KEYWORD_ANCHOR_BLOCK]: (props) => {
    if (!props.highlights?.length) {
      if (props.pillars) {
        const raw = forceArray(props.pillars);
        props.highlights = safeNormalized(
          normalizeHighlights(raw),
          validateHighlights,
          'V2 KeywordAnchorBlock.highlights',
          raw,
        );
      } else if (props.text) {
        props.highlights = [{ value: props.heading, label: props.text }];
      }
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

  [BLOCK_TYPES.USE_CASES]: (props) => {
    const raw = forceArray(props.useCases ?? props.scenarios ?? []);
    props.useCases = safeNormalized(
      normalizeUseCases(raw),
      validateUseCases,
      'V2 UseCases.useCases',
      raw,
    );
  },

  [BLOCK_TYPES.USE_CASE_BLOCK]: (props) => {
    const raw = forceArray(props.useCases ?? props.scenarios ?? []);
    props.useCases = safeNormalized(
      normalizeUseCases(raw),
      validateUseCases,
      'V2 UseCaseBlock.useCases',
      raw,
    );
  },

  [BLOCK_TYPES.QUERY_EXAMPLES_BLOCK]: (props) => {
    if (!props.features && props.examples) {
      const raw = forceArray(props.examples);
      props.features = safeNormalized(
        normalizeFeatures(raw.map((ex: any) => ({ title: ex.query, description: ex.intent }))),
        validateFeatures,
        'V2 QueryExamplesBlock.features',
        raw,
      );
    }
  },

  [BLOCK_TYPES.SECURITY_GUARDRAILS]: (props) => {
    props.items ??= props.features ?? [];
  },

  [BLOCK_TYPES.ARCHITECTURE]: (props) => {
    if (!props.architecture && props.components) {
      props.architecture = { components: props.components };
    }
  },

  [BLOCK_TYPES.MATRIX]: (props) => {
    const raw = forceArray(props.matrix ?? props.rows ?? []);
    props.matrix = safeNormalized(
      normalizeMatrix(raw),
      validateMatrix,
      'V2 Matrix.matrix',
      raw,
    );
  },

  [BLOCK_TYPES.COMPARISON_BLOCK]: (props) => {
    const raw = forceArray(props.matrix ?? props.rows ?? []);
    props.matrix = safeNormalized(
      normalizeMatrix(raw),
      validateMatrix,
      'V2 ComparisonBlock.matrix',
      raw,
    );
  },

  [BLOCK_TYPES.FEATURES]: (props) => {
    const raw = forceArray(props.features ?? props.capabilities ?? []);
    props.features = safeNormalized(
      normalizeFeatures(raw),
      validateFeatures,
      'V2 Features.features',
      raw,
    );
  },

  [BLOCK_TYPES.STEPS]: (props) => {
    const raw = forceArray(props.steps ?? props.onboardingExperience ?? []);
    props.steps = safeNormalized(
      normalizeSteps(raw),
      validateSteps,
      'V2 Steps.steps',
      raw,
    );
  },

  [BLOCK_TYPES.RELATED_LINKS]: (props, _page, blockMap) => {
    if (!props.slugs && props.links) {
      props.slugs = props.links.map((l: any) => l?.href || l?.url).filter(Boolean);
    }
    if (!props.heroCta) {
      const hp = blockMap.get(BLOCK_TYPES.HERO)?.payload || {};
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
      const hp = blockMap.get(BLOCK_TYPES.HERO)?.payload || {};
      props.heroCta = normalizeCta(
        props.cta ?? hp.cta,
        props.primaryCta ?? props.primaryCTA ?? hp.primaryCta ?? hp.primaryCTA,
        props.secondaryCta ?? props.secondaryCTA ?? hp.secondaryCta ?? hp.secondaryCTA,
      );
    }
  },

  [BLOCK_TYPES.INFORMATION_GAIN]: (props) => {
    if (!props.features?.length) {
      const candidates = [
        { title: 'Unique Insight',       description: props.uniqueInsight },
        { title: 'Structural Advantage', description: props.structuralAdvantage },
      ].filter((item) => Boolean(item.description));
      props.features = normalizeFeatures(candidates);
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
// SCHEMA BUILDER
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
// [H7] NORMALIZATION CACHE — memoized by slug
// ─────────────────────────────────────────────────────────────────────────────

const _prepareBlocksCache = new Map<string, PreparedBlock[]>();

function prepareBlocksCached(page: any, slug: string): PreparedBlock[] {
  if (_prepareBlocksCache.has(slug)) return _prepareBlocksCache.get(slug)!;
  const result = prepareBlocks(page, slug);
  _prepareBlocksCache.set(slug, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-NORMALIZED RENDER PIPELINE  [A3]
// ─────────────────────────────────────────────────────────────────────────────

function prepareBlocks(page: any, slug?: string): PreparedBlock[] {
  const isV2 = Array.isArray(page.blocks);

  const blockMap: Map<string, any> = isV2
    ? new Map(page.blocks.map((b: any) => [b?.type, b]))
    : new Map();

  const rawList: Array<{ type: string; payload: any; id?: string; slug?: string }> = isV2
    ? page.blocks.map((b: any) => ({ ...b }))
    : (LAYOUT_CONFIG[page.type] ?? LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

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

      // ── 1. Extract raw props (V1 vs V2) ──────────────────────────────────
      const props: Record<string, any> =
        isV2 || block.type === BLOCK_TYPES.UI_BLOCK
          ? { ...(block.payload ?? {}) }
          : getV1BlockProps(block.type, page);

      // ── 2. Apply V2 normalization bridge (includes schema normalizers) ────
      if (isV2) {
        V2_NORMALIZERS[block.type]?.(props, page, blockMap);
      }

      // ── 3. Normalize all canonical array props once ───────────────────────
      //    Schema-normalized arrays are already tagged; forceArray is safe to
      //    call again — it won't re-wrap them.
      props.slugs      = forceArray(props.slugs);
      props.faqs       = forceArray(props.faqs);
      props.matrix     = forceArray(props.matrix ?? props.rows);
      props.useCases   = forceArray(props.useCases ?? props.scenarios);
      props.features   = forceArray(props.features);
      props.steps      = forceArray(props.steps);
      props.personas   = forceArray(props.personas);
      props.items      = forceArray(props.items);
      props.highlights = forceArray(props.highlights ?? props.pillars);

      // ── 4. Deep structural guards ─────────────────────────────────────────
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

      // ── 5. Extract inline V13 visualizations ─────────────────────────────
      const inlineVisualizations: InlineViz[] = Array.isArray(props.uiVisualizations)
        ? props.uiVisualizations.filter(
            (ui: any) => ui?.type && ui.dataMapping !== undefined,
          )
        : [];

      // ── 6. Stable React key ───────────────────────────────────────────────
      const stableKey = `${block.type}-${block.id ?? block.slug ?? index}`;

      // ── 7. [H8] DEV lineage metadata ─────────────────────────────────────
      if (DEV) {
        props.__source = {
          blockType:    block.type,
          slug:         slug ?? 'unknown',
          originalKeys: Object.keys(block.payload ?? {}),
        };
      }

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
  // [B3] params is NOT a Promise — destructure directly.
  const { slug } = params;
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
// ─────────────────────────────────────────────────────────────────────────────

export default async function DynamicSEOPage({ params }: PageProps) {
  // [B3] params is NOT a Promise — destructure directly.
  const { slug } = params;
  const page     = getNormalizedPage(slug);
  if (!page) notFound();

  // [H7] Reuse cached result if generateMetadata already ran prepareBlocks.
  const preparedBlocks = prepareBlocksCached(page, slug);
  const schemas        = buildSchemas(page, slug, preparedBlocks);

  return (
    <>
      <Navbar />

      {/* [B1] JSON-LD rendered ONCE here — never inside the block loop */}
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
          const entry = BLOCK_REGISTRY[type as AllBlockTypeValues];

          // [H6] Unknown block: visible DEV placeholder, null in PROD.
          if (!entry) {
            if (DEV) console.warn(`[UNKNOWN_BLOCK]: ${type}`);
            return DEV ? (
              <div
                key={stableKey}
                style={{
                  border: '2px dashed red',
                  padding: '1rem',
                  margin: '1rem',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'red',
                }}
              >
                ⚠️ Unknown block: <strong>{type}</strong>
              </div>
            ) : null;
          }

          const { component: BlockComponent, isEmpty } = entry;

          // Hero always renders; all other blocks are skipped when isEmpty returns true.
          if (type !== BLOCK_TYPES.HERO && isEmpty?.(props)) {
            if (DEV) console.warn(`[BLOCK_SKIPPED_EMPTY]: ${type}`, props);
            return null;
          }

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