// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import React from 'react';
import { 
  ArrowRight, 
  ChevronRight, 
  Check,
  Database,
  Layers,
  ShieldCheck,
  Zap,
  Terminal,
  XCircle,
  Users,
  Compass,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Global Layout Components
import { Navbar } from '@/components/landing/navbar';
import Footer from '@/components/landing/footer';

// Modular Registry & Type Imports
import { 
  seoPages, 
  getPage, 
  getAllSlugs, 
  isTemplatePage
} from '@/lib/seo/index';

const BASE_URL = 'https://www.arcli.tech';

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

const SectionHeading = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h2 id={id} className="text-3xl md:text-4xl font-extrabold text-[#0a1628] mb-8 tracking-tight scroll-mt-28">
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
  const icon = isTemplate ? p.hero.icon : (p.icon || <Layers className="w-6 h-6 text-blue-600" />);
  
  // Array Normalization & Fallbacks
  const cta = p.ctaHierarchy || { primary: { text: 'Start Free Trial', href: '/register' }};
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
    <>
      <Navbar />

      {/* Main Wrapper matching the White & Navy aesthetic */}
      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-hidden relative">
        
        {/* Soft Architectural Background Cues */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-40 z-0">
          <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-100 blur-[120px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-50 blur-[100px]" />
        </div>

        {/* 1. Hero Section */}
        <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 z-10 bg-[#fafafa]/50">
          <div className="max-w-5xl mx-auto px-6 text-center lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
            
            {/* Eyebrow badge matching hero.tsx */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm mb-8">
              {icon}
              <span className="capitalize text-[#0a1628] text-sm font-bold tracking-wide">{p.type || 'Platform Feature'}</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-8 text-[#0a1628] text-balance leading-tight">
              {h1}
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-500 max-w-3xl mx-auto mb-12 font-medium text-balance leading-relaxed">
              {subtitle}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href={cta.primary.href} 
                className="w-full sm:w-auto px-10 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 duration-300 text-lg"
              >
                {cta.primary.text}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              {cta.secondary && (
                <Link 
                  href={cta.secondary.href} 
                  className="w-full sm:w-auto px-10 py-4 bg-white text-[#0a1628] border border-slate-200 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center text-lg shadow-sm"
                >
                  {cta.secondary.text}
                </Link>
              )}
            </div>
            <p className="mt-6 text-sm text-slate-400 font-semibold">
              14-day free trial · No credit card · Setup in 5 minutes
            </p>
          </div>
        </section>

        {/* 2. Interactive Demo Pipeline */}
        {demo && (
          <section id="interactive-demo" className="max-w-5xl mx-auto px-6 lg:px-8 pb-32 z-10 relative">
            {/* The terminal window remains dark for strong visual contrast, but sits on a white background */}
            <div className="bg-slate-900 rounded-3xl p-2 md:p-4 shadow-2xl shadow-blue-900/10 overflow-hidden border border-slate-800">
              <div className="bg-slate-950 rounded-2xl overflow-hidden border border-slate-800/50">
                <div className="flex items-center px-6 py-4 border-b border-slate-800 bg-slate-900/80">
                  <div className="flex gap-2 mr-4">
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                  </div>
                  <div className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                    <Terminal className="w-4 h-4" /> Live AI Execution
                  </div>
                </div>
                <div className="p-6 md:p-12 flex flex-col gap-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 to-transparent">
                  {/* User Prompt */}
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                      <span className="text-blue-400 font-bold text-sm">YOU</span>
                    </div>
                    <div className="text-xl md:text-2xl text-slate-200 font-medium leading-relaxed">"{demo.userPrompt}"</div>
                  </div>
                  {/* AI Processing / SQL */}
                  <div className="pl-14 space-y-6">
                    <div className="p-5 bg-black/50 rounded-2xl border border-slate-800 font-mono text-sm text-sky-400 overflow-x-auto shadow-inner">
                      {demo.generatedSql}
                    </div>
                    {/* AI Insight & Metric */}
                    <div className="flex flex-col md:flex-row gap-6 p-6 bg-blue-900/20 border border-blue-800/30 rounded-2xl items-center md:items-start">
                      <div className="flex-1 text-slate-300 leading-relaxed font-medium text-lg">
                        {demo.aiInsight}
                      </div>
                      <div className="shrink-0 text-center px-8 py-5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-[0_0_30px_rgba(37,99,235,0.2)] border border-blue-500/50">
                        <div className="text-3xl font-black text-white">{demo.chartMetric}</div>
                        <div className="text-xs text-blue-200 uppercase tracking-widest mt-2 font-bold">Key Insight</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. Target Personas */}
        {personas.length > 0 && (
          <section className="bg-[#fafafa] border-y border-slate-100 py-24 relative z-10">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto mb-16">
                <SectionHeading>Built for Data-Driven Teams</SectionHeading>
                <p className="text-xl text-slate-500 font-medium">Empower every role in your organization to make decisions backed by verifiable data.</p>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {personas.map((persona: any, i: number) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-200 transition-all duration-300 group">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
                      <Users className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#0a1628] mb-3">{persona.role}</h3>
                    <p className="text-slate-500 text-lg font-medium leading-relaxed mb-8">{persona.description}</p>
                    <ul className="space-y-3 pt-6 border-t border-slate-100">
                      {persona.capabilities.map((cap: string, j: number) => (
                        <li key={j} className="flex items-start text-sm font-bold text-slate-700">
                          <CheckCircle2 className="w-5 h-5 text-blue-500 mr-3 shrink-0" /> 
                          <span className="mt-0.5">{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Main Content Grid */}
        <section className="max-w-7xl mx-auto px-6 lg:px-8 py-32 grid lg:grid-cols-12 gap-16 relative z-10">
          
          {/* Left Column: Logic & Depth */}
          <div className="lg:col-span-8 space-y-28">

            {/* Legacy vs Arcli Matrix */}
            {matrix.length > 0 && (
              <div>
                <SectionHeading>The Arcli Advantage</SectionHeading>
                <div className="grid gap-6">
                  {matrix.map((item: any, i: number) => {
                    const category = item.category || item.legacyTool;
                    const legacy = item.competitorApproach || item.limitation;
                    return (
                      <div key={i} className="p-8 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-[#0a1628] mb-6 flex items-center gap-3">
                          <Zap className="w-6 h-6 text-blue-500 fill-blue-500" />
                          {category}
                        </h3>
                        <div className="grid md:grid-cols-2 gap-8">
                          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="text-xs font-extrabold text-slate-400 uppercase mb-3 tracking-widest">The Old Way</div>
                            <p className="text-slate-600 leading-relaxed font-medium">{legacy}</p>
                          </div>
                          <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 rounded-full blur-2xl pointer-events-none"></div>
                            <div className="text-xs font-extrabold text-blue-600 uppercase mb-3 tracking-widest relative z-10">With Arcli</div>
                            <p className="text-[#0a1628] leading-relaxed font-bold relative z-10">{item.arcliAdvantage}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Workflow Upgrade */}
            {workflow && (
              <div>
                <SectionHeading>Workflow Transformation</SectionHeading>
                <div className="grid sm:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                      <XCircle className="w-4 h-4 text-slate-400" /> The Bottleneck
                    </div>
                    {workflow.legacyBottleneck.map((str: string, i: number) => (
                      <div key={i} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 font-medium leading-relaxed">
                        {str}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <div className="text-xs font-extrabold text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-6">
                      <Zap className="w-4 h-4 fill-blue-600" /> Arcli Automation
                    </div>
                    {workflow.arcliAutomation.map((str: string, i: number) => (
                      <div key={i} className="p-5 rounded-2xl bg-blue-50 border border-blue-100 text-[#0a1628] font-bold leading-relaxed">
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
                <div className="grid gap-6">
                  {steps.map((step: any, i: number) => {
                    const stepTitle = step.name || step.phase;
                    const stepText = step.text || step.action || step.description || (step.userAction ? `${step.userAction} ${step.outcome}` : null);
                    
                    return (
                      <div key={i} className="flex gap-8 group">
                        <div className="flex flex-col items-center pt-1">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-lg font-bold text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 group-hover:shadow-md transition-all duration-300">
                            {i + 1}
                          </div>
                          {i < steps.length - 1 && <div className="w-px h-full bg-slate-200 my-3 group-hover:bg-blue-200 transition-colors" />}
                        </div>
                        <div className="pb-12 pt-2">
                          <h4 className="text-2xl font-bold text-[#0a1628] mb-3">{stepTitle}</h4>
                          <p className="text-slate-500 text-lg font-medium leading-relaxed max-w-2xl">{stepText}</p>
                          {step.outcome && !step.userAction && (
                            <div className="mt-4 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 inline-flex items-center gap-2 px-4 py-2 rounded-xl">
                              <CheckCircle2 className="w-4 h-4" /> {step.outcome}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                      <div key={i} className="p-8 rounded-3xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all duration-300">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6 text-blue-600" />
                          </div>
                          {item.complexity && (
                            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg">
                              {item.complexity}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-xl text-[#0a1628] mb-3">{ucTitle}</h4>
                        <p className="text-slate-500 font-medium leading-relaxed">{ucDesc}</p>
                        {item.businessQuestion && (
                          <div className="mt-6 p-4 bg-slate-50 rounded-2xl text-sm font-bold text-slate-700 border border-slate-100 flex items-start gap-3">
                            <MessageSquare className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                            "{item.businessQuestion}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Processing Architecture */}
            {architecture && (
              <div className="bg-[#0a1628] rounded-3xl p-12 text-white overflow-hidden relative group shadow-2xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors duration-700"></div>
                <div className="absolute bottom-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-700">
                  <Database className="w-64 h-64" />
                </div>
                
                <h3 className="text-2xl font-extrabold mb-10 flex items-center gap-4 relative z-10 text-white">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
                  Orchestration Architecture
                </h3>
                
                <div className="grid sm:grid-cols-3 gap-12 relative z-10">
                  {Object.entries(architecture).map(([key, value]) => (
                    <div key={key}>
                      <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-4">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </div>
                      <div className="text-white font-bold text-lg leading-relaxed">{value as string}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs */}
            {faqs.length > 0 && (
              <div>
                <SectionHeading id="faq">Governance & Support</SectionHeading>
                <div className="space-y-4">
                  {faqs.map((faq: any, i: number) => (
                    <details key={i} className="group bg-white border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden hover:border-slate-300 transition-colors shadow-sm">
                      <summary className="flex items-center justify-between cursor-pointer p-6 font-bold text-[#0a1628] text-lg hover:bg-slate-50 transition-colors focus:outline-none">
                        {faq.q}
                        <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-50 p-2 rounded-full text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600">
                          <ChevronRight className="w-5 h-5 rotate-90" />
                        </span>
                      </summary>
                      <div className="p-6 pt-0 text-slate-500 text-lg leading-relaxed font-medium bg-white border-t border-slate-100">
                        {faq.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Sticky Stats & Discovery */}
          <aside className="lg:col-span-4">
            <div className="sticky top-28 space-y-8">
              
              {/* Core Capabilities */}
              {rawFeatures.length > 0 && (
                <div className="p-8 rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                  <h3 className="text-lg font-black text-[#0a1628] mb-8 uppercase tracking-widest flex items-center gap-3">
                    <Layers className="w-5 h-5 text-blue-600"/>
                    Core Capabilities
                  </h3>
                  <ul className="space-y-6 mb-10">
                    {rawFeatures.map((feature: any, i: number) => {
                      const isObject = typeof feature === 'object' && feature !== null;
                      const fTitle = isObject ? (feature.title || feature.name) : feature;
                      const fDesc = isObject ? (feature.description || feature.executiveExplanation) : null;

                      return (
                        <li key={i} className="flex items-start text-sm leading-snug">
                          <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center mr-4 shrink-0">
                            <Check className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <span className="font-bold text-[#0a1628] text-base capitalize">{fTitle}</span>
                            {fDesc && <p className="text-slate-500 mt-2 font-medium leading-relaxed">{fDesc}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Link 
                    href={cta.primary.href} 
                    className="flex w-full h-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 hover:-translate-y-0.5 duration-300"
                  >
                    {cta.primary.text}
                  </Link>
                </div>
              )}

              {/* Rich Interactive Cards for Related Links */}
              {related.length > 0 && (
                <div className="p-8 rounded-3xl border border-slate-200 bg-[#fafafa] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
                  
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                    <Compass className="w-4 h-4 text-slate-400" />
                    Explore More
                  </h3>
                  
                  <div className="grid gap-4">
                    {related.map((relatedSlug: string) => {
                      const relatedData = getPage(relatedSlug) as any;
                      if (!relatedData) return null;
                      
                      const relatedTitle = relatedData.h1 || relatedData.heroTitle || relatedData.title || relatedSlug;
                      const relatedDescription = relatedData.description || relatedData.subtitle;
                      
                      return (
                        <Link 
                          key={relatedSlug}
                          href={`/${relatedSlug}`}
                          className="group relative flex flex-col p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                          
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-sm font-bold text-[#0a1628] group-hover:text-blue-700 transition-colors line-clamp-2 pr-4 leading-snug">
                              {relatedTitle}
                            </span>
                            <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors shrink-0">
                              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-600 transition-colors" />
                            </div>
                          </div>
                          
                          {relatedDescription && (
                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed font-medium group-hover:text-slate-600 transition-colors">
                              {relatedDescription}
                            </p>
                          )}
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

      {/* GLOBAL FOOTER */}
      <Footer />
    </>
  );
}