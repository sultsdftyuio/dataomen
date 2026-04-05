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
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
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

const BASE_URL = 'https://www.arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400;

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ----------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------

const DEFAULT_CTA = { primary: { text: 'Start Free Trial', href: '/register' } };

function normalizeCta(
  cta: any, primaryCTA: any, secondaryCTA: any,
): { primary: { text: string; href: string }; secondary?: { text: string; href: string } } {
  if (cta?.primary) return cta;
  if (primaryCTA) return { primary: primaryCTA, ...(secondaryCTA ? { secondary: secondaryCTA } : {}) };
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

/**
 * V10.2: Resolves a UIBlock payload for V1 pages.
 *
 * In V1 silo data, `uiBlocks` use `dataMapping` as a string key referencing a field
 * on the parent page object (e.g. `dataMapping: 'roiAnalysis'` -> `page.roiAnalysis`).
 * This function swaps the key for the actual data before the block reaches UIBlockMapper,
 * preventing components like MetricGovernance from receiving a raw string instead of the
 * structured object they require.
 */
function resolveUIBlockPayload(block: any, pageData: any): any {
  if (typeof block.dataMapping !== 'string') return block;
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
// ----------------------------------------------------------------------
function UIBlockMapper(props: any) {
  const type = props.visualizationType;
  const data = props.dataMapping;

  if (!type || data === undefined || data === null) return null;

  switch (type) {
    case 'ComparisonTable':
    case 'Comparisons': {
      const matrix = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? [{ category: 'Key Detail', legacy: 'Legacy Output', arcliAdvantage: data }]
          : [];
      if (matrix.length === 0) return null;
      return <Matrix matrix={matrix} />;
    }

    case 'ProcessStepper':
    case 'Processes': {
      const steps = Array.isArray(data)
        ? data
        : typeof data === 'string'
          ? [{ title: 'Workflow', description: data }]
          : [];
      if (steps.length === 0) return null;
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
      ) return null;
      return <MetricGovernance data={data} />;
    }

    case 'DataRelationshipsGraph':
    case 'Relationships': {
      // TelemetryTrace requires data.traces array.
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.traces)) return null;
      return <TelemetryTrace data={data} />;
    }

    case 'AnalyticsDashboard':
    case 'Insights': {
      const isObj = typeof data === 'object' && data !== null && !Array.isArray(data);
      return (
        <StrategicQuery
          scenario={{
            title:           isObj ? (data.title           || 'Strategic Insight')                                                       : 'Data Insight',
            description:     isObj ? (data.description     || 'Generated analysis')                                                      : String(data),
            dialect:         isObj ? (data.dialect         || 'SQL')                                                                     : 'SQL',
            sql:             isObj ? (data.code || data.sqlSnippet || data.sql || '-- Logic executing...')                               : '-- Query logic omitted',
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
      if (features.length === 0) return null;
      return <Features features={features} />;
    }

    default: {
      // Architecture accepts loosely-typed data; guard against primitives and arrays.
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      return <Architecture architecture={data} />;
    }
  }
}

// ----------------------------------------------------------------------
// BLOCK REGISTRY
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
// ----------------------------------------------------------------------
const IS_EMPTY: Partial<Record<string, (props: Record<string, any>) => boolean>> = {
  Demo:                       (p) => !p.demo,
  Personas:                   (p) => !p.personas?.length,
  Matrix:                     (p) => !p.matrix?.length,
  WorkflowSection:            (p) => !p.workflow,
  UseCases:                   (p) => !p.useCases?.length,
  Steps:                      (p) => !p.steps?.length,
  Features:                   (p) => !p.features?.length,
  Architecture:               (p) => !p.architecture,
  SecurityGuardrails:         (p) => !p.items?.length,
  ExecutiveSummary:           (p) => !p.highlights?.length,
  ContrarianBanner:           (p) => !p.statement,
  StrategicQuery:             (p) => !p.scenario,
  FAQs:                       (p) => !p.faqs?.length,
  RelatedLinks:               (p) => !p.slugs?.length,
  ZeroDataProof:              (p) => !p.data,
  SemanticTranslation:        (p) => !p.data,
  TrustAndCompliance:         (p) => !p.data,
  ParadigmTeardown:           (p) => !p.data,
  TelemetryTrace:             (p) => !p.data,
  MetricGovernance:           (p) => !p.data,
  EmbeddableSDK:              (p) => !p.data,
  DataGravityCost:            (p) => !p.data,
  DynamicSchemaMapping:       (p) => !p.data,
  GranularAccessControl:      (p) => !p.data,
  ConcurrencyProof:           (p) => !p.data,
  TenantIsolationArchitecture:(p) => !p.data,
  DeterministicGuardrails:    (p) => !p.data,
  // A UIBlock with no type or no data after resolution is empty.
  UIBlock:                    (p) => !p.visualizationType || p.dataMapping === undefined || p.dataMapping === null,
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

  const codeSnippet =
    page.blocks?.find((b: any) => b.type === 'StrategicQuery')?.payload?.code ||
    page.strategicScenario?.sql ||
    page.demo?.generatedSql ||
    page.useCases?.find((u: any) => u.sqlSnippet)?.sqlSnippet ||
    page.executiveScenarios?.find((s: any) => s.sqlGenerated)?.sqlGenerated;

  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', page.seo.h1);
  ogUrl.searchParams.set('type', page.type || 'article');
  if (codeSnippet) ogUrl.searchParams.set('code', codeSnippet);

  return {
    title: page.seo.title,
    description: page.seo.description,
    openGraph: {
      title: page.seo.title,
      description: page.seo.description,
      type: 'article',
      url: `${BASE_URL}/${slug}`,
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
      return { slugs: d.relatedSlugs || d.relatedBlueprints || [], heroCta };
    }

    case 'Features':
      return { features: toFeatureArray(d.features) || toFeatureArray(d.capabilities) || [] };

    case 'Steps':
      return { steps: d.steps || d.onboardingExperience || [] };

    case 'Architecture':
      return { architecture: d.architecture };

    case 'UIBlock':
      return d;

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

    const insertionIndex = Math.min(2, renderList.length);
    renderList.splice(insertionIndex, 0, ...uiRenderBlocks);
  }

  // Schema.org structured data
  const schemas: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: page.seo.h1,
      description: page.seo.description,
      author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
      datePublished: page.seo.datePublished || new Date().toISOString(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
    },
  ];

  const faqData = isV2
    ? page.blocks.find((b: any) => b.type === 'FAQs')?.payload?.faqs
    : page.faqs;

  if (faqData?.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqData.map((f: any) => ({
        '@type': 'Question',
        name: f.question || f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.answer || f.a },
      })),
    });
  }

  return (
    <>
      <Navbar />

      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        {renderList.map((block, index) => {
          const BlockComponent = BLOCK_REGISTRY[block.type];
          if (!BlockComponent) return null;

          // V2 blocks and UIBlocks carry their own payload.
          // V1 layout blocks derive props from the flat page object via getV1BlockProps.
          const blockProps: Record<string, any> = (isV2 || block.type === 'UIBlock')
            ? (block.payload ?? {})
            : getV1BlockProps(block.type, page);

          // Defensive array coercion for all known array props.
          if (!Array.isArray(blockProps.slugs))    blockProps.slugs    = blockProps.slugs    ?? [];
          if (!Array.isArray(blockProps.faqs))     blockProps.faqs     = blockProps.faqs     ?? [];
          if (!Array.isArray(blockProps.matrix))   blockProps.matrix   = blockProps.matrix   ?? [];
          if (!Array.isArray(blockProps.useCases)) blockProps.useCases = blockProps.useCases ?? [];
          if (!Array.isArray(blockProps.features)) blockProps.features = blockProps.features ?? [];
          if (!Array.isArray(blockProps.steps))    blockProps.steps    = blockProps.steps    ?? [];
          if (!Array.isArray(blockProps.personas)) blockProps.personas = blockProps.personas ?? [];
          if (!Array.isArray(blockProps.items))    blockProps.items    = blockProps.items    ?? [];

          // Hero always renders (builds its own fallback data).
          if (block.type !== 'Hero') {
            const isEmpty = IS_EMPTY[block.type];
            if (isEmpty && isEmpty(blockProps)) return null;
          }

          return <BlockComponent key={`${block.type}-${index}`} {...blockProps} />;
        })}
      </main>

      <Footer />
    </>
  );
}