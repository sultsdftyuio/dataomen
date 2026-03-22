// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import React from 'react';
import { 
  ArrowRight, 
  ChevronRight, 
  CheckCircle2, 
  X, 
  Check,
  Cpu,
  Database,
  Layers,
  ShieldCheck,
  Zap,
  LayoutTemplate
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Modular Registry & Type Imports
import { 
  seoPages, 
  getPage, 
  getAllSlugs, 
  isTemplatePage, 
  type SEOPageData 
} from '@/lib/seo/index';

const BASE_URL = 'https://arcli.tech';
const SUPPORT_EMAIL = 'support@arcli.tech';

interface PageProps { 
  params: Promise<{ slug: string; }>; 
}

/**
 * Next.js Static Generation
 * Pre-renders all pages defined in our modular SEO registry.
 */
export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

/**
 * Dynamic Metadata & OG Generation
 * Ensures high-authority SERP presence with canonical integrity.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  
  if (!page) return { title: 'Blueprint Not Found | Arcli' };

  // Polymorphic metadata resolution
  const title = (page as any).title || (page as any).metadata?.title;
  const description = (page as any).description || (page as any).metadata?.description;
  const h1 = (page as any).h1 || (page as any).hero?.h1;

  const ogImageUrl = new URL(`${BASE_URL}/api/og`);
  ogImageUrl.searchParams.set('title', h1);
  ogImageUrl.searchParams.set('type', page.type);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${BASE_URL}/${slug}`,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }]
    },
    alternates: { canonical: `${BASE_URL}/${slug}` },
  };
}

// --- 1. Tactical Render Components ---

const BlueprintBreadcrumbs = ({ title, type }: { title: string; type: string }) => (
  <nav className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 mb-8 lg:px-8 text-sm text-zinc-500 font-medium">
    <ol className="inline-flex items-center space-x-2">
      <li><Link href="/" className="hover:text-blue-600 transition-colors">Arcli</Link></li>
      <li><ChevronRight className="w-4 h-4 text-zinc-300" /></li>
      <li className="capitalize">{type}s</li>
      <li><ChevronRight className="w-4 h-4 text-zinc-300" /></li>
      <li className="text-zinc-900 font-bold truncate max-w-[200px] sm:max-w-none">{title}</li>
    </ol>
  </nav>
);

const SectionHeading = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h2 id={id} className="text-3xl font-extrabold text-zinc-900 mb-8 border-b border-zinc-100 pb-4 scroll-mt-28">
    {children}
  </h2>
);

// --- 2. Main High-Performance UI Engine ---

export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPage(slug);
  
  if (!page) notFound();

  // Data Normalization (Polymorphic Mapping)
  const isTemplate = isTemplatePage(page);
  const h1 = isTemplate ? page.hero.h1 : (page as any).h1;
  const subtitle = isTemplate ? page.hero.subtitle : (page as any).subtitle;
  const icon = isTemplate ? page.hero.icon : (page as any).icon;
  const features = (page as any).features || (page as any).performanceMetrics || [];
  const faqs = (page as any).faqs || (page as any).governanceAndSecurity || [];
  const steps = (page as any).steps || (page as any).orchestrationWorkflow || [];
  const related = (page as any).relatedSlugs || (page as any).relatedBlueprints || [];

  return (
    <main className="min-h-screen bg-white selection:bg-blue-100">
      <BlueprintBreadcrumbs title={h1} type={page.type} />

      {/* Hero Section: Vectorized Branding */}
      <section className="relative pb-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center lg:px-8">
          <div className="flex justify-center mb-8 drop-shadow-sm">{icon}</div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-zinc-900">
            {h1}
          </h1>
          <p className="text-xl md:text-2xl text-zinc-600 leading-snug max-w-3xl mx-auto mb-12 font-medium">
            {subtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link 
              href="/register" 
              className="group inline-flex h-14 items-center justify-center rounded-xl bg-blue-600 px-10 text-lg font-bold text-white transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/20"
            >
              Start analyzing
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-32 grid lg:grid-cols-12 gap-16">
        
        {/* Left Column: Logic & Depth */}
        <div className="lg:col-span-8 space-y-24">

          {/* 1. Core Evaluation / Matrix (For Comparisons) */}
          {(page as any).evaluationMatrix && (
            <div>
              <SectionHeading>Performance Matrix</SectionHeading>
              <div className="grid gap-6">
                {(page as any).evaluationMatrix.map((item: any, i: number) => (
                  <div key={i} className="p-8 rounded-2xl border border-zinc-200 bg-zinc-50/50">
                    <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" />
                      {item.category}
                    </h3>
                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <div className="text-xs font-bold text-zinc-400 uppercase mb-2 tracking-widest">Legacy Approach</div>
                        <p className="text-zinc-600 text-sm leading-relaxed">{item.competitorApproach}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-blue-100">
                        <div className="text-xs font-bold text-blue-500 uppercase mb-2 tracking-widest">Arcli Advantage</div>
                        <p className="text-zinc-900 text-sm leading-relaxed font-medium">{item.arcliAdvantage}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Technical Specs / Stack */}
          {((page as any).technicalArchitecture || (page as any).technicalStack) && (
            <div className="bg-zinc-950 rounded-3xl p-10 text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Database className="w-32 h-32" />
              </div>
              <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                Orchestration Architecture
              </h3>
              <div className="grid sm:grid-cols-3 gap-10">
                {Object.entries((page as any).technicalArchitecture || (page as any).technicalStack).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div className="text-zinc-100 font-semibold">{value as string}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Operational Workflow */}
          {steps.length > 0 && (
            <div>
              <SectionHeading id="how-it-works">Execution Workflow</SectionHeading>
              <div className="grid gap-4">
                {steps.map((step: any, i: number) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-900 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                        {i + 1}
                      </div>
                      {i < steps.length - 1 && <div className="w-px h-full bg-zinc-100 my-2" />}
                    </div>
                    <div className="pb-10">
                      <h4 className="text-xl font-bold text-zinc-900 mb-2">{step.name || step.phase}</h4>
                      <p className="text-zinc-600 leading-relaxed max-w-2xl">{step.text || step.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Query Architecture (For Templates/Blueprints) */}
          {(page as any).queryArchitecture && (
            <div className="p-8 rounded-3xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <SectionHeading>Logic Pattern</SectionHeading>
              <div className="bg-zinc-950 rounded-2xl p-6 font-mono text-sm text-blue-400 overflow-x-auto mb-8 border border-zinc-800">
                <pre><code>{(page as any).queryArchitecture.vectorizedPattern}</code></pre>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h5 className="text-sm font-bold text-zinc-900 mb-2">Intent</h5>
                  <p className="text-zinc-600 text-sm">{(page as any).queryArchitecture.intent}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <h5 className="text-sm font-bold text-emerald-900 mb-1">Vectorized Insight</h5>
                  <p className="text-emerald-800 text-sm">{(page as any).queryArchitecture.insight}</p>
                </div>
              </div>
            </div>
          )}

          {/* 5. Enterprise Use Cases */}
          {((page as any).useCases || (page as any).enterpriseApplications) && (
            <div>
              <SectionHeading>Strategic Applications</SectionHeading>
              <div className="grid sm:grid-cols-2 gap-6">
                {((page as any).useCases || (page as any).enterpriseApplications).map((item: any, i: number) => (
                  <div key={i} className="p-6 rounded-2xl border border-zinc-100 bg-zinc-50/30 hover:bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
                    <h4 className="font-bold text-zinc-900 mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                      {item.title || item.vertical}
                    </h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">{item.description || item.application}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. FAQs & Governance */}
          {faqs.length > 0 && (
            <div>
              <SectionHeading id="faq">Governance & Support</SectionHeading>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq: any, i: number) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border-zinc-200">
                    <AccordionTrigger className="text-left py-6 text-lg font-bold text-zinc-900 hover:text-blue-600 transition-colors">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-zinc-600 text-base leading-relaxed pb-8">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

        </div>

        {/* Right Column: Sticky Stats & Discovery */}
        <aside className="lg:col-span-4">
          <div className="sticky top-28 space-y-8">
            
            {/* Capability Spec-Sheet */}
            <div className="p-8 rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/50">
              <h3 className="text-lg font-black text-zinc-900 mb-8 uppercase tracking-widest flex items-center gap-3">
                <Layers className="w-5 h-5 text-blue-600"/>
                Core Metrics
              </h3>
              <ul className="space-y-5 mb-10">
                {features.map((feature: string, i: number) => (
                  <li key={i} className="flex items-start text-sm text-zinc-600 leading-snug">
                    <Check className="w-4 h-4 text-blue-600 mr-4 shrink-0 mt-0.5" />
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link 
                href="/register" 
                className="flex w-full h-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white transition-all hover:bg-zinc-800 hover:scale-[1.01] active:scale-95"
              >
                Deploy Architecture
              </Link>
            </div>

            {/* AI Narrative Context: If logic involves AI */}
            {(page as any).nlpOrchestration && (
              <div className="p-6 rounded-3xl bg-blue-600 text-white">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  Context-Aware RAG
                </h4>
                <p className="text-sm text-blue-100 leading-relaxed mb-4">
                  {(page as any).nlpOrchestration.contextAwareRAG}
                </p>
                <div className="text-[10px] uppercase font-black tracking-widest opacity-60">Security Perimeter</div>
                <div className="text-xs font-bold text-white">{(page as any).nlpOrchestration.securityPerimeter}</div>
              </div>
            )}

            {/* Internal Silo Routing */}
            <div className="p-8 rounded-3xl border border-zinc-200 bg-zinc-50/50">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-6">Related Blueprints</h3>
              <div className="grid gap-3">
                {related.map((slug: string) => {
                  const relatedData = getPage(slug) as any;
                  if (!relatedData) return null;
                  const title = relatedData.h1 || relatedData.hero?.h1 || slug;
                  return (
                    <Link 
                      key={slug}
                      href={`/${slug}`}
                      className="group flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:border-blue-600 hover:shadow-md transition-all"
                    >
                      <span className="text-sm font-bold text-zinc-700 group-hover:text-blue-600 truncate mr-4">
                        {title}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
              <div className="mt-8 pt-6 border-t border-zinc-200">
                <p className="text-[10px] text-zinc-400 font-medium">
                  Need a custom integration? <br />
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a>
                </p>
              </div>
            </div>

          </div>
        </aside>

      </section>
    </main>
  );
}