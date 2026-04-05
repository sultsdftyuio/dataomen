/**
 * FILE: app/(landing)/[slug]/page.tsx
 *
 * FIXES applied in this version:
 * 1. Hero CTA normalization (defense-in-depth).
 * 2. Features object-vs-array extraction.
 * 3. Capabilities object-vs-array extraction.
 * 4. hasData per-block validation (explicit per-type isEmpty guards).
 * 5. RelatedLinks heroCta safety.
 * 6. Personas guard explicit fallback.
 * 7. SecurityGuardrails normalization.
 * 8. [V10.1 PATCH] UIBlock Mapper: Maps generic AI UI intents directly to native seo-blocks.
 * 9. [V10.1 PATCH] Advanced Block Data Routing: Fixed getV1BlockProps default case so Phase 4-9 blocks correctly extract their data and respect IS_EMPTY.
 * 10. [V10.1 PATCH] Layout Configurations updated to automatically parse and render advanced Phase 4-9 blocks if data exists.
 * 11. [V10.1.1 PATCH] UIBlock Mapper Safeguards: Implemented strict length checks and string-to-array fallbacks for AI blocks to prevent SSR crashes (e.g. `filename` read on empty array structures).
 * 12. [V10.1.1 PATCH] Prevent nested UIBlock payloads during Intelligence Injection.
 * 13. [V10.1.2 PATCH] StrategicQuery strict TypeScript alignment: formats scenario object perfectly to prevent TS 'IntrinsicAttributes' build errors.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

// Data Registry & Parser
import { getNormalizedPage, getAllSlugs } from '@/lib/seo/registry';

// UI Blocks - Phase 1 & 2
import {
  Hero, Demo, Personas, Matrix, WorkflowSection, UseCases,
} from '@/components/landing/seo-blocks-1';

import {
  Steps, Features, Architecture, RelatedLinks, FAQs,
} from '@/components/landing/seo-blocks-2';

// UI Blocks - Phase 3 (Enterprise & Security)
import {
  SecurityGuardrails, ContrarianBanner, StrategicQuery, ExecutiveSummary,
} from '@/components/landing/seo-blocks-3';

// UI Blocks - Phase 4-9 (Advanced Architecture & Trust)
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
// V10.1 UI BLOCK MAPPER
// Dynamically maps SEO Intelligence "visualizationTypes" to native seo-blocks
// ----------------------------------------------------------------------
function UIBlockMapper(props: any) {
  const type = props.visualizationType;
  const data = props.dataMapping;

  if (!type || !data) return null;

  switch (type) {
    case 'ComparisonTable':
    case 'Comparisons': {
      const matrix = Array.isArray(data) ? data : (typeof data === 'string' ? [{ category: "Key Detail", legacy: "Legacy Output", arcliAdvantage: data }] : []);
      if (matrix.length === 0) return null;
      return <Matrix matrix={matrix} />;
    }
    case 'ProcessStepper':
    case 'Processes': {
      const steps = Array.isArray(data) ? data : (typeof data === 'string' ? [{ title: "Workflow", description: data }] : []);
      if (steps.length === 0) return null; 
      return <Steps steps={steps} />;
    }
    case 'MetricsChart':
    case 'Metrics':
      return <MetricGovernance data={data} />;
    case 'DataRelationshipsGraph':
    case 'Relationships':
      return <TelemetryTrace data={data} />;
    case 'AnalyticsDashboard':
    case 'Insights': {
      // FIX: Map strictly to the StrategicScenarioProps type to satisfy TS
      const isObj = typeof data === 'object' && data !== null;
      return (
        <StrategicQuery 
          scenario={{
            title: isObj ? (data.title || "Strategic Insight") : "Data Insight",
            description: isObj ? (data.description || "Generated analysis") : data,
            dialect: isObj ? (data.dialect || "SQL") : "SQL",
            sql: isObj ? (data.code || data.sqlSnippet || data.sql || "-- Logic executing...") : "-- Query logic omitted",
            businessOutcome: isObj ? (data.businessOutcome || data.arcliResolution || data.description || "Actionable intelligence derived.") : data
          }} 
        />
      );
    }
    case 'Cards / Lists':
    case 'Lists': {
      const features = Array.isArray(data) ? data : (typeof data === 'string' ? [{ title: "Capability", description: data }] : []);
      if (features.length === 0) return null;
      return <Features features={features} />;
    }
    default:
      return <Architecture architecture={data} />;
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
  guide:      ['Hero', 'ExecutiveSummary', 'Steps', 'FAQs', 'Demo', 'UseCases', 'Features', 'Architecture', 'TelemetryTrace', 'ZeroDataProof', 'MetricGovernance', 'RelatedLinks'],
  comparison: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Matrix', 'Features', 'Personas', 'UseCases', 'DataGravityCost', 'ParadigmTeardown', 'FAQs', 'RelatedLinks'],
  integration:['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'WorkflowSection', 'Demo', 'StrategicQuery', 'Features', 'Steps', 'SecurityGuardrails', 'Architecture', 'DynamicSchemaMapping', 'EmbeddableSDK', 'FAQs', 'RelatedLinks'],
  feature:    ['Hero', 'ExecutiveSummary', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'UseCases', 'Architecture', 'GranularAccessControl', 'ConcurrencyProof', 'FAQs', 'RelatedLinks'],
  template:   ['Hero', 'Demo', 'Steps', 'UseCases', 'Features', 'Matrix', 'SemanticTranslation', 'TrustAndCompliance', 'FAQs', 'RelatedLinks'],
  campaign:   ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Personas', 'UseCases', 'WorkflowSection', 'StrategicQuery', 'SecurityGuardrails', 'Features', 'Demo', 'TenantIsolationArchitecture', 'DeterministicGuardrails', 'FAQs', 'RelatedLinks'],
  default:    [
    'Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Demo', 'Personas', 'Matrix', 
    'WorkflowSection', 'UseCases', 'StrategicQuery', 'Steps', 'Features', 
    'SecurityGuardrails', 'Architecture', 'ZeroDataProof', 'SemanticTranslation', 
    'TrustAndCompliance', 'ParadigmTeardown', 'TelemetryTrace', 'MetricGovernance', 
    'EmbeddableSDK', 'DataGravityCost', 'DynamicSchemaMapping', 'GranularAccessControl', 
    'ConcurrencyProof', 'TenantIsolationArchitecture', 'DeterministicGuardrails', 
    'FAQs', 'RelatedLinks'
  ],
};

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

// ----------------------------------------------------------------------
// PER-BLOCK EMPTY CHECK
// ----------------------------------------------------------------------
const IS_EMPTY: Partial<Record<string, (props: Record<string, any>) => boolean>> = {
  Demo:             (p) => !p.demo,
  Personas:         (p) => !p.personas?.length,
  Matrix:           (p) => !p.matrix?.length,
  WorkflowSection:  (p) => !p.workflow,
  UseCases:         (p) => !p.useCases?.length,
  Steps:            (p) => !p.steps?.length,
  Features:         (p) => !p.features?.length,
  Architecture:     (p) => !p.architecture,
  SecurityGuardrails:(p) => !p.items?.length,
  ExecutiveSummary: (p) => !p.highlights?.length,
  ContrarianBanner: (p) => !p.statement,
  StrategicQuery:   (p) => !p.scenario,
  FAQs:             (p) => !p.faqs?.length,
  RelatedLinks:     (p) => !p.slugs?.length,
  ZeroDataProof:    (p) => !p.data,
  SemanticTranslation:(p) => !p.data,
  TrustAndCompliance:(p) => !p.data,
  ParadigmTeardown: (p) => !p.data,
  TelemetryTrace:   (p) => !p.data,
  MetricGovernance: (p) => !p.data,
  EmbeddableSDK:    (p) => !p.data,
  DataGravityCost:  (p) => !p.data,
  DynamicSchemaMapping:(p) => !p.data,
  GranularAccessControl:(p) => !p.data,
  ConcurrencyProof: (p) => !p.data,
  TenantIsolationArchitecture:(p) => !p.data,
  DeterministicGuardrails:(p) => !p.data,
  UIBlock:          (p) => !p.visualizationType,
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
      return { statement: d.contrarianBanner?.statement || d.subtitle || d.seo?.h1, subtext: d.contrarianBanner?.subtext || d.description || d.seo?.description };
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
      const rawScenario = d.strategicScenario || d.executiveScenarios?.find((s: any) => s.complexity === 'Strategic') || d.analyticalScenarios?.[0];
      if (!rawScenario) return {}; // Allows IS_EMPTY to correctly skip this if undefined
      // FIX: Ensure strict property match with StrategicScenarioProps
      return { 
        scenario: {
          title: rawScenario.title || "Strategic Blueprint",
          description: rawScenario.description || "Advanced data extraction pattern.",
          dialect: rawScenario.dialect || "SQL",
          sql: rawScenario.sqlGenerated || rawScenario.sql || rawScenario.sqlSnippet || "-- Query logic parsing",
          businessOutcome: rawScenario.arcliResolution || rawScenario.businessOutcome || rawScenario.description || "Optimized data workflow."
        } 
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
  
  let renderList: Array<{ type: string; payload: any }> = isV2
    ? [...page.blocks]
    : (LAYOUT_CONFIG[page.type] || LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

  if (page.uiBlocks && page.uiBlocks.length > 0) {
    const uiRenderBlocks = page.uiBlocks.map((block: any) => {
      return block.type === 'UIBlock' ? block : { type: 'UIBlock', payload: block };
    });
    
    const insertionIndex = Math.min(2, renderList.length);
    renderList.splice(insertionIndex, 0, ...uiRenderBlocks);
  }

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

  const faqData = isV2 ? page.blocks.find((b: any) => b.type === 'FAQs')?.payload?.faqs : page.faqs;

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
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        {renderList.map((block, index) => {
          const BlockComponent = BLOCK_REGISTRY[block.type];
          if (!BlockComponent) return null;

          const blockProps: Record<string, any> = (isV2 || block.type === 'UIBlock')
            ? (block.payload ?? {})
            : getV1BlockProps(block.type, page);

          // Safety bounds
          if (!Array.isArray(blockProps.slugs))    blockProps.slugs    = blockProps.slugs    ?? [];
          if (!Array.isArray(blockProps.faqs))     blockProps.faqs     = blockProps.faqs     ?? [];
          if (!Array.isArray(blockProps.matrix))   blockProps.matrix   = blockProps.matrix   ?? [];
          if (!Array.isArray(blockProps.useCases)) blockProps.useCases = blockProps.useCases ?? [];
          if (!Array.isArray(blockProps.features)) blockProps.features = blockProps.features ?? [];
          if (!Array.isArray(blockProps.steps))    blockProps.steps    = blockProps.steps    ?? [];
          if (!Array.isArray(blockProps.personas)) blockProps.personas = blockProps.personas ?? [];
          if (!Array.isArray(blockProps.items))    blockProps.items    = blockProps.items    ?? [];

          // Empty check bypass for Hero
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