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
// Note: Assuming these are exported from their respective files or unified here
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
// BLOCK REGISTRY (Phase 1-9 Consolidated)
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
// LEGACY LAYOUT CONFIGURATION (V1 Fallback)
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

  // Robust snippet extraction: Prioritize V2 block data, then V1 root properties
  const codeSnippet = 
    page.blocks?.find((b: any) => b.type === 'StrategicQuery')?.payload?.code ||
    page.strategicScenario?.sql || 
    page.demo?.generatedSql ||
    page.useCases?.find((u: any) => u.sqlSnippet)?.sqlSnippet;
  
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
// HYBRID PAGE COMPONENT
// ----------------------------------------------------------------------
export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getNormalizedPage(slug); 
  if (!page) notFound();

  // 1. Logic Path Detection
  const isV2 = Array.isArray(page.blocks);
  
  // 2. Build Render List (Dynamic Blocks or Legacy Sequence)
  const renderList = isV2 
    ? page.blocks 
    : (LAYOUT_CONFIG[page.type] || LAYOUT_CONFIG.default).map(type => ({ type, payload: page }));

  // 3. Schema Injection Engine (Cross-Generation Support)
  const schemas: any[] = [{
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: page.seo.h1,
    description: page.seo.description,
    author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
    datePublished: page.seo.datePublished || new Date().toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
  }];

  // Detect FAQs in either schema type
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

  // Detect Steps for HowTo schema (V1 focus)
  if (page.steps?.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: page.seo.h1,
      step: page.steps.map((s: any, i: number) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.title,
        text: s.description
      }))
    });
  }

  return (
    <>
      <Navbar />

      {/* SERP Optimization Tags */}
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

          // Advanced Prop Mapping: Handles V1 key mismatch and V2 payload spreads
          const blockProps = isV2 ? block.payload : (() => {
            const d = page;
            switch (block.type) {
              case 'Hero': return { data: d };
              case 'ExecutiveSummary': return { highlights: d.executiveSummary };
              case 'ContrarianBanner': return { statement: d.contrarianBanner?.statement, subtext: d.contrarianBanner?.subtext };
              case 'Demo': return { demo: d.demo };
              case 'Personas': return { personas: d.personas };
              case 'Matrix': return { matrix: d.matrix };
              case 'WorkflowSection': return { workflow: d.workflow };
              case 'UseCases': return { useCases: d.useCases };
              case 'StrategicQuery': return { scenario: d.strategicScenario, ...d.strategicScenario }; // Hybrid spread
              case 'SecurityGuardrails': return { items: d.securityGuardrails };
              case 'Steps': return { steps: d.steps };
              case 'Features': return { features: d.features };
              case 'Architecture': return { architecture: d.architecture };
              case 'FAQs': return { faqs: d.faqs };
              case 'RelatedLinks': return { slugs: d.relatedSlugs, heroCta: d.hero?.cta };
              default: return { data: d };
            }
          })();

          // Render optimization: Hide empty blocks automatically
          const checkVal = Object.values(blockProps)[0];
          const hasData = checkVal !== undefined && checkVal !== null && (!Array.isArray(checkVal) || checkVal.length > 0);
          
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