/**
 * FILE: app/(landing)/[slug]/page.tsx
 * OBJECTIVE: Fix build crash during static generation for V1 pages.
 * FIX: Implement Hero fallback to H1 and harden array-based props.
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
  UseCases
} from '@/components/landing/seo-blocks-1';

import {
  Steps,
  Features,
  Architecture,
  RelatedLinks,
  FAQs
} from '@/components/landing/seo-blocks-2';

// UI Blocks - Phase 3 (Enterprise & Security)
import {
  SecurityGuardrails,
  ContrarianBanner,
  StrategicQuery,
  ExecutiveSummary
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
  ConcurrencyProof, TenantIsolationArchitecture, DeterministicGuardrails
};

// ----------------------------------------------------------------------
// ADAPTIVE LAYOUT CONFIGURATION (V1 Fallback)
// ----------------------------------------------------------------------
const LAYOUT_CONFIG: Record<string, string[]> = {
  guide: ['Hero', 'ExecutiveSummary', 'Steps', 'FAQs', 'Demo', 'UseCases', 'Features', 'Architecture', 'RelatedLinks'],
  comparison: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Matrix', 'Features', 'Personas', 'UseCases', 'FAQs', 'RelatedLinks'],
  integration: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'WorkflowSection', 'Demo', 'StrategicQuery', 'Features', 'Steps', 'SecurityGuardrails', 'Architecture', 'FAQs', 'RelatedLinks'],
  feature: ['Hero', 'ExecutiveSummary', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'UseCases', 'Architecture', 'FAQs', 'RelatedLinks'],
  template: ['Hero', 'Demo', 'Steps', 'UseCases', 'Features', 'Matrix', 'FAQs', 'RelatedLinks'],
  campaign: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Personas', 'UseCases', 'WorkflowSection', 'StrategicQuery', 'SecurityGuardrails', 'Features', 'Demo', 'FAQs', 'RelatedLinks'],
  default: ['Hero', 'ExecutiveSummary', 'ContrarianBanner', 'Demo', 'Personas', 'Matrix', 'WorkflowSection', 'UseCases', 'StrategicQuery', 'Steps', 'Features', 'SecurityGuardrails', 'Architecture', 'FAQs', 'RelatedLinks'],
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

/**
 * Normalizes V1 data into props expected by specific UI blocks.
 * Implements "Hero fallback to H1" and ensures arrays exist for V1 components.
 */
function getV1BlockProps(type: string, data: any) {
  const d = data || {};
  switch (type) {
    case 'Hero': {
      // FIX: Ensure hero exists and falls back to SEO metadata if missing
      const hero = d.hero || { 
        title: d.h1 || d.heroTitle || d.seo?.h1 || d.title || 'Arcli Analytics', 
        subtitle: d.heroDescription || d.description || d.seo?.description || 'Enterprise Data Intelligence' 
      };
      return { 
        data: { 
          ...d, 
          hero, 
          cta: d.ctaHierarchy || d.cta || { primary: { text: 'Start Free Trial', href: '/register' } } 
        } 
      };
    }
    case 'ExecutiveSummary': 
      return { 
        highlights: d.executiveSummary || (d.corePhilosophy ? Object.values(d.corePhilosophy) : []) 
      };
    case 'ContrarianBanner': 
      return { 
        statement: d.contrarianBanner?.statement || d.subtitle || d.seo?.h1, 
        subtext: d.contrarianBanner?.subtext || d.description 
      };
    case 'Matrix': 
      return { matrix: d.matrix || d.evaluationMatrix || d.competitiveAdvantage || [] };
    case 'UseCases': 
      return { useCases: d.useCases || d.executiveScenarios || d.analyticalScenarios || [] };
    case 'StrategicQuery': {
      const scenario = d.strategicScenario || d.executiveScenarios?.find((s: any) => s.complexity === 'Strategic') || d.analyticalScenarios?.[0];
      return { 
        scenario, 
        code: scenario?.sqlGenerated || scenario?.sql || scenario?.sqlSnippet,
        businessOutcome: scenario?.arcliResolution || scenario?.description 
      };
    }
    case 'SecurityGuardrails': 
      return { items: d.securityGuardrails || d.trustAndSecurity || d.security || [] };
    case 'FAQs': 
      return { faqs: d.faqs || [] };
    case 'RelatedLinks': 
      return { 
        slugs: d.relatedSlugs || d.relatedBlueprints || [], 
        heroCta: d.hero?.cta || d.cta || { primary: { text: 'Start Free Trial', href: '/register' } } 
      };
    case 'Features':
      return { features: d.features || d.capabilities || [] };
    case 'Steps':
      return { steps: d.steps || d.onboardingExperience || [] };
    default: 
      return { ...d };
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
  const renderList = isV2 
    ? page.blocks 
    : (LAYOUT_CONFIG[page.type] || LAYOUT_CONFIG.default).map(type => ({ type, payload: page }));

  // JSON-LD Schema Generation
  const schemas: any[] = [{
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: page.seo.h1,
    description: page.seo.description,
    author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
    datePublished: page.seo.datePublished || new Date().toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
  }];

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
        {renderList.map((block: any, index: number) => {
          const BlockComponent = BLOCK_REGISTRY[block.type];
          if (!BlockComponent) return null;

          // Advanced Prop Mapping with V1/V2 normalization
          const blockProps = isV2 
            ? (block.payload || {}) 
            : getV1BlockProps(block.type, page);

          // Component-Specific Hardening: Prevent "length of undefined" errors for V2 payloads
          if (block.type === 'RelatedLinks' && !blockProps.slugs) blockProps.slugs = [];
          if (block.type === 'FAQs' && !blockProps.faqs) blockProps.faqs = [];
          if (block.type === 'Matrix' && !blockProps.matrix) blockProps.matrix = [];
          if (block.type === 'UseCases' && !blockProps.useCases) blockProps.useCases = [];
          if (block.type === 'Features' && !blockProps.features) blockProps.features = [];
          if (block.type === 'Steps' && !blockProps.steps) blockProps.steps = [];

          // Validation: Hide empty blocks automatically
          const firstVal = Object.values(blockProps)[0];
          const hasData = firstVal !== undefined && firstVal !== null && (!Array.isArray(firstVal) || firstVal.length > 0);
          
          if (!hasData && block.type !== 'Hero') return null;

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