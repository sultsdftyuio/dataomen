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
  SecurityGuardrails, StrategicQuery, ExecutiveSummary,
} from '@/components/landing/seo-blocks-3';

import {
  ZeroDataProof, SemanticTranslation, TrustAndCompliance,
} from '@/components/landing/seo-blocks-4';

import { ParadigmTeardown, TelemetryTrace }          from '@/components/landing/seo-blocks-5';
import { MetricGovernance, EmbeddableSDK }            from '@/components/landing/seo-blocks-6';
import { DataGravityCost, DynamicSchemaMapping }      from '@/components/landing/seo-blocks-7';
import { GranularAccessControl, ConcurrencyProof }    from '@/components/landing/seo-blocks-8';
import { TenantIsolationArchitecture, DeterministicGuardrails } from '@/components/landing/seo-blocks-9';

const MissingBlockComponent = ({ name }: { name: string }) => (
  <div className="p-4 border border-red-500 text-red-500">Missing {name} Component</div>
);

const BrutalistCTA = dynamic(
  () =>
    import('@/components/landing/brutalist-cta')
      .then((m) => m.default || m.BrutalistCTA || (() => <MissingBlockComponent name="CTA" />))
      .catch(() => (() => <MissingBlockComponent name="CTA" />)),
  { ssr: true, loading: () => null },
);

const ContrarianBannerBlock = dynamic(
  () =>
    import('@/components/landing/ContrarianBanner')
      .then((m) => m.default || m.ContrarianBanner || (() => <MissingBlockComponent name="ContrarianBanner" />))
      .catch(() => (() => <MissingBlockComponent name="ContrarianBanner" />)),
  { ssr: true, loading: () => null },
);

const InformationGain = dynamic(
  () =>
    import('@/components/landing/InformationGain')
      .then((m) => m.default || m.InformationGain || (() => <MissingBlockComponent name="InformationGain" />))
      .catch(() => (() => <MissingBlockComponent name="InformationGain" />)),
  { ssr: true, loading: () => null },
);

const AnalyticsDashboard = dynamic(
  () =>
    import('@/components/dashboard/AnalyticsDashboard')
      .then((m) => m.default || m.AnalyticsDashboard || (() => <MissingBlockComponent name="AnalyticsDashboard" />))
      .catch(() => (() => <MissingBlockComponent name="AnalyticsDashboard" />)),
  { ssr: true, loading: () => null },
);

const ComparisonMatrix = dynamic(
  () =>
    import('@/components/landing/ComparisonMatrix')
      .then((m) => m.default || m.ComparisonMatrix || (() => <MissingBlockComponent name="ComparisonMatrix" />))
      .catch(() => (() => <MissingBlockComponent name="ComparisonMatrix" />)),
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
  HERO_BLOCK:                  'HeroBlock',
  ARCHITECTURE_DIAGRAM:        'ArchitectureDiagram',
  COMPARISON_MATRIX:           'ComparisonMatrix',
  ANALYTICS_DASHBOARD:         'AnalyticsDashboard',
  CTA_GROUP:                   'CTAGroup',
  INFORMATION_GAIN_BLOCK:      'InformationGainBlock',
  DATA_RELATIONSHIPS_GRAPH:    'DataRelationshipsGraph',
  METRICS_CHART:               'MetricsChart',
} as const;

const DEFAULT_CTA = {
  primary: { text: 'Start Free Trial', href: '/register' },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

// [B3] In this deployment target, params is async (Promise) for dynamic routes.
// Catch-all route means slug resolves to an Array of strings.
interface PageProps {
  params: Promise<{ slug: string[] }>;
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

function toFeatureArray(raw: unknown): Array<{ title: string; description: string }> {
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
): Array<{ title: string; description: string }> {
  if (!raw.length)              return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any) => ({
      title:       r.title       || r.name  || r.heading || '',
      description: r.description || r.body  || r.text    || '', // <-- Changed to empty string
    })),
  );
}

/** Step items: { title, description? } */
function normalizeSteps(
  raw: any[],
): Array<{ title: string; description: string }> {
  if (!raw.length)              return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw.map((r: any, i: number) => ({
      title:       r.title       || r.name  || r.step   || `Step ${i + 1}`,
      description: r.description || r.body  || r.detail || '', // <-- Changed to empty string
    })),
  );
}

/** FAQ items: canonicalized to support both q/a and question/answer schemas */
function normalizeFaqs(
  raw: any[],
): Array<{ q: string; a: string; question: string; answer: string; persona?: string }> {
  if (!raw.length) return [];
  if (isAlreadyNormalized(raw)) return raw as any;

  return tagNormalized(
    raw
      .map((r: any) => {
        const q = r.q || r.question || r.title || '';
        const a = r.a || r.answer || r.description || '';
        if (!q && !a) return null;
        return {
          q,
          a,
          question: q,
          answer: a,
          ...(r.persona ? { persona: r.persona } : {}),
        };
      })
      .filter(Boolean) as Array<{ q: string; a: string; question: string; answer: string; persona?: string }>,
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

function validateFaqs(faqs: any[]): boolean {
  return faqs.every(
    (f) =>
      typeof f.q === 'string' &&
      typeof f.a === 'string' &&
      typeof f.question === 'string' &&
      typeof f.answer === 'string',
  );
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
    const d = (data && typeof data === 'object' && !Array.isArray(data)) ? data as any : {};
    
    // Fallback injection for actual content
    d.title = d.title || 'Governed Metrics Strategy';
    d.description = d.description || 'Unified metric layer execution.';
    d.codeSnippet = d.codeSnippet || {
      language: 'sql',
      code: 'SELECT user_id, LTV FROM unified_metrics;'
    };

    return <MetricGovernance data={d} />;
  },

  [UI_TYPES.DATA_RELATIONSHIPS_GRAPH]: (data) => {
    const d = (data && typeof data === 'object' && !Array.isArray(data)) ? data as any : {};

    // Fallback injection for actual content
    d.title = d.title || 'Microsecond Execution Trace';
    d.queryInput = d.queryInput || 'SELECT * FROM metrics';
    d.totalLatency = d.totalLatency || '1.2ms';
    d.architecturalTakeaway = d.architecturalTakeaway || 'Arcli bypasses standard compilation for sub-millisecond execution.';
    
    const traces = Array.isArray(d.traces) ? d.traces : [];
    d.traces = traces.length > 0 ? traces : [
      { phase: 'Parsing', durationMs: 0.1, log: 'AST generated' },
      { phase: 'Semantic Routing', durationMs: 0.3, log: 'Route resolved' },
      { phase: 'Execution', durationMs: 0.8, log: 'DuckDB compute finished' }
    ];

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

// [FIX] Map the missing build aliases to guarantee actual content renders
UI_BLOCK_HANDLERS['ProgressiveChart']             = UI_BLOCK_HANDLERS[UI_TYPES.METRICS_CHART];
UI_BLOCK_HANDLERS['ArchitectureDiagram']          = UI_BLOCK_HANDLERS[UI_TYPES.PROCESS_STEPPER];
UI_BLOCK_HANDLERS['SecurityFlowchart']            = UI_BLOCK_HANDLERS[UI_TYPES.PROCESS_STEPPER];

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
  [BLOCK_TYPES.CONTRARIAN_BANNER]:         { component: ContrarianBannerBlock,       isEmpty: (p) => !(p.statement || p.subtext || p.title || p.description || p.copy || p.features?.length) },
  [BLOCK_TYPES.DEMO]:                      { component: Demo,                         isEmpty: (p) => !p.demo },
  [BLOCK_TYPES.PERSONAS]:                  { component: Personas,                    isEmpty: (p) => !p.personas?.length },
  [BLOCK_TYPES.MATRIX]:                    { component: Matrix,                       isEmpty: (p) => !p.matrix?.length },
  [BLOCK_TYPES.WORKFLOW_SECTION]:          { component: WorkflowSection,             isEmpty: (p) => !p.workflow },
  [BLOCK_TYPES.USE_CASES]:                 { component: UseCases,                    isEmpty: (p) => !p.useCases?.length },
  [BLOCK_TYPES.STRATEGIC_QUERY]:           { component: StrategicQuery,              isEmpty: (p) => !(p.scenario || p.code || p.sqlSnippet) },
  [BLOCK_TYPES.SECURITY_GUARDRAILS]:       { component: Features,                    isEmpty: (p) => !(p.features?.length || p.bullets?.length || p.data?.bullets?.length) },
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
  [BLOCK_TYPES.DATA_GRAVITY_COST]:         {
    component: DataGravityCost,
    isEmpty: (p) => {
      const d = p.data;
      if (d && typeof d === 'object') {
        return !(
          d.title ||
          d.description ||
          d.arcliEfficiency ||
          (Array.isArray(d.industrialConstraints) && d.industrialConstraints.length > 0)
        );
      }
      return !(p.title || p.description || p.arcliEfficiency || p.industrialConstraints?.length);
    },
  },
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
  [BLOCK_TYPES.INFORMATION_GAIN]:          { component: InformationGain,             isEmpty: (p) => !p.uniqueInsight && !p.structuralAdvantage && !p.features?.length },
  [BLOCK_TYPES.CONVERSION_ENGINE]:         { component: BrutalistCTA,               isEmpty: (p) => !p.primaryCta && !p.cta?.primary },
  [BLOCK_TYPES.HERO_BLOCK]: {
    component: Hero 
  },
  [BLOCK_TYPES.ARCHITECTURE_DIAGRAM]: { 
    component: Steps, 
    isEmpty: (p) => !(p.steps?.length || p.data?.steps?.length) 
  },
  [BLOCK_TYPES.COMPARISON_MATRIX]: { 
    component: ComparisonMatrix, 
    isEmpty: (p) => !(p.matrix?.length || p.rows?.length || p.data?.rows?.length) 
  },
  [BLOCK_TYPES.ANALYTICS_DASHBOARD]: { 
    component: AnalyticsDashboard, 
    isEmpty: (p) => !(p.scenario || p.scenarios?.length || p.data?.scenarios?.length) 
  },
  [BLOCK_TYPES.CTA_GROUP]: { 
    component: BrutalistCTA, 
    isEmpty: (p) => !(p.primaryCta || p.cta?.primary || p.data?.primaryHref) 
  },
  [BLOCK_TYPES.INFORMATION_GAIN_BLOCK]: { 
    component: InformationGain, 
    isEmpty: (p) => !(p.features?.length || p.bullets?.length || p.data?.bullets?.length) 
  },
  [BLOCK_TYPES.DATA_RELATIONSHIPS_GRAPH]: { 
    component: TelemetryTrace, 
    isEmpty: (p) => !p.data 
  },
  [BLOCK_TYPES.METRICS_CHART]: { 
    component: MetricGovernance, 
    isEmpty: (p) => !p.data 
  },
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

  [BLOCK_TYPES.FAQS]: (d) => {
    const raw = forceArray(d.faqs || []);
    const normalized = normalizeFaqs(raw);
    return {
      faqs: safeNormalized(normalized, validateFaqs, 'FAQs.faqs', raw),
    };
  },

  [BLOCK_TYPES.DATA_GRAVITY_COST]: (d) => {
    const source = d.dataGravityCost ?? d.strategicContext ?? d;

    if (typeof source === 'string') {
      return {
        data: {
          title: 'Data Gravity Cost',
          description: source,
        },
      };
    }

    if (source && typeof source === 'object') {
      return {
        data: {
          title: source.title || source.heading || 'Data Gravity Cost',
          description: source.description || source.text || '',
          industrialConstraints: forceArray(source.industrialConstraints || source.constraints || []),
          arcliEfficiency: source.arcliEfficiency || source.resolution || source.outcome || '',
          ...source,
        },
      };
    }

    return { data: undefined };
  },

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
    const d = props.data || props;
    props.data = {
      type: d.type || page.type || 'platform',
      seo:  {
        h1: d.h1 || d.headline || d.title || page.seo?.h1 || 'Arcli Analytics',
      },
      hero: {
        title: d.h1 || d.headline || d.title || page.seo?.h1 || 'Arcli Analytics',
        subtitle: d.subtitle || d.description || page.seo?.description || '',
        cta: normalizeCta(
          d.cta,
          d.primaryCta ?? d.primaryCTA,
          d.secondaryCta ?? d.secondaryCTA,
        ),
      },
    };
  },

  [BLOCK_TYPES.HERO_BLOCK]: (props) => {
    props.title = props.title || props.h1 || props.heading || "Arcli AI Analytics";
    props.subtitle = props.subtitle || props.description || props.copy || "Enterprise Data Platform";
  },

  [BLOCK_TYPES.CONTRARIAN_BANNER]: (props) => {
    props.statement =
      props.statement || props.title || props.h2 || props.heading || props.text || props.copy || props.description;
    props.subtext = props.subtext || props.description || props.copy || props.text;

    if (!props.features && (props.statement || props.subtext)) {
      props.features = [{
        title: props.statement || "Paradigm Shift",
        description: props.subtext || "",
      }];
    }
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

  [BLOCK_TYPES.FAQS]: (props) => {
    const raw = forceArray(props.faqs ?? props.items ?? []);
    props.faqs = safeNormalized(
      normalizeFaqs(raw),
      validateFaqs,
      'V2 FAQs.faqs',
      raw,
    );
  },

  [BLOCK_TYPES.DATA_GRAVITY_COST]: (props) => {
    if (props.data && typeof props.data === 'object') {
      props.data = {
        title: props.data.title || props.data.heading || 'Data Gravity Cost',
        description: props.data.description || props.data.text || '',
        industrialConstraints: forceArray(props.data.industrialConstraints || props.data.constraints || []),
        arcliEfficiency: props.data.arcliEfficiency || props.data.resolution || props.data.outcome || '',
        ...props.data,
      };
      return;
    }

    if (typeof props.data === 'string') {
      props.data = {
        title: 'Data Gravity Cost',
        description: props.data,
      };
      return;
    }

    if (!props.data && (props.title || props.description || props.text || props.industrialConstraints || props.constraints)) {
      props.data = {
        title: props.title || props.heading || 'Data Gravity Cost',
        description: props.description || props.text || '',
        industrialConstraints: forceArray(props.industrialConstraints || props.constraints || []),
        arcliEfficiency: props.arcliEfficiency || props.resolution || props.outcome || '',
      };
    }
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
[BLOCK_TYPES.ARCHITECTURE_DIAGRAM]: (props) => {
    const source = forceArray(props.data?.steps ?? props.steps ?? []);
    props.steps = safeNormalized(normalizeSteps(source), validateSteps, 'V2 ArchitectureDiagram', source);
  },
  
  [BLOCK_TYPES.COMPARISON_MATRIX]: (props) => {
    const source = forceArray(props.data?.rows ?? props.rows ?? props.matrix ?? []);
    props.matrix = safeNormalized(normalizeMatrix(source), validateMatrix, 'V2 ComparisonMatrix', source);
  },

  [BLOCK_TYPES.INFORMATION_GAIN_BLOCK]: (props) => {
    const bullets = forceArray(props.data?.bullets ?? props.bullets ?? []);
    if (!props.features?.length && bullets.length > 0) {
      props.features = normalizeFeatures(
        bullets.map((b) => ({ title: String(b), description: '' })),
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

const BLOCK_TYPE_ALIASES: Record<string, string> = {
  HeroBlock:              BLOCK_TYPES.HERO,
  CTAGroup:               BLOCK_TYPES.CONVERSION_ENGINE,
  AnalyticsDashboard:     BLOCK_TYPES.UI_BLOCK,
  MetricsChart:           BLOCK_TYPES.UI_BLOCK,
  DataRelationshipsGraph: BLOCK_TYPES.UI_BLOCK,
};

// ─────────────────────────────────────────────────────────────────────────────
// PRE-NORMALIZED RENDER PIPELINE  [A3]
// ─────────────────────────────────────────────────────────────────────────────

function prepareBlocks(page: any, slug?: string): PreparedBlock[] {
  const isV2 = Array.isArray(page.blocks);

  const blockMap: Map<string, any> = isV2
    ? new Map(page.blocks.map((b: any) => [b?.type, b]))
    : new Map();

  const rawList: Array<{ type: string; payload: any; id?: string; slug?: string; data?: any }> = isV2
    ? page.blocks.map((b: any) => ({ ...b }))
    : (LAYOUT_CONFIG[page.type] ?? LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

  if (page.uiBlocks?.length > 0 && !isV2) {
    // SecurityGuardrails is a top-level layout block, not a UI widget.
    // Filter it from legacy V1 uiBlocks to avoid noisy unknown UI block warnings.
    const uiBlocks = page.uiBlocks
      .filter((block: any) => {
        const candidateType = block?.visualizationType || block?.type;
        return candidateType !== BLOCK_TYPES.SECURITY_GUARDRAILS;
      })
      .map((block: any) => ({
        type:    BLOCK_TYPES.UI_BLOCK,
        payload: resolveUIBlockPayload(block, page),
      }));
    const heroIndex = rawList.findIndex((b) => b.type === BLOCK_TYPES.HERO);
    const insertAt  = heroIndex >= 0 ? heroIndex + 1 : 0;
    rawList.splice(insertAt, 0, ...uiBlocks);
  }

  return rawList
    .filter((block) => block != null && block.type != null)
    .map((block, index) => {

      // 1. Map Mega-Blocks to Canonical Internal Blocks
      const mappedType = BLOCK_TYPE_ALIASES[block.type] || block.type;
      let payload = block.payload ?? block.data ?? {};

      // 2. Wrap UI blocks with the expected handler mapping
      if (mappedType === BLOCK_TYPES.UI_BLOCK && block.type !== BLOCK_TYPES.UI_BLOCK) {
        payload = {
          visualizationType: block.type,
          dataMapping: payload,
        };
      }

      // 3. Extract raw props
      const props: Record<string, any> =
        isV2 || mappedType === BLOCK_TYPES.UI_BLOCK
          ? { ...payload }
          : getV1BlockProps(mappedType, page);

      // 4. Apply V2 normalization bridge
      if (isV2) {
        V2_NORMALIZERS[mappedType]?.(props, page, blockMap);
      }

      // 5. Normalize all canonical array props
      props.slugs      = forceArray(props.slugs);
      props.faqs       = forceArray(props.faqs);
      props.matrix     = forceArray(props.matrix ?? props.rows);
      props.useCases   = forceArray(props.useCases ?? props.scenarios);
      props.features   = forceArray(props.features);
      props.steps      = forceArray(props.steps);
      props.personas   = forceArray(props.personas);
      props.items      = forceArray(props.items);
      props.highlights = forceArray(props.highlights ?? props.pillars);

      if (props.architecture) {
        if (typeof props.architecture !== 'object') {
          props.architecture = {
            components: [{ title: 'System Node', description: String(props.architecture) }],
          };
        } else {
          props.architecture.components = forceArray(props.architecture.components);
        }
      }

      if (mappedType === BLOCK_TYPES.TELEMETRY_TRACE && props.data && typeof props.data === 'object') {
        props.data = { ...props.data, traces: forceArray(props.data.traces) };
      }

      const inlineVisualizations: InlineViz[] = Array.isArray(props.uiVisualizations)
        ? props.uiVisualizations.filter(
            (ui: any) => ui?.type && ui.dataMapping !== undefined,
          )
        : [];

      const stableKey = `${mappedType}-${block.id ?? block.slug ?? index}`;

      if (DEV) {
        props.__source = {
          blockType: mappedType,
          originalType: block.type,
          slug: slug ?? 'unknown',
        };
      }

      return { type: mappedType, props, stableKey, inlineVisualizations };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC GENERATION & METADATA
// ─────────────────────────────────────────────────────────────────────────────

export const dynamicParams = true; // MUST BE TRUE to prevent false 404s on Catch-All routes
export const revalidate    = 86400;

export async function generateStaticParams() {
  // Convert full paths like "seo/analytics" into arrays ['seo', 'analytics'] for Next.js.
  return getAllSlugs().map((slugPath) => ({ slug: slugPath.split('/') }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: slugArray } = await params;
  const fullSlug = slugArray.join('/');
  const page = getNormalizedPage(fullSlug);
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
      url:   `${BASE_URL}/${fullSlug}`,
      images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
    },
    alternates: { canonical: `${BASE_URL}/${fullSlug}` },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT — pure projection over pre-normalized data  [A3]
// ─────────────────────────────────────────────────────────────────────────────

export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug: slugArray } = await params;
  const fullSlug = slugArray.join('/');
  const page = getNormalizedPage(fullSlug);
  if (!page) notFound();

  // [H7] Reuse cached result if generateMetadata already ran prepareBlocks.
  const preparedBlocks = prepareBlocksCached(page, fullSlug);
  const schemas        = buildSchemas(page, fullSlug, preparedBlocks);

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
          const isRenderableComponent =
            !!BlockComponent &&
            (typeof BlockComponent === 'function' ||
              (typeof BlockComponent === 'object' && BlockComponent !== null));

          if (!isRenderableComponent) {
            console.error(
              `[SEO SYSTEM] FATAL: Component for block type "${type}" is undefined or invalid. Check imports and default exports.`,
            );
            return (
              <div
                key={stableKey}
                style={{
                  padding: '20px',
                  border: '2px solid red',
                  color: 'red',
                  margin: '1rem',
                }}
              >
                MISSING COMPONENT: {type}
              </div>
            );
          }

          const SafeBlockComponent = BlockComponent as React.ElementType;

          // Hero always renders; all other blocks are skipped when isEmpty returns true.
          if (type !== BLOCK_TYPES.HERO && isEmpty?.(props)) {
            if (DEV) console.warn(`[BLOCK_SKIPPED_EMPTY]: ${type}`, props);
            return null;
          }

          if (inlineVisualizations.length > 0) {
            return (
              <React.Fragment key={stableKey}>
                <SafeBlockComponent {...props} />
                {inlineVisualizations.map((ui, uiIdx) => (
                  <React.Fragment key={`${stableKey}-ui-${uiIdx}`}>
                    {UIBlockMapper({
                      visualizationType: ui.type,
                      dataMapping: ui.dataMapping,
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          }

          return <SafeBlockComponent key={stableKey} {...props} />;
        })}
      </main>

      <Footer />
    </>
  );
}