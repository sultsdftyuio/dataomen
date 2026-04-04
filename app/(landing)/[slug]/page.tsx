// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

// Data Parser
import { getNormalizedPage } from '@/lib/seo/parser';
import { getAllSlugs } from '@/lib/seo/registry';

// UI Blocks
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

const BASE_URL = 'https://www.arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400;

interface PageProps { 
  params: Promise<{ slug: string }>; 
}

// ----------------------------------------------------------------------
// BLOCK ORCHESTRATOR CONFIGURATION (PHASE 1)
// ----------------------------------------------------------------------
type BlockKey = 
  | 'Hero' 
  | 'Demo' 
  | 'Personas' 
  | 'Matrix' 
  | 'WorkflowSection' 
  | 'UseCases' 
  | 'Steps' 
  | 'Features' 
  | 'Architecture' 
  | 'FAQs' 
  | 'RelatedLinks';

const LAYOUT_CONFIG: Record<string, BlockKey[]> = {
  guide: ['Hero', 'Steps', 'FAQs', 'Demo', 'UseCases', 'Features', 'Architecture', 'RelatedLinks'],
  comparison: ['Hero', 'Matrix', 'Features', 'Personas', 'UseCases', 'FAQs', 'RelatedLinks'],
  integration: ['Hero', 'WorkflowSection', 'Demo', 'Features', 'Steps', 'Architecture', 'FAQs', 'RelatedLinks'],
  feature: ['Hero', 'Demo', 'Personas', 'Features', 'WorkflowSection', 'UseCases', 'Architecture', 'FAQs', 'RelatedLinks'],
  template: ['Hero', 'Demo', 'Steps', 'UseCases', 'Features', 'Matrix', 'FAQs', 'RelatedLinks'],
  campaign: ['Hero', 'Personas', 'UseCases', 'Demo', 'WorkflowSection', 'Features', 'FAQs', 'RelatedLinks'],
  default: ['Hero', 'Demo', 'Personas', 'Matrix', 'WorkflowSection', 'UseCases', 'Steps', 'Features', 'Architecture', 'FAQs', 'RelatedLinks'],
};

const BLOCK_REGISTRY: Record<BlockKey, React.ElementType> = {
  Hero, Demo, Personas, Matrix, WorkflowSection, UseCases,
  Steps, Features, Architecture, FAQs, RelatedLinks
};

// ----------------------------------------------------------------------
// STATIC GENERATION & METADATA (PHASE 4 UPGRADED)
// ----------------------------------------------------------------------
export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getNormalizedPage(slug);

  if (!data) notFound();

  // Phase 4: Code-Injected OG Image URLs
  // Dynamically extract the best SQL snippet to showcase developer credibility in social feeds
  const codeSnippet = data.demo?.generatedSql || data.useCases?.find(u => u.sqlSnippet)?.sqlSnippet;
  
  const ogUrl = new URL(`${BASE_URL}/api/og`);
  ogUrl.searchParams.set('title', data.seo.h1);
  ogUrl.searchParams.set('type', data.type);
  if (codeSnippet) {
    ogUrl.searchParams.set('code', codeSnippet);
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
// MAIN PAGE COMPONENT
// ----------------------------------------------------------------------
export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const data = getNormalizedPage(slug); 
  
  if (!data) notFound();

  // PHASE 4: Rich Schema Injection Engine
  // 1. Base TechArticle Schema (All Pages)
  const schemas: any[] = [{
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: data.seo.h1,
    description: data.seo.description,
    author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
    datePublished: data.seo.datePublished,
    dateModified: data.seo.dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
  }];

  // 2. FAQ Schema
  if (data.faqs && data.faqs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
  }

  // 3. Software Application Schema (Integration Pages)
  if (data.type === 'integration') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: data.seo.h1,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Cloud',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description: data.seo.description
    });
  }

  // 4. How-To Schema (Guide Pages)
  if (data.type === 'guide' && data.steps && data.steps.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: data.seo.h1,
      description: data.seo.description,
      step: data.steps.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        name: step.title,
        text: step.description
      }))
    });
  }

  // Retrieve the appropriate layout sequence for the current page type
  const layoutSequence = LAYOUT_CONFIG[data.type] || LAYOUT_CONFIG.default;

  return (
    <>
      <Navbar />

      {/* Semantic SERP Injections */}
      {schemas.map((schema, index) => (
        <script 
          key={index} 
          type="application/ld+json" 
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} 
        />
      ))}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        {layoutSequence.map((blockKey) => {
          const BlockComponent = BLOCK_REGISTRY[blockKey];
          
          // Data routing to the appropriate block prop payload
          const blockProps = (() => {
            switch (blockKey) {
              case 'Hero': return { data };
              case 'Demo': return { demo: data.demo };
              case 'Personas': return { personas: data.personas };
              case 'Matrix': return { matrix: data.matrix };
              case 'WorkflowSection': return { workflow: data.workflow };
              case 'UseCases': return { useCases: data.useCases };
              case 'Steps': return { steps: data.steps };
              case 'Features': return { features: data.features };
              case 'Architecture': return { architecture: data.architecture };
              case 'FAQs': return { faqs: data.faqs };
              case 'RelatedLinks': return { slugs: data.relatedSlugs, heroCta: data.hero?.cta };
              default: return {};
            }
          })();

          // Render optimization: Automatically hide blocks if their assigned data is missing/empty.
          const requiredData = Object.values(blockProps)[0];
          const hasData = requiredData !== undefined && requiredData !== null && (!Array.isArray(requiredData) || requiredData.length > 0);
          
          if (!hasData && blockKey !== 'Hero') return null;

          return <BlockComponent key={blockKey} {...blockProps} />;
        })}
      </main>

      <Footer />
    </>
  );
}