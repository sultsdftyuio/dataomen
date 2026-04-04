import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

// Data Parser & Slugs
import { getNormalizedPage } from '@/lib/seo/parser';
import { getAllSlugs } from '@/lib/seo/index';

// UI Blocks - Phase 3/4 Sophisticated Exports
import * as Blocks1 from '@/components/landing/seo-blocks-1';
import * as Blocks2 from '@/components/landing/seo-blocks-2';
import { SqlSnippetBlock } from '@/components/landing/sql-snippet-block';

const BASE_URL = 'https://arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400; // Controlled Determinism: 24h cycle

interface PageProps { 
  params: Promise<{ slug: string }>; 
}

/**
 * MASTER BLOCK REGISTRY
 * Maps polymorphic content keys to sophisticated UI components.
 * Updated for Protocol v3.1: Added SqlSnippet and mapped business depth blocks.
 */
const BLOCK_REGISTRY: Record<string, React.ComponentType<any>> = {
  Hero: Blocks1.Hero,
  Demo: Blocks1.Demo,
  SqlSnippet: SqlSnippetBlock, // NEW: LIGHT Mode Core
  Personas: Blocks1.Personas,
  Matrix: Blocks1.Matrix,
  WorkflowSection: Blocks1.WorkflowSection,
  Steps: Blocks2.Steps,
  Features: Blocks2.Features,
  Architecture: Blocks2.Architecture,
  FAQs: Blocks2.FAQs,
  RelatedLinks: Blocks2.RelatedLinks,
};

/**
 * LAYOUT ORCHESTRATION
 * Updated for Protocol v3.1: Split 'template' into 'template-light' and 'template-heavy'.
 */
const LAYOUT_CONFIG: Record<string, string[]> = {
  // LIGHT Mode: SQL-first, minimal narrative (Section 9.4)
  'template-light': ['Hero', 'SqlSnippet', 'Personas', 'FAQs', 'RelatedLinks'],
  
  // HEAVY Mode: Business + Technical Depth (Section 9.4)
  'template-heavy': ['Hero', 'Features', 'Steps', 'WorkflowSection', 'Matrix', 'Architecture', 'FAQs', 'RelatedLinks'],
  
  guide: ['Hero', 'Demo', 'WorkflowSection', 'Steps', 'Features', 'Architecture', 'FAQs', 'RelatedLinks'],
  comparison: ['Hero', 'Matrix', 'Features', 'Personas', 'Architecture', 'FAQs', 'RelatedLinks'],
  integration: ['Hero', 'WorkflowSection', 'Demo', 'Features', 'Steps', 'Architecture', 'FAQs', 'RelatedLinks'],
  feature: ['Hero', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'Architecture', 'FAQs', 'RelatedLinks'],
  campaign: ['Hero', 'Personas', 'Demo', 'WorkflowSection', 'Features', 'Architecture', 'FAQs', 'RelatedLinks'],
  default: ['Hero', 'Demo', 'Personas', 'Matrix', 'WorkflowSection', 'Steps', 'Features', 'Architecture', 'FAQs', 'RelatedLinks'],
};

// ----------------------------------------------------------------------
// STATIC GENERATION & METADATA
// ----------------------------------------------------------------------

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs
    .filter(slug => slug && slug.length > 1 && isNaN(Number(slug)))
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getNormalizedPage(slug);

  if (!data) return {};

  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', data.seo.h1 || data.seo.title);
  ogUrl.searchParams.set('type', data.type);
  
  // SEO Logic: Prioritize raw SQL in OG image for LIGHT mode
  if (data.features?.sqlQuery) {
    ogUrl.searchParams.set('code', data.features.sqlQuery);
  } else if (data.demo?.generatedSql) {
    ogUrl.searchParams.set('code', data.demo.generatedSql);
  }

  return {
    title: data.seo.title,
    description: data.seo.description,
    openGraph: {
      title: data.seo.title,
      description: data.seo.description,
      type: 'article',
      url: `${BASE_URL}/${slug}`,
      images: [{ url: ogUrl.toString(), width: 1200, height: 630 }],
    },
    alternates: { canonical: `${BASE_URL}/${slug}` },
  };
}

// ----------------------------------------------------------------------
// MAIN PAGE ORCHESTRATOR
// ----------------------------------------------------------------------

export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const data = getNormalizedPage(slug); 
  
  if (!data) notFound();

  // HEURISTIC MODE SELECTION (Section 9.1)
  const isLightMode = slug.includes('sql') || slug.includes('query') || slug.includes('example');
  const pageTypeKey = data.type === 'template' 
    ? (isLightMode ? 'template-light' : 'template-heavy') 
    : data.type;

  const layoutSequence = LAYOUT_CONFIG[pageTypeKey] || LAYOUT_CONFIG.default;

  // RICH SCHEMA ENGINE
  const schemas: any[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: data.seo.h1,
      description: data.seo.description,
      author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
    }
  ];

  if (data.faqs?.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faqs.map((faq: any) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
  }

  // SERVER-SIDE DATA RESOLUTION
  const resolvedRelatedPages = (data.relatedSlugs || [])
    .map((relatedSlug: string) => {
      const pageData = getNormalizedPage(relatedSlug);
      if (!pageData) return null;
      return {
        slug: relatedSlug,
        title: pageData.seo.h1 || pageData.seo.title,
        tag: pageData.tags?.[0] || pageData.type
      };
    })
    .filter(Boolean);

  return (
    <>
      {schemas.map((schema, index) => (
        <script 
          key={index} 
          type="application/ld+json" 
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} 
        />
      ))}

      <Navbar />

      <main className="min-h-screen bg-white selection:bg-[#2563eb] selection:text-white">
        {layoutSequence.map((blockKey) => {
          const BlockComponent = BLOCK_REGISTRY[blockKey];
          if (!BlockComponent) return null;

          // Prop Normalization & Data Routing (Section 2.2)
          const blockProps = (() => {
            switch (blockKey) {
              case 'Hero': return { data };
              case 'SqlSnippet': return { features: data.features };
              case 'Demo': return { demo: data.demo };
              case 'Personas': return { 
                // Map analytical scenarios to personas block if in Heavy mode
                personas: data.analyticalScenarios || data.personas 
              };
              case 'Matrix': return { matrix: data.matrix };
              case 'WorkflowSection': return { workflow: data.workflow };
              case 'Steps': return { 
                // Map Quickstart to Steps block
                steps: data.quickStart?.steps || data.steps 
              };
              case 'Features': return { 
                // Map ImmediateValue to Features block in Heavy mode
                features: data.immediateValue || data.features 
              };
              case 'Architecture': return { architecture: data.architecture };
              case 'FAQs': return { faqs: data.faqs };
              case 'RelatedLinks': return { relatedPages: resolvedRelatedPages, heroCta: data.hero?.cta };
              default: return {};
            }
          })();

          // Visibility Heuristics
          const propData = Object.values(blockProps)[0];
          let hasValidData = false;
          if (Array.isArray(propData)) hasValidData = propData.length > 0;
          else if (propData !== null && typeof propData === 'object') hasValidData = Object.keys(propData).length > 0;
          else hasValidData = propData !== undefined && propData !== null;
          
          if (!hasValidData && blockKey !== 'Hero') return null;

          return <BlockComponent key={blockKey} {...blockProps} data={data} />;
        })}
      </main>

      <Footer />
    </>
  );
}