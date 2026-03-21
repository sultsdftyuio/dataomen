// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, 
  ChevronRight, 
  CheckCircle2, 
  X, 
  Check,
  ListTodo,
  Cpu,
  Database,
  Layers
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Centralized SEO data registry
import { seoPages, type SEOPageData } from '@/lib/seo/index';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.arcli.tech';

interface PageProps { 
  params: Promise<{ slug: string; }>; 
}

// --- 1. Static Parameter Generation ---
export function generateStaticParams() {
  return Object.keys(seoPages).map((slug) => ({ slug }));
}

// --- 2. Dynamic Metadata & OG Image Routing ---
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const pageData = seoPages[slug] as any; // Type cast for flexible access
  
  if (!pageData) return { title: 'Page Not Found | Arcli' };

  const h1 = pageData.h1 || pageData.hero?.h1;
  const description = pageData.description || pageData.metadata?.description;
  const title = pageData.title || pageData.metadata?.title;

  const ogImageUrl = new URL(`${BASE_URL}/api/og`);
  ogImageUrl.searchParams.set('title', h1);
  ogImageUrl.searchParams.set('type', pageData.type);

  return {
    title: title,
    description: description,
    openGraph: {
      title: title,
      description: description,
      type: 'article',
      url: `${BASE_URL}/${slug}`,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }]
    },
    alternates: { canonical: `${BASE_URL}/${slug}` },
  };
}

// --- 3. JSON-LD Schema Generator ---
const generateJsonLd = (pageData: any, slug: string) => {
  const steps = pageData.steps || pageData.orchestrationWorkflow || [];
  const faqs = pageData.faqs || pageData.governanceAndSecurity || [];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Arcli',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: pageData.description || pageData.metadata?.description,
        url: `${BASE_URL}/${slug}`,
      },
      {
        '@type': 'Article',
        headline: pageData.h1 || pageData.hero?.h1,
        description: pageData.description || pageData.metadata?.description,
        author: { '@type': 'Organization', name: 'Arcli', url: BASE_URL },
        publisher: { 
          '@type': 'Organization', 
          name: 'Arcli', 
          logo: { '@type': 'ImageObject', url: `${BASE_URL}/icon.png` } 
        }
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq: any) => ({
          '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a }
        }))
      },
      {
        '@type': 'HowTo',
        name: `How to use ${pageData.h1 || pageData.hero?.h1}`,
        step: steps.map((step: any, idx: number) => ({
          '@type': 'HowToStep', position: idx + 1, name: step.name || step.phase, text: step.text || step.action
        }))
      }
    ]
  };
};

// --- 4. Sub-Components ---

const Breadcrumbs = ({ pageData, slug }: { pageData: any; slug: string }) => (
  <div className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 mb-8 lg:px-8">
    <nav className="flex text-sm text-zinc-500 font-medium">
      <ol className="inline-flex items-center space-x-2">
        <li><Link href="/" className="hover:text-blue-600 transition-colors">Home</Link></li>
        <li><ChevronRight className="w-4 h-4 text-zinc-400" /></li>
        <li className="capitalize cursor-default">{pageData.type}s</li>
        <li><ChevronRight className="w-4 h-4 text-zinc-400" /></li>
        <li><span className="text-zinc-900 truncate max-w-[200px] sm:max-w-none block">{pageData.h1 || pageData.hero?.h1}</span></li>
      </ol>
    </nav>
  </div>
);

const SeoHero = ({ pageData }: { pageData: any }) => {
  const h1 = pageData.h1 || pageData.hero?.h1;
  const subtitle = pageData.subtitle || pageData.hero?.subtitle;
  const icon = pageData.icon || pageData.hero?.icon;

  return (
    <section className="relative pb-20 border-b border-zinc-200 bg-white">
      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center lg:px-8">
        <div className="flex justify-center mb-6">{icon}</div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-zinc-900">
          {h1}
        </h1>
        <p className="text-xl md:text-2xl text-zinc-600 mx-auto mb-10 leading-relaxed max-w-2xl">
          {subtitle}
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
};

// --- 5. Main Page Component ---

export default async function SEOPage({ params }: PageProps) {
  const { slug } = await params;
  const pageData = seoPages[slug] as any; // Cast to bypass strict union enforcement in template rendering
  
  if (!pageData) {
    notFound();
  }

  const jsonLd = generateJsonLd(pageData, slug);

  // Safely extract arrays that might be named differently depending on the schema
  const steps = pageData.steps || pageData.orchestrationWorkflow;
  const useCases = pageData.useCases || pageData.enterpriseApplications;
  const faqs = pageData.faqs || pageData.governanceAndSecurity;
  const features = pageData.features || pageData.performanceMetrics || [];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="min-h-screen bg-white pb-24">
        <Breadcrumbs pageData={pageData} slug={slug} />
        <SeoHero pageData={pageData} />

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* MAIN CONTENT (Left Column) */}
            <div className="lg:col-span-8 space-y-24">

              {/* DYNAMIC ARCHITECTURAL SECTIONS */}
              
              {/* 1. Technical Stack / Architecture */}
              {(pageData.technicalStack || pageData.technicalArchitecture) && (
                <div className="p-8 rounded-2xl border border-zinc-200 bg-zinc-50 shadow-sm">
                  <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    System Architecture
                  </h2>
                  <div className="grid sm:grid-cols-3 gap-6">
                    {Object.entries(pageData.technicalStack || pageData.technicalArchitecture).map(([key, value]) => (
                      <div key={key}>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="text-sm font-medium text-zinc-900">{value as string}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Challenge Context / The Alternative */}
              {(pageData.challengeContext || pageData.theAlternative || pageData.strategicContext) && (
                <div>
                  <h2 className="text-3xl font-bold text-zinc-900 mb-6 border-b border-zinc-200 pb-4">
                    {(pageData.challengeContext?.title || pageData.theAlternative?.title || pageData.strategicContext?.title || "The Analytical Challenge")}
                  </h2>
                  <div className="prose prose-zinc max-w-none mb-6">
                    <p className="text-lg text-zinc-600 leading-relaxed">
                      {pageData.challengeContext?.traditionalMethod || pageData.strategicContext?.arcliEfficiency || pageData.theAlternative?.arcliApproach}
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {(pageData.challengeContext?.bottlenecks || pageData.strategicContext?.industrialConstraints || pageData.theAlternative?.focus || []).map((point: string, idx: number) => (
                      <li key={idx} className="flex items-start text-zinc-600 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                        <X className="w-5 h-5 mr-3 text-rose-500 shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. Execution / Steps */}
              {steps && (
                <div id="how-it-works" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">Execution Workflow</h2>
                  <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-zinc-200">
                    {steps.map((step: any, idx: number) => (
                      <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 bg-white text-zinc-900 font-semibold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_8px_#ffffff]">
                          {idx + 1}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <h3 className="font-bold text-lg text-zinc-900 mb-2">{step.name || step.phase}</h3>
                          <p className="text-zinc-600 leading-relaxed">{step.text || step.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Comparison Block (Safely checks for modern schema terms) */}
              {pageData.comparison && (
                <div id="comparison" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">
                    Architectural Comparison
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {/* Legacy Box */}
                    <div className="p-8 rounded-2xl border border-zinc-200 bg-zinc-50">
                      <div className="text-xl font-bold text-zinc-500 mb-6">{pageData.comparison.competitor || "Traditional Tools"}</div>
                      <ul className="space-y-4">
                        {(pageData.comparison.traditionalApproach || pageData.comparison.competitorFlaws || []).map((flaw: string, idx: number) => (
                          <li key={idx} className="flex items-start text-zinc-600">
                            <X className="w-5 h-5 mr-3 text-red-500 shrink-0 mt-0.5" />
                            {flaw}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Arcli Box */}
                    <div className="p-8 rounded-2xl border border-blue-200 bg-blue-50 relative overflow-hidden shadow-sm">
                      <div className="absolute top-0 right-0 px-3 py-1 bg-blue-600 text-xs font-bold text-white rounded-bl-lg">Modern Compute</div>
                      <div className="text-xl font-bold text-blue-900 mb-6">Arcli Architecture</div>
                      <ul className="space-y-4">
                        {(pageData.comparison.theArcliAdvantage || pageData.comparison.arcliWins || []).map((win: string, idx: number) => (
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

              {/* 5. Use Cases / Enterprise Applications */}
              {useCases && (
                <div id="use-cases" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">Enterprise Applications</h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {useCases.map((useCase: any, idx: number) => (
                      <div key={idx} className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm hover:border-blue-200 transition-colors group">
                        <div className="flex items-start gap-3">
                          <Cpu className="w-5 h-5 text-blue-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                          <div>
                            <h4 className="font-semibold text-zinc-900 mb-2">{useCase.title || useCase.vertical}</h4>
                            <p className="text-sm text-zinc-600 leading-relaxed">{useCase.description || useCase.application}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. FAQs / Governance */}
              {faqs && (
                <div id="faq" className="scroll-mt-24">
                  <h2 className="text-3xl font-bold text-zinc-900 mb-8 border-b border-zinc-200 pb-4">Governance & FAQs</h2>
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq: any, idx: number) => (
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
              )}

            </div>

            {/* SIDEBAR (Right Column) */}
            <div className="lg:col-span-4">
              <div className="sticky top-24 space-y-8">
                
                {/* Capabilities Box */}
                <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-600"/>
                    Core Capabilities
                  </h3>
                  <ul className="space-y-4 mb-8">
                    {features.map((feature: string, idx: number) => (
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
                    Deploy Engine
                  </Link>
                </div>

                {/* Related Pages Siloing */}
                <div className="p-6 rounded-2xl border border-zinc-200 bg-zinc-50">
                  <h3 className="text-lg font-semibold text-zinc-900 mb-4">Related Architectures</h3>
                  <div className="flex flex-col gap-2">
                    {(pageData.relatedSlugs || pageData.relatedBlueprints || []).map((relatedSlug: string) => {
                      const relatedData = seoPages[relatedSlug] as any;
                      if (!relatedData) return null;
                      const title = relatedData.title || relatedData.metadata?.title || relatedSlug;
                      return (
                        <Link 
                          key={relatedSlug}
                          href={`/${relatedSlug}`}
                          className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-white transition-all text-sm text-zinc-600 hover:text-zinc-900 shadow-sm"
                        >
                          <span className="truncate pr-4 font-medium">{title.split('|')[0].trim()}</span>
                          <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-blue-600" />
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