// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

// Data Parser
import { getNormalizedPage } from '@/lib/seo/parser';
import { getAllSlugs } from '@/lib/seo/index';

// UI Blocks (We will create this file next!)
import {
  Hero,
  Demo,
  Personas,
  Matrix,
  WorkflowSection,
  UseCases,
  Steps,
  Features,
  Architecture,
  RelatedLinks,
  FAQs
} from '@/components/landing/seo-blocks';

const BASE_URL = 'https://www.arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400;

interface PageProps { 
  params: Promise<{ slug: string }>; 
}

// ----------------------------------------------------------------------
// STATIC GENERATION & METADATA
// ----------------------------------------------------------------------
export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getNormalizedPage(slug);

  if (!data) notFound();

  return {
    title: data.seo.title,
    description: data.seo.description,
    openGraph: {
      title: data.seo.title,
      description: data.seo.description,
      type: 'article',
      url: `${BASE_URL}/${slug}`,
      images: [{ url: `${BASE_URL}/api/og?title=${encodeURIComponent(data.seo.h1)}&type=${encodeURIComponent(data.type)}`, width: 1200, height: 630 }],
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

  const techArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: data.seo.h1,
    description: data.seo.description,
    author: { '@type': 'Organization', name: 'Arcli Data Team', url: BASE_URL },
    datePublished: data.seo.datePublished,
    dateModified: data.seo.dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/${slug}` },
  };

  const faqSchema = data.faqs.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: data.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
      }
    : null;

  return (
    <>
      <Navbar />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
        <Hero data={data} />
        <Demo demo={data.demo} />
        <Personas personas={data.personas} />
        <Matrix matrix={data.matrix} />
        <WorkflowSection workflow={data.workflow} />
        <UseCases useCases={data.useCases} />
        <Steps steps={data.steps} />
        <Features features={data.features} />
        <Architecture architecture={data.architecture} />
        <FAQs faqs={data.faqs} />
        <RelatedLinks slugs={data.relatedSlugs} heroCta={data.hero.cta} />
      </main>

      <Footer />
    </>
  );
}