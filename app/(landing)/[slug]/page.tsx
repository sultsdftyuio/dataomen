import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';

// Data Parser & Slugs
import { getNormalizedPage } from '@/lib/seo/parser';
import { getAllSlugs } from '@/lib/seo/index';

// UI Blocks - Phase 3/4 Sophisticated Exports
import * as Blocks1 from '@/components/landing/seo-blocks-1';
import * as Blocks2 from '@/components/landing/seo-blocks-2';

const BASE_URL = 'https://arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400; // Controlled Determinism: 24h cycle

interface PageProps { 
  params: Promise<{ slug: string }>; 
}

/**
 * MASTER BLOCK REGISTRY
 * Maps polymorphic content keys to sophisticated UI components.
 */
const BLOCK_REGISTRY: Record<string, React.ComponentType<any>> = {
  Hero: Blocks1.Hero,
  Demo: Blocks1.Demo,
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
 * Deterministic section ordering based on persona/page intent.
 */
const LAYOUT_CONFIG: Record<string, string[]> = {
  guide: ['Hero', 'Steps', 'FAQs', 'Demo', 'Features', 'Architecture', 'RelatedLinks'],
  comparison: ['Hero', 'Matrix', 'Features', 'Personas', 'FAQs', 'RelatedLinks'],
  integration: ['Hero', 'WorkflowSection', 'Demo', 'Features', 'Steps', 'Architecture', 'FAQs', 'RelatedLinks'],
  feature: ['Hero', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'Architecture', 'FAQs', 'RelatedLinks'],
  template: ['Hero', 'Demo', 'Steps', 'Features', 'Matrix', 'FAQs', 'RelatedLinks'],
  campaign: ['Hero', 'Personas', 'Demo', 'WorkflowSection', 'Features', 'FAQs', 'RelatedLinks'],
  default: ['Hero', 'Demo', 'Personas', 'Matrix', 'WorkflowSection', 'Steps', 'Features', 'Architecture', 'FAQs', 'RelatedLinks'],
};

// ----------------------------------------------------------------------
// STATIC GENERATION & METADATA
// ----------------------------------------------------------------------

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  // Data Normalization: Filter out numeric IDs and '0' placeholders to prevent Vercel build failure
  return slugs
    .filter(slug => slug && slug.length > 1 && isNaN(Number(slug)))
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getNormalizedPage(slug);

  if (!data) return {};

  // Phase 4: Developer-First OG Strategy
  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', data.seo.h1 || data.seo.title);
  ogUrl.searchParams.set('type', data.type);
  
  if (data.demo?.generatedSql) {
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

  // RICH SCHEMA ENGINE: TechArticle + Contextual JSON-LD
  const schemas: any[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: data.seo.h1,
      description: data.seo.description,
      author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
      datePublished: data.seo.datePublished,
      dateModified: data.seo.dateModified,
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

  // SERVER-SIDE DATA RESOLUTION (Preventing 'fs' import in browser via relatedSlugs)
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

  const layoutSequence = LAYOUT_CONFIG[data.type] || LAYOUT_CONFIG.default;

  return (
    <>
      {/* Semantic SERP Injections */}
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

          // Prop Normalization & Data Routing
          const blockProps = (() => {
            switch (blockKey) {
              case 'Hero': return { data };
              case 'Demo': return { demo: data.demo };
              case 'Personas': return { personas: data.personas };
              case 'Matrix': return { matrix: data.matrix };
              case 'WorkflowSection': return { workflow: data.workflow };
              case 'Steps': return { steps: data.steps };
              case 'Features': return { features: data.features };
              case 'Architecture': return { architecture: data.architecture };
              case 'FAQs': return { faqs: data.faqs };
              case 'RelatedLinks': return { relatedPages: resolvedRelatedPages, heroCta: data.hero?.cta };
              default: return {};
            }
          })();

          // Block Visibility Heuristics: Do not render empty sections
          const propData = Object.values(blockProps)[0];
          const hasValidData = propData !== undefined && propData !== null && (!Array.isArray(propData) || propData.length > 0);
          
          if (!hasValidData && blockKey !== 'Hero') return null;

          return <BlockComponent key={blockKey} {...blockProps} data={data} />;
        })}
      </main>

      <Footer />
    </>
  );
}