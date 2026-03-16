import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, 
  ChevronRight, 
  CheckCircle2, 
  X, 
  Check,
  ListTodo
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Centralized SEO data registry
import { seoPages, type SEOPageData } from '@/lib/seo/index';

// --- Configuration ---

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.arcli.tech';

interface PageProps { 
  params: { 
    slug: string; 
  }; 
}

// --- 1. Static Parameter Generation (Analytical Efficiency) ---

export function generateStaticParams() {
  return Object.keys(seoPages).map((slug) => ({ slug }));
}

// --- 2. Dynamic Metadata & OG Image Routing ---

export function generateMetadata({ params }: PageProps): Metadata {
  const pageData = seoPages[params.slug];
  if (!pageData) return { title: 'Page Not Found | Arclis' };

  const ogImageUrl = new URL(`${BASE_URL}/api/og`);
  ogImageUrl.searchParams.set('title', pageData.h1);
  ogImageUrl.searchParams.set('type', pageData.type);

  return {
    title: pageData.title,
    description: pageData.description,
    openGraph: {
      title: pageData.title,
      description: pageData.description,
      type: 'article',
      url: `${BASE_URL}/${params.slug}`,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }]
    },
    alternates: { canonical: `${BASE_URL}/${params.slug}` },
  };
}

// --- 3. JSON-LD Schema Generator (Pure Function) ---

const generateJsonLd = (pageData: SEOPageData, slug: string) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Arclis',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: pageData.description,
      url: `${BASE_URL}/${slug}`,
    },
    {
      '@type': 'Article',
      headline: pageData.h1,
      description: pageData.description,
      author: { '@type': 'Organization', name: 'Arclis', url: BASE_URL },
      publisher: { 
        '@type': 'Organization', 
        name: 'Arclis', 
        logo: { '@type': 'ImageObject', url: `${BASE_URL}/icon.png` } 
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id:': `${BASE_URL}/${slug}` }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: pageData.type.charAt(0).toUpperCase() + pageData.type.slice(1) + 's', item: `${BASE_URL}/${pageData.type}s` },
        { '@type': 'ListItem', position: 3, name: pageData.h1, item: `${BASE_URL}/${slug}` }
      ]
    },
    {
      '@type': 'FAQPage',
      mainEntity: pageData.faqs.map(faq => ({
        '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a }
      }))
    },
    {
      '@type': 'HowTo',
      name: `How to use ${pageData.h1}`,
      step: pageData.steps.map((step, idx) => ({
        '@type': 'HowToStep', position: idx + 1, name: step.name, text: step.text
      }))
    }
  ]
});

// --- 4. Modular Sub-Components (Interaction Guidelines) ---

const Breadcrumbs = ({ pageData, slug }: { pageData: SEOPageData; slug: string }) => (
  <div className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 mb-8 lg:px-8">
    <nav className="flex text-sm text-zinc-500 font-medium">
      <ol className="inline-flex items-center space-x-2">
        <li><Link href="/" className="hover:text-blue-600 transition-colors">Home</Link></li>
        <li><ChevronRight className="w-4 h-4 text-zinc-400" /></li>
        <li className="capitalize cursor-default">{pageData.type}s</li>
        <li><ChevronRight className="w-4 h-4 text-zinc-400" /></li>
        <li><span className="text-zinc-900 truncate max-w-[200px] sm:max-w-none block">{pageData.h1}</span></li>
      </ol>
    </nav>
  </div>
);

const SeoHero = ({ pageData }: { pageData: SEOPageData }) => (
  <section className="relative pb-20 border-b border-zinc-200 bg-white">
    <div className="max-w-4xl mx-auto px-6 relative z-10 text-center lg:px-8">
      <div className="flex justify-center mb-6 text-blue-600">{pageData.icon}</div>
      <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-zinc-900">
        {pageData.h1}
      </h1>
      <p className="text-xl md:text-2xl text-zinc-600 mx-auto mb-10 leading-relaxed max-w-2xl">
        {pageData.subtitle}
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link 
          href="/register" 
          className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-sm font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm"
        >
          Start Analyzing Free
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </div>
  </section>
);

const SeoToc = ({ hasComparison, competitor }: { hasComparison: boolean; competitor?: string }) => (
  <nav className="p-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 mb-12 shadow-sm">
    <div className="flex items-center gap-2 mb-4 text-zinc-900 font-semibold">
      <ListTodo className="w-5 h-5 text-blue-600" />
      <h2>Table of Contents</h2>
    </div>
    <ul className="grid sm:grid-cols-2 gap-3 text-sm text-zinc-600">
      <li><a href="#how-it-works" className="hover:text-blue-600 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-zinc-300"/> How it Works</a></li>
      {hasComparison && <li><a href="#comparison" className="hover:text-blue-600 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-zinc-300"/> {competitor} Comparison</a></li>}
      <li><a href="#use-cases" className="hover:text-blue-600 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-zinc-300"/> Use Cases & Benefits</a></li>
      <li><a href="#faq" className="hover:text-blue-600 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-zinc-300"/> Frequently Asked Questions</a></li>
    </ul>
  </nav>
);

const SeoSidebar = ({ pageData }: { pageData: SEOPageData }) => (
  <div className="sticky top-24 space-y-8">
    {/* Capabilities Box */}
    <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-900 mb-6">Capabilities</h3>
      <ul className="space-y-4 mb-8">
        {pageData.features.map((feature, idx) => (
          <li key={idx} className="flex items-start text-sm text-zinc-600">
            <CheckCircle2 className="w-4 h-4 text-blue-600 mr-3 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link 
        href="/register" 
        className="flex w-full h-10 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
      >
        Get Started Now
      </Link>
    </div>

    {/* Related Pages Siloing */}
    <div className="p-6 rounded-2xl border border-zinc-200 bg-zinc-50">
      <h3 className="text-lg font-semibold text-zinc-900 mb-4">Related Topics</h3>
      <div className="flex flex-col gap-2">
        {pageData.relatedSlugs.map((relatedSlug) => {
          const relatedData = seoPages[relatedSlug];
          if (!relatedData) return null;
          return (
            <Link 
              key={relatedSlug}
              href={`/${relatedSlug}`}
              className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-white transition-all text-sm text-zinc-600 hover:text-zinc-900"
            >
              <span className="truncate pr-4">{relatedData.title.split('|')[0].trim()}</span>
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-blue-600" />
            </Link>
          );
        })}
      </div>
    </div>
  </div>
);

// --- 5. Main Page Component ---

export default function SEOPage({ params }: PageProps) {
  const pageData = seoPages[params.slug];
  
  if (!pageData) {
    notFound();
  }

  const jsonLd = generateJsonLd(pageData, params.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="min-h-screen bg-white pb-24">
        <Breadcrumbs pageData={pageData} slug={params.slug} />
        <SeoHero pageData={pageData} />

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* MAIN CONTENT (Left Column) */}
            <div className="lg:col-span-8 space-y-24">
              
              <SeoToc 
                hasComparison={!!pageData.comparison} 
                competitor={pageData.comparison?.competitor} 
              />

              {/* HOW IT WORKS */}
              <div id="how-it-works" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">How it Works</h2>
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-zinc-200">
                  {pageData.steps.map((step, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 bg-white text-zinc-900 font-semibold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_8px_#ffffff]">
                        {idx + 1}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="font-bold text-lg text-zinc-900 mb-2">{step.name}</h3>
                        <p className="text-zinc-600 leading-relaxed">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COMPARISON */}
              {pageData.comparison && (
                <div id="comparison" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">
                    Arclis vs. {pageData.comparison.competitor}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {/* Competitor Box */}
                    <div className="p-8 rounded-2xl border border-zinc-200 bg-zinc-50">
                      <div className="text-xl font-bold text-zinc-500 mb-6">{pageData.comparison.competitor}</div>
                      <ul className="space-y-4">
                        {pageData.comparison.competitorFlaws.map((flaw, idx) => (
                          <li key={idx} className="flex items-start text-zinc-600">
                            <X className="w-5 h-5 mr-3 text-red-500 shrink-0 mt-0.5" />
                            {flaw}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Arclis Box */}
                    <div className="p-8 rounded-2xl border border-blue-200 bg-blue-50 relative overflow-hidden shadow-sm">
                      <div className="absolute top-0 right-0 px-3 py-1 bg-blue-600 text-xs font-bold text-white rounded-bl-lg">Modern Choice</div>
                      <div className="text-xl font-bold text-blue-900 mb-6">Arclis</div>
                      <ul className="space-y-4">
                        {pageData.comparison.arcliWins.map((win, idx) => (
                          <li key={idx} className="flex items-start text-blue-900/80">
                            <Check className="w-5 h-5 mr-3 text-blue-600 shrink-0 mt-0.5" />
                            {win}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* USE CASES */}
              <div id="use-cases" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">Use Cases & Benefits</h2>
                <div className="grid sm:grid-cols-2 gap-6">
                  {pageData.useCases.map((useCase, idx) => (
                    <div key={idx} className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <h4 className="font-semibold text-zinc-900 mb-2">{useCase.title}</h4>
                          <p className="text-sm text-zinc-600 leading-relaxed">{useCase.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQS */}
              <div id="faq" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">Frequently Asked Questions</h2>
                <Accordion type="single" collapsible className="w-full">
                  {pageData.faqs.map((faq, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`} className="border-zinc-200">
                      <AccordionTrigger className="text-left text-lg font-semibold text-zinc-900 hover:no-underline hover:text-blue-600 transition-colors">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-zinc-600 text-base leading-relaxed pt-2 pb-6">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

            </div>

            {/* SIDEBAR (Right Column) */}
            <div className="lg:col-span-4">
              <SeoSidebar pageData={pageData} />
            </div>

          </div>
        </section>
      </main>
    </>
  );
}