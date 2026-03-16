import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, BarChart3, Database, FileSpreadsheet, Sparkles, 
  ChevronRight, CheckCircle2, ShoppingCart, CreditCard, X, Check,
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

interface PageProps { params: { slug: string; }; }

/**
 * 1. STATIC PARAMETER GENERATION
 * Pre-renders all SEO silo pages at build time for 0ms latency on arcli.tech.
 */
export function generateStaticParams() {
  return Object.keys(seoPages).map((slug) => ({ slug }));
}

/**
 * 2. DYNAMIC METADATA & AUTOMATIC OG IMAGES
 * Domain updated to arcli.tech for search engine indexing.
 */
export function generateMetadata({ params }: PageProps): Metadata {
  const pageData = seoPages[params.slug];
  if (!pageData) return { title: 'Not Found' };

  const ogImageUrl = new URL('https://arcli.tech/api/og');
  ogImageUrl.searchParams.set('title', pageData.h1);
  ogImageUrl.searchParams.set('type', pageData.type);

  return {
    title: pageData.title,
    description: pageData.description,
    openGraph: {
      title: pageData.title,
      description: pageData.description,
      type: 'article',
      url: `https://arcli.tech/${params.slug}`,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }]
    },
    alternates: { canonical: `https://arcli.tech/${params.slug}` },
  };
}

export default function SEOPage({ params }: PageProps) {
  const pageData = seoPages[params.slug];
  if (!pageData) notFound();

  /**
   * 3. THE ARCLI JSON-LD GRAPH
   * Rich schema for arcli.tech including SoftwareApplication and FAQ datasets.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Arcli',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: pageData.description,
        url: `https://arcli.tech/${params.slug}`,
      },
      {
        '@type': 'Article',
        headline: pageData.h1,
        description: pageData.description,
        author: { '@type': 'Organization', name: 'Arcli', url: 'https://arcli.tech' },
        publisher: { 
          '@type': 'Organization', 
          name: 'Arcli', 
          logo: { '@type': 'ImageObject', url: 'https://arcli.tech/icon.png' } 
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id:': `https://arcli.tech/${params.slug}` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://arcli.tech' },
          { '@type': 'ListItem', position: 2, name: pageData.type.charAt(0).toUpperCase() + pageData.type.slice(1) + 's', item: `https://arcli.tech/${pageData.type}s` },
          { '@type': 'ListItem', position: 3, name: pageData.h1, item: `https://arcli.tech/${params.slug}` }
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
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="min-h-screen bg-neutral-950 text-neutral-50 pb-24">
        
        {/* BREADCRUMBS */}
        <div className="container max-w-6xl mx-auto px-4 pt-24 md:pt-32 mb-8">
          <nav className="flex text-sm text-neutral-500 font-medium">
            <ol className="inline-flex items-center space-x-2">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><ChevronRight className="w-4 h-4" /></li>
              <li className="capitalize"><span className="hover:text-white transition-colors cursor-default">{pageData.type}s</span></li>
              <li><ChevronRight className="w-4 h-4" /></li>
              <li><span className="text-neutral-300 truncate max-w-[200px] sm:max-w-none block">{pageData.h1}</span></li>
            </ol>
          </nav>
        </div>

        {/* HERO SECTION */}
        <section className="relative pb-20 border-b border-white/10">
          <div className="container relative z-10 px-4 max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6">{pageData.icon}</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              {pageData.h1}
            </h1>
            <p className="text-xl md:text-2xl text-neutral-400 mx-auto mb-10 leading-relaxed">
              {pageData.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                Start Analyzing Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-4 max-w-6xl mx-auto grid lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* MAIN CONTENT (Left) */}
            <div className="lg:col-span-8 space-y-24">
              
              {/* TABLE OF CONTENTS */}
              <nav className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] mb-12">
                <div className="flex items-center gap-2 mb-4 text-white font-semibold">
                  <ListTodo className="w-5 h-5 text-blue-500" />
                  <h2>Table of Contents</h2>
                </div>
                <ul className="grid sm:grid-cols-2 gap-3 text-sm text-neutral-400">
                  <li><a href="#how-it-works" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> How it Works</a></li>
                  {pageData.comparison && <li><a href="#comparison" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> {pageData.comparison.competitor} Comparison</a></li>}
                  <li><a href="#use-cases" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> Use Cases & Benefits</a></li>
                  <li><a href="#faq" className="hover:text-blue-400 transition-colors flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white/20"/> Frequently Asked Questions</a></li>
                </ul>
              </nav>

              {/* HOW IT WORKS */}
              <div id="how-it-works" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">How it Works</h2>
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-white/10">
                  {pageData.steps.map((step, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-neutral-950 text-neutral-300 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_8px_#0a0a0a]">
                        {idx + 1}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <h3 className="font-bold text-lg text-white mb-2">{step.name}</h3>
                        <p className="text-neutral-400 leading-relaxed">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COMPARISON - Arcli Performance Layer */}
              {pageData.comparison && (
                <div id="comparison" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">Arcli vs. {pageData.comparison.competitor}</h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="p-8 rounded-2xl border border-white/5 bg-neutral-900/50">
                      <div className="text-xl font-bold text-neutral-400 mb-6">{pageData.comparison.competitor}</div>
                      <ul className="space-y-4">
                        {pageData.comparison.competitorFlaws.map((flaw, idx) => (
                          <li key={idx} className="flex items-start text-neutral-500">
                            <X className="w-5 h-5 mr-3 text-red-500/50 shrink-0 mt-0.5" />
                            {flaw}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-8 rounded-2xl border border-blue-500/30 bg-blue-500/5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-xs font-bold text-white rounded-bl-lg">Modern Choice</div>
                      <div className="text-xl font-bold text-white mb-6">Arcli</div>
                      <ul className="space-y-4">
                        {pageData.comparison.arcliWins.map((win, idx) => (
                          <li key={idx} className="flex items-start text-neutral-200">
                            <Check className="w-5 h-5 mr-3 text-blue-400 shrink-0 mt-0.5" />
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
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">Use Cases & Benefits</h2>
                <div className="grid sm:grid-cols-2 gap-6">
                  {pageData.useCases.map((useCase, idx) => (
                    <div key={idx} className="p-6 rounded-xl bg-white/[0.02] border border-white/10">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <h4 className="font-semibold text-white mb-2">{useCase.title}</h4>
                          <p className="text-sm text-neutral-400 leading-relaxed">{useCase.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQS */}
              <div id="faq" className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-white mb-8 border-b border-white/10 pb-4">Frequently Asked Questions</h2>
                <Accordion type="single" collapsible className="w-full">
                  {pageData.faqs.map((faq, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`} className="border-white/10">
                      <AccordionTrigger className="text-left text-lg hover:no-underline hover:text-blue-400 transition-colors">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-neutral-400 text-base leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

            </div>

            {/* SIDEBAR (Right) */}
            <div className="lg:col-span-4">
              <div className="sticky top-24 space-y-8">
                
                {/* Capabilities Box */}
                <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <h3 className="text-lg font-semibold text-white mb-6">Capabilities</h3>
                  <ul className="space-y-4 mb-8">
                    {pageData.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 mr-3 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className="flex w-full h-10 items-center justify-center rounded-md bg-white text-sm font-semibold text-black transition-colors hover:bg-neutral-200">
                    Get Started Now
                  </Link>
                </div>

                {/* Related Pages Siloing */}
                <div className="p-6 rounded-2xl border border-white/10 bg-black/50">
                  <h3 className="text-lg font-semibold text-white mb-4">Related Topics</h3>
                  <div className="flex flex-col gap-2">
                    {pageData.relatedSlugs.map((relatedSlug) => {
                      const relatedData = seoPages[relatedSlug];
                      if (!relatedData) return null;
                      return (
                        <Link 
                          key={relatedSlug}
                          href={`/${relatedSlug}`}
                          className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-all text-sm text-neutral-400 hover:text-white"
                        >
                          <span className="truncate pr-4">{relatedData.title.split('|')[0].trim()}</span>
                          <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </section>
      </main>
    </>
  );
}