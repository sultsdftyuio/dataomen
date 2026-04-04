/**
 * FILE: app/(landing)/[slug]/page.tsx
 *
 * FIXES applied in this version:
 *  1. Hero CTA normalization (defense-in-depth): normalizes `hero.primaryCTA` →
 *     `hero.cta.primary` inside getV1BlockProps, even if registry.ts already did it.
 *  2. Features object-vs-array: `features` is sometimes `{ title, items: [] }` (object)
 *     and sometimes `[]` (array). Extract `.items` when needed.
 *  3. Capabilities same issue — normalize the same way.
 *  4. hasData per-block validation: replaces the fragile "check first value" heuristic
 *     with an explicit isEmpty guard per block type so blocks are never wrongly hidden
 *     or wrongly shown.
 *  5. RelatedLinks heroCta: ensures `.primary` always exists on the passed CTA.
 *  6. Personas guard: `d.personas` could be undefined without the hardening guard
 *     firing because it wasn't in getV1BlockProps — added explicit fallback.
 *  7. SecurityGuardrails: normalize when the value is an object with an `items` key.
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
  Hero,
  Demo,
  Personas,
  Matrix,
  WorkflowSection,
  UseCases,
} from '@/components/landing/seo-blocks-1';

import {
  Steps,
  Features,
  Architecture,
  RelatedLinks,
  FAQs,
} from '@/components/landing/seo-blocks-2';

// UI Blocks - Phase 3 (Enterprise & Security)
import {
  SecurityGuardrails,
  ContrarianBanner,
  StrategicQuery,
  ExecutiveSummary,
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
};

// ----------------------------------------------------------------------
// ADAPTIVE LAYOUT CONFIGURATION (V1 Fallback)
// ----------------------------------------------------------------------
const LAYOUT_CONFIG: Record<string, string[]> = {
  guide:      ['Hero', 'ExecutiveSummary', 'Steps', 'FAQs', 'Demo', 'UseCases', 'Features', 'Architecture', 'RelatedLinks'],
  comparison: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Matrix', 'Features', 'Personas', 'UseCases', 'FAQs', 'RelatedLinks'],
  integration:['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'WorkflowSection', 'Demo', 'StrategicQuery', 'Features', 'Steps', 'SecurityGuardrails', 'Architecture', 'FAQs', 'RelatedLinks'],
  feature:    ['Hero', 'ExecutiveSummary', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'UseCases', 'Architecture', 'FAQs', 'RelatedLinks'],
  template:   ['Hero', 'Demo', 'Steps', 'UseCases', 'Features', 'Matrix', 'FAQs', 'RelatedLinks'],
  campaign:   ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Personas', 'UseCases', 'WorkflowSection', 'StrategicQuery', 'SecurityGuardrails', 'Features', 'Demo', 'FAQs', 'RelatedLinks'],
  default:    ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Demo', 'Personas', 'Matrix', 'WorkflowSection', 'UseCases', 'StrategicQuery', 'Steps', 'Features', 'SecurityGuardrails', 'Architecture', 'FAQs', 'RelatedLinks'],
};

// ----------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------

/** The default CTA used when none can be resolved from page data. */
const DEFAULT_CTA = { primary: { text: 'Start Free Trial', href: '/register' } };

/**
 * Normalizes whatever CTA shape exists in a raw hero object into the canonical
 * `{ primary: CTA; secondary?: CTA }` shape the Hero component expects.
 *
 * Data files use two different schemas:
 *   • New V1:  hero.cta = { primary: { text, href }, secondary?: ... }
 *   • Old V1:  hero.primaryCTA = { text, href }, hero.secondaryCTA = { text, href }
 *
 * Registry.ts performs this normalization too, but we repeat it here as a
 * second layer of defense so page.tsx never passes an invalid cta to <Hero>.
 */
function normalizeCta(
  cta: any,
  primaryCTA: any,
  secondaryCTA: any,
): { primary: { text: string; href: string }; secondary?: { text: string; href: string } } {
  // Already in canonical shape
  if (cta?.primary) return cta;

  // Old schema: hero.primaryCTA / hero.secondaryCTA
  if (primaryCTA) {
    return {
      primary: primaryCTA,
      ...(secondaryCTA ? { secondary: secondaryCTA } : {}),
    };
  }

  return DEFAULT_CTA;
}

/**
 * Coerces a features/capabilities value that may be either:
 *   - an array of `{ title, description }` objects  ← what Features component expects
 *   - an object `{ title: string; items: Array<...> }` ← what some data files emit
 * into a plain array. Returns `[]` if neither shape is recognised.
 */
function toFeatureArray(raw: any): Array<{ title: string; description?: string }> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Object with an `items` array (e.g. compliance-standards-1, text-to-sql-shopify-1 …)
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

/**
 * Coerces a security/guardrails value to an array.
 * Some pages store it as `{ items: [] }`.
 */
function toArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

// ----------------------------------------------------------------------
// PER-BLOCK EMPTY CHECK
// Maps a block type to a function that returns true when the block has no
// meaningful data to display and should be omitted from the render.
// Using explicit per-type guards beats the old "check first value" heuristic
// which could silently skip populated blocks or show empty ones.
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
  // Hero is never considered empty — it always renders.
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
// Converts a flat V1 page object into the exact props each block component
// expects. Each case is explicit so there is no silent property mismatch.
// ----------------------------------------------------------------------
function getV1BlockProps(type: string, data: any): Record<string, any> {
  const d = data || {};

  switch (type) {
    case 'Hero': {
      // registry.ts already normalises hero.primaryCTA → hero.cta.primary, but we
      // repeat the normalization here so this file is self-contained and resilient
      // to future changes in registry.ts.
      const rawHero = d.hero ?? {
        title:    d.h1 || d.heroTitle || d.seo?.h1 || d.title || 'Arcli Analytics',
        subtitle: d.heroDescription || d.description || d.seo?.description || 'Enterprise Data Intelligence',
      };

      const cta = normalizeCta(rawHero.cta, rawHero.primaryCTA, rawHero.secondaryCTA);
      const hero = { ...rawHero, cta };

      return {
        data: {
          ...d,
          hero,
          // Some older data files read d.cta directly rather than d.hero.cta
          cta,
        },
      };
    }

    case 'ExecutiveSummary':
      return {
        highlights: d.executiveSummary || (d.corePhilosophy ? Object.values(d.corePhilosophy) : []),
      };

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
      const scenario =
        d.strategicScenario ||
        d.executiveScenarios?.find((s: any) => s.complexity === 'Strategic') ||
        d.analyticalScenarios?.[0];
      return {
        scenario,
        code:            scenario?.sqlGenerated || scenario?.sql || scenario?.sqlSnippet,
        businessOutcome: scenario?.arcliResolution || scenario?.description,
      };
    }

    case 'SecurityGuardrails':
      // Normalize both array and `{ items: [] }` shapes
      return { items: toArray(d.securityGuardrails) || toArray(d.trustAndSecurity) || toArray(d.security) };

    case 'FAQs':
      return { faqs: d.faqs || [] };

    case 'RelatedLinks': {
      const rawCta = d.hero?.cta || d.cta;
      const heroCta = normalizeCta(rawCta, d.hero?.primaryCTA, d.hero?.secondaryCTA);
      return {
        slugs:   d.relatedSlugs || d.relatedBlueprints || [],
        heroCta,
      };
    }

    case 'Features':
      // FIX: features may be `{ title, items: [] }` (object) OR `[]` (array).
      // toFeatureArray handles both; falling back through capabilities / empty.
      return {
        features:
          toFeatureArray(d.features) ||
          toFeatureArray(d.capabilities) ||
          [],
      };

    case 'Steps':
      return { steps: d.steps || d.onboardingExperience || [] };

    case 'Architecture':
      return { architecture: d.architecture };

    default:
      // Advanced blocks (seo-blocks-4 through 9) all use `{ data }` prop shape.
      return { data: d };
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
  const renderList: Array<{ type: string; payload: any }> = isV2
    ? page.blocks
    : (LAYOUT_CONFIG[page.type] || LAYOUT_CONFIG.default).map((type) => ({
        type,
        payload: page,
      }));

  // JSON-LD Schema Generation
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

          // Build final props. V1 pages go through the normalizer above;
          // V2 blocks spread their payload directly (they ship pre-normalized data).
          const blockProps: Record<string, any> = isV2
            ? (block.payload ?? {})
            : getV1BlockProps(block.type, page);

          // Ensure mandatory array props are never undefined regardless of path.
          // These act as a final safety net after the normalizer above.
          if (!Array.isArray(blockProps.slugs))    blockProps.slugs    = blockProps.slugs    ?? [];
          if (!Array.isArray(blockProps.faqs))     blockProps.faqs     = blockProps.faqs     ?? [];
          if (!Array.isArray(blockProps.matrix))   blockProps.matrix   = blockProps.matrix   ?? [];
          if (!Array.isArray(blockProps.useCases)) blockProps.useCases = blockProps.useCases ?? [];
          if (!Array.isArray(blockProps.features)) blockProps.features = blockProps.features ?? [];
          if (!Array.isArray(blockProps.steps))    blockProps.steps    = blockProps.steps    ?? [];
          if (!Array.isArray(blockProps.personas)) blockProps.personas = blockProps.personas ?? [];
          if (!Array.isArray(blockProps.items))    blockProps.items    = blockProps.items    ?? [];

          // Skip the block if it has no meaningful data.
          // Hero always renders; for every other type we use an explicit guard
          // rather than a fragile "check first value" heuristic.
          if (block.type !== 'Hero') {
            const isEmpty = IS_EMPTY[block.type];
            if (isEmpty && isEmpty(blockProps)) return null;
          }

          return (
            <BlockComponent
              key={`${block.type}-${index}`}
              {...blockProps}
            />
          );
        })}
      </main>

      <Footer />
    </>
  );
}