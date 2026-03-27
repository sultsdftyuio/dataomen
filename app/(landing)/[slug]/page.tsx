// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import React from 'react';
import { 
  ArrowRight, 
  ChevronRight, 
  Check,
  Cpu,
  Database,
  Layers,
  ShieldCheck,
  Zap,
  Terminal,
  XCircle,
  Users
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
  isTemplatePage
} from '@/lib/seo/index';

const BASE_URL = 'https://www.arcli.tech';
const SUPPORT_EMAIL = 'support@arcli.tech';

interface PageProps { 
  params: Promise<{ slug: string; }>; 
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  
  if (!page) return { title: 'Not Found | Arcli' };

  const title = (page as any).title || (page as any).metadata?.title || 'Arcli Platform';
  const description = (page as any).description || (page as any).metadata?.description || '';
  const h1 = (page as any).h1 || (page as any).heroTitle || (page as any).hero?.h1 || title;
  const pageType = (page as any).type || 'Platform';

  const ogImageUrl = new URL(`${BASE_URL}/api/og`);
  ogImageUrl.searchParams.set('title', h1);
  ogImageUrl.searchParams.set('type', pageType);

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

const BlueprintBreadcrumbs = ({ title, type }: { title: string; type: string }) => (
  <nav className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 mb-8 lg:px-8 text-sm text-zinc-500 font-medium">
    <ol className="inline-flex items-center space-x-2">
      <li><Link href="/" className="hover:text-blue-600 transition-colors">Arcli</Link></li>
      <li><ChevronRight className="w-4 h-4 text-zinc-300" /></li>
      <li className="capitalize">{type.replace('-', ' ')}</li>
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

export default async function DynamicSEOPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPage(slug);
  
  if (!page) notFound();

  // --- OMNI DATA NORMALIZATION LAYER ---
  const p = page as any;
  const isTemplate = isTemplatePage(page);
  
  const h1 = isTemplate ? p.hero.h1 : (p.h1 || p.heroTitle || p.title);
  const subtitle = isTemplate ? p.hero.subtitle : (p.subtitle || p.heroDescription || p.description);
  const icon = isTemplate ? p.hero.icon : (p.icon || <Layers className="w-6 h-6 text-blue-500" />);
  const pageType = p.type || p.heroSubtitle || 'Feature';
  
  // Array Normalization & Fallbacks
  const cta = p.ctaHierarchy || { primary: { text: 'Start analyzing', href: '/register' }};
  const demo = p.demoPipeline;
  const personas = p.targetPersonas || [];
  const matrix = p.evaluationMatrix || p.competitiveAdvantage || [];
  const workflow = p.workflowUpgrade;
  const steps = p.steps || p.orchestrationWorkflow || p.onboardingExperience || p.pipelinePhases || [];
  const useCases = p.useCases || p.enterpriseApplications || p.analyticalScenarios || [];
  const faqs = p.faqs || [];
  const related = p.relatedSlugs || p.relatedBlueprints || [];

  // Normalize Capabilities from string arrays, objects, or key-value structures
  let rawFeatures = p.features || p.performanceMetrics || p.capabilities || [];
  if (p.transformationCapabilities) {
    rawFeatures = [
      ...rawFeatures,
      ...Object.entries(p.transformationCapabilities).map(([k, v]) => ({
        title: k.replace(/([A-Z])/g, ' $1').trim(), // CamelCase to spaces
        description: v
      }))
    ];
  }

  // Normalize Architecture
  const architecture = p.processingArchitecture || p.technicalArchitecture || p.technicalStack;

  return (
    <main className="min-h-screen bg-white selection:bg-blue-100">
      <BlueprintBreadcrumbs title={h1} type={pageType} />

      {/* 1. Hero Section */}
      <section className="relative pb-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center lg:px-8">
          <div className="flex justify-center mb-8 drop-shadow-sm">{icon}</div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-zinc-900 text-balance">
            {h1}
          </h1>
          <p className="text-xl md:text-2xl text-zinc-600 leading-snug max-w-3xl mx-auto mb-12 font-medium text-balance">
            {subtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link 
              href={cta.primary.href} 
              className="group inline-flex h-14 items-center justify-center rounded-xl bg-blue-600 px-10 text-lg font-bold text-white transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/20"
            >
              {cta.primary.text}
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            {cta.secondary && (
              <Link 
                href={cta.secondary.href} 
                className="group inline-flex h-14 items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200 px-10 text-lg font-bold text-zinc-900 transition-all hover:bg-zinc-100"
              >
                {cta.secondary.text}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 2. Interactive Demo Pipeline (New Enterprise Feature) */}
      {demo && (
        <section id="interactive-demo" className="max-w-5xl mx-auto px-6 lg:px-8 pb-24">
          <div className="bg-zinc-950 rounded-3xl p-2 md:p-4 shadow-2xl overflow-hidden border border-zinc-800">
            <div className="bg-zinc-900 rounded-2xl overflow-hidden">
              <div className="flex items-center px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex gap-2 mr-4">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> AI Execution Pipeline
                </div>
              </div>
              <div className="p-6 md:p-10 space-y-8">
                {/* User Prompt */}
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                    <span className="text-blue-400 font-bold text-xs">YOU</span>
                  </div>
                  <div className="text-lg md:text-xl text-zinc-200 font-medium">"{demo.userPrompt}"</div>
                </div>
                {/* AI Processing / SQL */}
                <div className="pl-12 space-y-4">
                  <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 font-mono text-sm text-emerald-400 overflow-x-auto">
                    {demo.generatedSql}
                  </div>
                  {/* AI Insight & Metric */}
                  <div className="flex flex-col md:flex-row gap-6 p-6 bg-blue-900/10 border border-blue-900/30 rounded-xl items-center md:items-start">
                    <div className="flex-1 text-zinc-300 leading-relaxed">
                      {demo.aiInsight}
                    </div>
                    <div className="shrink-0 text-center px-6 py-4 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
                      <div className="text-2xl font-black text-white">{demo.chartMetric}</div>
                      <div className="text-[10px] text-blue-200 uppercase tracking-widest mt-1 font-bold">Key Insight</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Target Personas (New Enterprise Feature) */}
      {personas.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-32">
          <SectionHeading>Built for Data-Driven Teams</SectionHeading>
          <div className="grid md:grid-cols-3 gap-6">
            {personas.map((persona: any, i: number) => (
              <div key={i} className="p-8 rounded-3xl border border-zinc-200 bg-zinc-50 hover:bg-white hover:shadow-xl transition-all">
                <Users className="w-8 h-8 text-blue-600 mb-6" />
                <h3 className="text-xl font-bold text-zinc-900 mb-3">{persona.role}</h3>
                <p className="text-zinc-600 text-sm leading-relaxed mb-6">{persona.description}</p>
                <ul className="space-y-2">
                  {persona.capabilities.map((cap: string, j: number) => (
                    <li key={j} className="flex items-center text-xs font-bold text-zinc-900">
                      <Check className="w-4 h-4 text-emerald-500 mr-2" /> {cap}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Content Grid */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-32 grid lg:grid-cols-12 gap-16">
        
        {/* Left Column: Logic & Depth */}
        <div className="lg:col-span-8 space-y-24">

          {/* Legacy vs Arcli Matrix */}
          {matrix.length > 0 && (
            <div>
              <SectionHeading>Performance Matrix</SectionHeading>
              <div className="grid gap-6">
                {matrix.map((item: any, i: number) => {
                  const category = item.category || item.legacyTool;
                  const legacy = item.competitorApproach || item.limitation;
                  return (
                    <div key={i} className="p-8 rounded-2xl border border-zinc-200 bg-zinc-50/50">
                      <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        {category}
                      </h3>
                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <div className="text-xs font-bold text-zinc-400 uppercase mb-2 tracking-widest">Legacy Approach</div>
                          <p className="text-zinc-600 text-sm leading-relaxed">{legacy}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-blue-100">
                          <div className="text-xs font-bold text-blue-500 uppercase mb-2 tracking-widest">Arcli Advantage</div>
                          <p className="text-zinc-900 text-sm leading-relaxed font-medium">{item.arcliAdvantage}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workflow Upgrade (New Enterprise Feature) */}
          {workflow && (
            <div>
              <SectionHeading>Workflow Transformation</SectionHeading>
              <div className="grid sm:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="text-sm font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> The Bottleneck
                  </div>
                  {workflow.legacyBottleneck.map((str: string, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-900 text-sm leading-relaxed">
                      {str}
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="text-sm font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                    <Check className="w-4 h-4" /> The Arcli Automation
                  </div>
                  {workflow.arcliAutomation.map((str: string, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900 text-sm leading-relaxed">
                      {str}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Operational Workflow / Pipeline Phases */}
          {steps.length > 0 && (
            <div>
              <SectionHeading id="how-it-works">Execution Workflow</SectionHeading>
              <div className="grid gap-4">
                {steps.map((step: any, i: number) => {
                  const stepTitle = step.name || step.phase;
                  const stepText = step.text || step.action || step.description || (step.userAction ? `${step.userAction} ${step.outcome}` : null);
                  
                  return (
                    <div key={i} className="flex gap-6 group">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-900 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                          {i + 1}
                        </div>
                        {i < steps.length - 1 && <div className="w-px h-full bg-zinc-100 my-2" />}
                      </div>
                      <div className="pb-10">
                        <h4 className="text-xl font-bold text-zinc-900 mb-2">{stepTitle}</h4>
                        <p className="text-zinc-600 leading-relaxed max-w-2xl">{stepText}</p>
                        {step.outcome && !step.userAction && (
                          <div className="mt-3 text-sm font-medium text-emerald-600 bg-emerald-50 inline-block px-3 py-1 rounded-md">
                            Outcome: {step.outcome}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Processing Architecture */}
          {architecture && (
            <div className="bg-zinc-950 rounded-3xl p-10 text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Database className="w-32 h-32" />
              </div>
              <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                Orchestration Architecture
              </h3>
              <div className="grid sm:grid-cols-3 gap-10">
                {Object.entries(architecture).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div className="text-zinc-100 font-semibold text-sm leading-relaxed">{value as string}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Use Cases / Analytical Scenarios */}
          {useCases.length > 0 && (
            <div>
              <SectionHeading>Strategic Applications</SectionHeading>
              <div className="grid sm:grid-cols-2 gap-6">
                {useCases.map((item: any, i: number) => {
                  const ucTitle = item.title || item.vertical;
                  const ucDesc = item.description || item.application || item.businessOutcome;
                  return (
                    <div key={i} className="p-6 rounded-2xl border border-zinc-100 bg-zinc-50/30 hover:bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-zinc-900 flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-blue-600" />
                          {ucTitle}
                        </h4>
                        {item.complexity && (
                          <span className="text-[10px] uppercase font-bold tracking-wider bg-zinc-200 text-zinc-600 px-2 py-1 rounded">
                            {item.complexity}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-600 leading-relaxed">{ucDesc}</p>
                      {item.businessQuestion && (
                        <div className="mt-4 p-3 bg-zinc-100 rounded-lg text-xs font-mono text-zinc-700 italic border border-zinc-200">
                          "{item.businessQuestion}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Engineered Trust */}
          {p.trustAndSecurity && (
            <div>
              <SectionHeading>Engineered Trust</SectionHeading>
              <div className="grid gap-4">
                {p.trustAndSecurity.map((trust: any, i: number) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-4 p-6 bg-zinc-950 text-white rounded-2xl">
                    <Database className="w-8 h-8 text-blue-500 shrink-0" />
                    <div>
                      <h4 className="font-bold text-lg mb-2">{trust.principle}</h4>
                      <p className="text-zinc-400 text-sm leading-relaxed">{trust.howWeDeliver}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FAQs */}
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
            
            {/* Core Capabilities */}
            {rawFeatures.length > 0 && (
              <div className="p-8 rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/50">
                <h3 className="text-lg font-black text-zinc-900 mb-8 uppercase tracking-widest flex items-center gap-3">
                  <Layers className="w-5 h-5 text-blue-600"/>
                  Core Capabilities
                </h3>
                <ul className="space-y-5 mb-10">
                  {rawFeatures.map((feature: any, i: number) => {
                    const isObject = typeof feature === 'object' && feature !== null;
                    const fTitle = isObject ? (feature.title || feature.name) : feature;
                    const fDesc = isObject ? (feature.description || feature.executiveExplanation) : null;

                    return (
                      <li key={i} className="flex items-start text-sm text-zinc-600 leading-snug">
                        <Check className="w-4 h-4 text-blue-600 mr-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-zinc-900 capitalize">{fTitle}</span>
                          {fDesc && <p className="text-zinc-500 mt-1">{fDesc}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Link 
                  href={cta.primary.href} 
                  className="flex w-full h-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white transition-all hover:bg-zinc-800 hover:scale-[1.01] active:scale-95"
                >
                  {cta.primary.text}
                </Link>
              </div>
            )}

            {/* Internal Silo Routing */}
            {related.length > 0 && (
              <div className="p-8 rounded-3xl border border-zinc-200 bg-zinc-50/50">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-6">Related Modules</h3>
                <div className="grid gap-3">
                  {related.map((relatedSlug: string) => {
                    const relatedData = getPage(relatedSlug) as any;
                    if (!relatedData) return null;
                    const relatedTitle = relatedData.h1 || relatedData.heroTitle || relatedData.title || relatedSlug;
                    return (
                      <Link 
                        key={relatedSlug}
                        href={`/${relatedSlug}`}
                        className="group flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:border-blue-600 hover:shadow-md transition-all"
                      >
                        <span className="text-sm font-bold text-zinc-700 group-hover:text-blue-600 truncate mr-4">
                          {relatedTitle}
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </aside>

      </section>
    </main>
  );
}