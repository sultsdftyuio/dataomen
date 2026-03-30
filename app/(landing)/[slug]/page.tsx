// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import React, { cache } from 'react';
import { 
  ArrowRight, 
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
  MessageSquare,
  Activity,
  Cpu,
  Globe,
  Lock,
  Workflow,
  BarChart3
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
  getPage, 
  getAllSlugs, 
} from '@/lib/seo/index';

const BASE_URL = 'https://www.arcli.tech';

export const dynamicParams = false;
export const revalidate = 86400;

interface PageProps { 
  params: Promise<{ slug: string }>; 
}

type CTA = { text: string; href: string };
type CoreCapability = { title: string; description: string };

export type IconKey = 
  | 'database' | 'layers' | 'shieldCheck' | 'zap' | 'terminal'
  | 'users' | 'activity' | 'cpu' | 'globe' | 'lock'
  | 'workflow' | 'barChart3';

export const iconRegistry: Record<IconKey, React.ReactNode> = {
  database:   <Database   className="w-6 h-6 text-blue-600" />,
  layers:     <Layers     className="w-6 h-6 text-blue-600" />,
  shieldCheck:<ShieldCheck className="w-6 h-6 text-blue-600" />,
  zap:        <Zap        className="w-6 h-6 text-blue-600" />,
  terminal:   <Terminal   className="w-6 h-6 text-blue-600" />,
  users:      <Users      className="w-6 h-6 text-blue-600" />,
  activity:   <Activity   className="w-6 h-6 text-blue-600" />,
  cpu:        <Cpu        className="w-6 h-6 text-blue-600" />,
  globe:      <Globe      className="w-6 h-6 text-blue-600" />,
  lock:       <Lock       className="w-6 h-6 text-blue-600" />,
  workflow:   <Workflow   className="w-6 h-6 text-blue-600" />,
  barChart3:  <BarChart3  className="w-6 h-6 text-blue-600" />,
};

const DEFAULT_ICON_KEY: IconKey = 'layers';

function resolveIcon(raw: string | React.ReactNode | undefined): React.ReactNode {
  if (typeof raw === 'string' && raw in iconRegistry) {
    return iconRegistry[raw as IconKey];
  }
  if (raw && typeof raw !== 'string') return raw;
  return iconRegistry[DEFAULT_ICON_KEY];
}

type RawFeature = string | { title?: string; name?: string; description?: string; executiveExplanation?: string };
type RawStep = { name?: string; phase?: string; text?: string; action?: string; description?: string; userAction?: string; outcome?: string };
type RawUseCase = { title?: string; vertical?: string; description?: string; application?: string; businessOutcome?: string; businessQuestion?: string; complexity?: string };
type RawMatrix = { category?: string; legacyTool?: string; competitorApproach?: string; limitation?: string; arcliAdvantage: string };
type RawPersona = { role: string; description: string; capabilities: string[] };

type RawBasePage = {
  title?: string;
  description?: string;
  metadata?: { title?: string; description?: string };
  ctaHierarchy?: { primary: CTA; secondary?: CTA };
  icon?: string | React.ReactNode; 
  demoPipeline?: { userPrompt: string; generatedSql: string; aiInsight: string; chartMetric: string };
  targetPersonas?: RawPersona[];
  evaluationMatrix?: RawMatrix[];
  competitiveAdvantage?: RawMatrix[];
  workflowUpgrade?: { legacyBottleneck: string[]; arcliAutomation: string[] };
  steps?: RawStep[];
  orchestrationWorkflow?: RawStep[];
  onboardingExperience?: RawStep[];
  pipelinePhases?: RawStep[];
  useCases?: RawUseCase[];
  enterpriseApplications?: RawUseCase[];
  analyticalScenarios?: RawUseCase[];
  processingArchitecture?: Record<string, string>;
  technicalArchitecture?: Record<string, string>;
  technicalStack?: Record<string, string>;
  faqs?: Array<{ q: string; a: string }>;
  relatedSlugs?: string[];
  relatedBlueprints?: string[];
  features?: RawFeature[];
  performanceMetrics?: RawFeature[];
  capabilities?: RawFeature[];
  transformationCapabilities?: Record<string, string>;
  datePublished?: string;
  dateModified?: string;
};

export type RawTemplatePage = RawBasePage & {
  type: 'template';
  hero: { h1: string; subtitle: string; icon?: string | React.ReactNode };
};

export type RawStandardPage = RawBasePage & {
  type?: string;
  h1?: string;
  heroTitle?: string;
  subtitle?: string;
  heroDescription?: string;
};

export type RawPage = RawTemplatePage | RawStandardPage;

export interface NormalizedPage {
  slug: string;
  type: string;
  seo: { title: string; description: string; h1: string; datePublished: string; dateModified: string };
  hero: { subtitle: string; icon: React.ReactNode; cta: { primary: CTA; secondary?: CTA } };
  demo?: RawBasePage['demoPipeline'];
  personas: RawPersona[];
  matrix: Array<{ category: string; legacy: string; arcliAdvantage: string }>;
  workflow?: RawBasePage['workflowUpgrade'];
  steps: Array<{ title: string; description: string; outcome?: string }>;
  useCases: Array<{ title: string; description: string; businessQuestion?: string; complexity?: string }>;
  architecture?: Record<string, string>;
  faqs: Array<{ q: string; a: string }>;
  relatedSlugs: string[];
  features: CoreCapability[];
}

const normalizeSEO = (p: RawPage): NormalizedPage['seo'] => {
  const tp = p as RawTemplatePage;
  const sp = p as RawStandardPage;

  const published = p.datePublished || '2024-01-01T08:00:00Z';
  const modified  = p.dateModified  || published;

  return {
    title: p.title || p.metadata?.title || 'Arcli Platform',
    description: p.description || p.metadata?.description || '',
    h1: p.type === 'template' ? tp.hero.h1 : (sp.h1 || sp.heroTitle || p.title || 'Arcli'),
    datePublished: published,
    dateModified:  modified,
  };
};

const normalizeHero = (p: RawPage): NormalizedPage['hero'] => {
  const tp = p as RawTemplatePage;
  const sp = p as RawStandardPage;

  const rawIcon = p.type === 'template' ? (tp.hero?.icon ?? p.icon) : p.icon;

  return {
    subtitle: p.type === 'template' ? tp.hero.subtitle : (sp.subtitle || sp.heroDescription || p.description || ''),
    icon: resolveIcon(rawIcon),
    cta: p.ctaHierarchy || { primary: { text: 'Start Free Trial', href: '/register' } },
  };
};

const normalizeFeatures = (p: RawPage): CoreCapability[] => {
  const raw = p.features || p.performanceMetrics || p.capabilities;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  const mapped = safe.map((f: any) => {
    if (typeof f === 'string') return { title: f, description: '' };
    return {
      title: f?.title || f?.name || '',
      description: f?.description || f?.executiveExplanation || ''
    };
  });
  if (p.transformationCapabilities && typeof p.transformationCapabilities === 'object') {
    mapped.push(...Object.entries(p.transformationCapabilities).map(([k, v]) => ({
      title: k.replace(/([A-Z])/g, ' $1').trim(),
      description: String(v)
    })));
  }
  return mapped;
};

const normalizeSteps = (p: RawPage): NormalizedPage['steps'] => {
  const raw = p.steps || p.orchestrationWorkflow || p.onboardingExperience || p.pipelinePhases;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  return safe.map((s: any) => ({
    title: s?.name || s?.phase || 'Phase',
    description: typeof s === 'string' ? s : (s?.text || s?.action || s?.description || (s?.userAction ? `${s.userAction} ${s.outcome || ''}` : '')),
    outcome: s?.userAction ? undefined : s?.outcome
  }));
};

const normalizeUseCases = (p: RawPage): NormalizedPage['useCases'] => {
  const raw = p.useCases || p.enterpriseApplications || p.analyticalScenarios;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  return safe.map((u: any) => ({
    title: u?.title || u?.vertical || 'Application',
    description: typeof u === 'string' ? u : (u?.description || u?.application || u?.businessOutcome || ''),
    businessQuestion: u?.businessQuestion,
    complexity: u?.complexity
  }));
};

const normalizeMatrix = (p: RawPage): NormalizedPage['matrix'] => {
  const raw = p.evaluationMatrix || p.competitiveAdvantage;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  return safe.map((m: any) => ({
    category: m?.category || m?.legacyTool || 'Advantage',
    legacy: m?.competitorApproach || m?.limitation || 'Manual processes',
    arcliAdvantage: m?.arcliAdvantage || (typeof m === 'string' ? m : '')
  }));
};

const getPageCached = cache((slug: string) => getPage(slug));

export const getNormalizedPage = cache((slug: string): NormalizedPage | null => {
  try {
    const rawPage = getPageCached(slug) as unknown as RawPage;
    if (!rawPage || typeof rawPage !== 'object') return null;
    return {
      slug,
      type: rawPage.type === 'template' ? 'template' : (rawPage.type || 'standard'),
      seo: normalizeSEO(rawPage),
      hero: normalizeHero(rawPage),
      demo: rawPage.demoPipeline,
      personas: Array.isArray(rawPage.targetPersonas) ? rawPage.targetPersonas : [],
      matrix: normalizeMatrix(rawPage),
      workflow: rawPage.workflowUpgrade,
      steps: normalizeSteps(rawPage),
      useCases: normalizeUseCases(rawPage),
      architecture: rawPage.processingArchitecture || rawPage.technicalArchitecture || rawPage.technicalStack,
      faqs: Array.isArray(rawPage.faqs) ? rawPage.faqs : [],
      relatedSlugs: Array.isArray(rawPage.relatedSlugs) ? rawPage.relatedSlugs : (Array.isArray(rawPage.relatedBlueprints) ? rawPage.relatedBlueprints : []),
      features: normalizeFeatures(rawPage)
    };
  } catch (err) {
    console.error(`[getNormalizedPage] Failed to normalize slug "${slug}":`, err);
    return null;
  }
});

const SectionHeading = ({ children, id, subtitle }: { children: React.ReactNode; id?: string; subtitle?: string }) => (
  <div className="mb-10 md:mb-12 scroll-mt-28" id={id}>
    <h2 className="text-3xl md:text-5xl font-extrabold text-[#0a1628] tracking-tight mb-4">
      {children}
    </h2>
    {subtitle && <p className="text-lg md:text-xl text-slate-500 max-w-3xl font-medium">{subtitle}</p>}
  </div>
);

const Hero = ({ data }: { data: NormalizedPage }) => (
  <section className="relative pt-24 pb-20 md:pt-48 md:pb-40 z-10 bg-[#fafafa]/50">
    <div className="max-w-7xl mx-auto px-6 text-center lg:px-8">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="text-blue-600">{data.hero.icon}</div>
        <span className="capitalize text-[#0a1628] text-sm font-bold tracking-widest">{data.type}</span>
      </div>
      
      <h1 className="text-5xl md:text-8xl font-extrabold tracking-tighter mb-6 md:mb-8 text-[#0a1628] text-balance leading-[0.95] md:leading-[0.9] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
        {data.seo.h1}
      </h1>
      
      <p className="text-lg md:text-3xl text-slate-500 max-w-4xl mx-auto mb-10 md:mb-14 font-medium text-balance leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
        {data.hero.subtitle}
      </p>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        <Link 
          href={data.hero.cta.primary.href} 
          className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-[0_20px_40px_-15px_rgba(37,99,235,0.4)] hover:-translate-y-1 duration-300 text-lg md:text-xl"
        >
          {data.hero.cta.primary.text}
          <ArrowRight className="h-5 w-5 md:h-6 md:w-6" />
        </Link>
        {data.hero.cta.secondary && (
          <Link 
            href={data.hero.cta.secondary.href} 
            className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-white text-[#0a1628] border-2 border-slate-200 rounded-2xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center text-lg md:text-xl shadow-sm"
          >
            {data.hero.cta.secondary.text}
          </Link>
        )}
      </div>
      
      <div className="mt-10 md:mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-8 text-slate-400 font-semibold text-sm">
        <div className="flex items-center gap-2"><Check className="text-blue-500 w-4 h-4" /> 14-day free trial</div>
        <div className="flex items-center gap-2"><Check className="text-blue-500 w-4 h-4" /> No credit card</div>
        <div className="flex items-center gap-2"><Check className="text-blue-500 w-4 h-4" /> GDPR Compliant</div>
      </div>
    </div>
  </section>
);

const Demo = ({ demo }: { demo: NormalizedPage['demo'] }) => {
  if (!demo) return null;
  return (
    <section id="interactive-demo" className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 pb-20 md:pb-32 z-10 relative">
      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-4 md:p-8 shadow-2xl shadow-slate-200/50 border border-slate-200">
        <div className="bg-[#fafafa] rounded-[1.5rem] md:rounded-[2rem] overflow-hidden border border-slate-200">
          <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b border-slate-200 bg-white">
            <div className="flex gap-2.5">
              <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-slate-200 border border-slate-300"></div>
              <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-slate-200 border border-slate-300"></div>
              <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-slate-200 border border-slate-300"></div>
            </div>
            <div className="text-[10px] md:text-xs font-black tracking-[0.2em] md:tracking-[0.3em] text-[#0a1628] uppercase flex items-center gap-2 md:gap-3">
              <Terminal className="w-3 h-3 md:w-4 md:h-4 text-blue-600" /> Live Engine Execution
            </div>
            <div className="w-12 md:w-20"></div>
          </div>
          
          <div className="p-6 md:p-16 flex flex-col gap-10 md:gap-14 bg-[#fafafa]">
            {/* User Prompt */}
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                <Users className="text-blue-600 w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="space-y-2">
                <div className="text-[10px] md:text-xs font-bold text-blue-600 uppercase tracking-widest">Query Input</div>
                <div className="text-xl md:text-3xl text-[#0a1628] font-bold leading-tight tracking-tight">
                  "{demo.userPrompt}"
                </div>
              </div>
            </div>

            {/* Pipeline Steps */}
            <div className="pl-2 md:pl-4 space-y-8 md:space-y-10 border-l-2 border-slate-200 ml-3 md:ml-6">
              
              {/* SQL Generation */}
              <div className="pl-6 md:pl-10 relative">
                <div className="absolute left-[-11px] md:left-[-13px] top-0 w-5 h-5 md:w-6 md:h-6 rounded-full bg-white border-4 border-[#0a1628]"></div>
                <div className="p-4 md:p-6 bg-[#0a1628] rounded-2xl border border-slate-800 font-mono text-xs md:text-base text-blue-100 overflow-x-auto shadow-xl">
                  <div className="flex gap-4 mb-3 border-b border-slate-700/80 pb-3">
                    <div className="text-slate-500">01</div>
                    <div><span className="text-blue-400">SELECT</span> * <span className="text-blue-400">FROM</span> analytical_engine</div>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {demo.generatedSql}
                  </div>
                </div>
              </div>

              {/* Insight */}
              <div className="pl-6 md:pl-10 relative">
                <div className="absolute left-[-11px] md:left-[-13px] top-0 w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-600 border-4 border-white shadow-[0_0_10px_rgba(37,99,235,0.4)]"></div>
                <div className="flex flex-col lg:flex-row gap-6 p-6 md:p-8 bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] shadow-xl shadow-slate-100/50">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-blue-600 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                      <Activity className="w-4 h-4" /> Insight Extraction
                    </div>
                    <div className="text-[#0a1628] text-base md:text-lg leading-relaxed font-semibold">
                      {demo.aiInsight}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center px-6 py-6 md:px-8 md:py-8 bg-blue-50/50 rounded-2xl border border-blue-100">
                    <div className="text-2xl md:text-3xl font-black text-blue-600 tabular-nums tracking-tight text-center">{demo.chartMetric}</div>
                    <div className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em] mt-2 text-center">Statistical Confidence</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Personas = ({ personas }: { personas: RawPersona[] }) => {
  if (personas.length === 0) return null;
  return (
    <section className="bg-[#fafafa] border-y border-slate-100 py-20 md:py-32 z-10 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-blue-50/50 to-transparent"></div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        <SectionHeading subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise.">
          Engineered for Roles
        </SectionHeading>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {personas.map((persona, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[2.5rem] p-8 md:p-10 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] hover:border-blue-300 transition-all duration-500 group flex flex-col h-full">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 md:mb-8 group-hover:bg-blue-600 group-hover:rotate-6 transition-all duration-500 group-hover:shadow-xl group-hover:shadow-blue-200">
                <Users className="w-7 h-7 md:w-8 md:h-8 text-[#0a1628] group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl md:text-2xl font-black text-[#0a1628] mb-3 md:mb-4 tracking-tight">{persona.role}</h3>
              <p className="text-slate-500 text-base md:text-lg font-medium leading-relaxed mb-8 md:mb-10 flex-grow">
                {persona.description}
              </p>
              <div className="space-y-4 pt-6 md:pt-8 border-t border-slate-100">
                {persona.capabilities.map((cap, j) => (
                  <div key={j} className="flex items-start gap-3 md:gap-4 text-sm font-bold text-slate-700">
                    <div className="mt-0.5 md:mt-1 w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <span>{cap}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Matrix = ({ matrix }: { matrix: NormalizedPage['matrix'] }) => {
  if (matrix.length === 0) return null;
  return (
    <div className="space-y-10 md:space-y-12">
      <SectionHeading subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine.">
        The Competitive Edge
      </SectionHeading>
      <div className="grid gap-6 md:gap-8">
        {matrix.map((item, i) => (
          <div key={i} className="group relative bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 p-1 hover:border-blue-400/50 transition-all duration-500 shadow-sm overflow-hidden">
            <div className="grid lg:grid-cols-12 gap-0">
              <div className="lg:col-span-4 p-6 md:p-10 bg-slate-50 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-200">
                <div className="flex items-center gap-4 mb-2 md:mb-4">
                  <div className="p-2 md:p-3 bg-white rounded-xl shadow-sm border border-slate-200 group-hover:scale-110 transition-transform">
                    <Zap className="w-5 h-5 md:w-6 md:h-6 text-blue-500 fill-blue-500" />
                  </div>
                  <h3 className="text-lg md:text-xl font-black text-[#0a1628] tracking-tight">{item.category}</h3>
                </div>
              </div>
              
              <div className="lg:col-span-4 p-6 md:p-10 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-100">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 md:mb-4">Legacy Approach</div>
                <p className="text-slate-500 text-base md:text-lg font-medium leading-relaxed">{item.legacy}</p>
              </div>

              <div className="lg:col-span-4 p-6 md:p-10 flex flex-col justify-center bg-blue-50/30 relative">
                <div className="absolute top-0 right-0 p-4">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-3 md:mb-4">The Arcli Advantage</div>
                <p className="text-[#0a1628] text-base md:text-lg font-extrabold leading-relaxed">{item.arcliAdvantage}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkflowSection = ({ workflow }: { workflow: NormalizedPage['workflow'] }) => {
  if (!workflow) return null;
  return (
    <div className="py-8 md:py-12">
      <SectionHeading subtitle="Arcli eliminates manual intervention from your data lifecycle, moving compute as close to the storage layer as possible.">
        Infrastructure Transformation
      </SectionHeading>
      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        <div className="bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 border border-slate-200 relative overflow-hidden group">
           <div className="absolute top-[-30px] right-[-30px] md:top-[-50px] md:right-[-50px] opacity-[0.03] group-hover:rotate-12 transition-transform duration-1000 pointer-events-none">
             <XCircle className="w-48 h-48 md:w-64 md:h-64 text-[#0a1628]" />
           </div>
           <div className="flex items-center gap-4 mb-6 md:mb-8 relative z-10">
             <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
               <Activity className="w-5 h-5 text-slate-400" />
             </div>
             <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">Structural Bottleneck</div>
           </div>
           <div className="space-y-3 md:space-y-4 relative z-10">
             {workflow.legacyBottleneck.map((str, i) => (
               <div key={i} className="p-4 md:p-5 bg-white/80 rounded-xl md:rounded-2xl border border-slate-200/60 text-slate-600 text-sm md:text-base font-medium md:font-semibold leading-relaxed shadow-sm">
                 {str}
               </div>
             ))}
           </div>
        </div>

        <div className="bg-[#0a1628] rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 border border-slate-800 relative overflow-hidden group">
           <div className="absolute top-[-30px] right-[-30px] md:top-[-50px] md:right-[-50px] opacity-[0.05] group-hover:-rotate-12 transition-transform duration-1000 pointer-events-none">
             <Zap className="w-48 h-48 md:w-64 md:h-64 text-blue-400 fill-blue-400" />
           </div>
           <div className="flex items-center gap-4 mb-6 md:mb-8 relative z-10">
             <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] shrink-0">
               <Zap className="w-5 h-5 text-white fill-white" />
             </div>
             <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-blue-400">Autonomous Execution</div>
           </div>
           <div className="space-y-3 md:space-y-4 relative z-10">
             {workflow.arcliAutomation.map((str, i) => (
               <div key={i} className="p-4 md:p-5 bg-blue-900/20 rounded-xl md:rounded-2xl border border-blue-500/20 text-blue-50 text-sm md:text-base font-semibold md:font-bold leading-relaxed backdrop-blur-sm">
                 {str}
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
};

const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  if (steps.length === 0) return null;
  return (
    <div>
      <SectionHeading id="how-it-works" subtitle="Our vectorized orchestration engine handles the complexity of data movement while you focus on high-level decision logic.">
        Implementation Pipeline
      </SectionHeading>
      <div className="relative">
        <div className="absolute left-[24px] md:left-[31px] top-0 bottom-0 w-px bg-gradient-to-b from-blue-500 via-slate-200 to-transparent hidden sm:block"></div>
        <div className="grid gap-10 md:gap-16">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-6 md:gap-10 group relative">
              <div className="flex sm:flex-col items-start sm:items-center gap-4 sm:gap-6 shrink-0 relative z-10">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl md:text-2xl font-black text-slate-300 group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white sm:group-hover:scale-110 transition-all duration-500 shadow-sm group-hover:shadow-xl group-hover:shadow-blue-200">
                  {i + 1}
                </div>
              </div>
              <div className="pt-1 md:pt-2">
                <h4 className="text-xl md:text-2xl font-black text-[#0a1628] mb-3 md:mb-4 tracking-tight group-hover:text-blue-600 transition-colors">{step.title}</h4>
                <p className="text-slate-500 text-base md:text-xl leading-relaxed max-w-3xl font-medium">
                  {step.description}
                </p>
                {step.outcome && (
                  <div className="mt-6 md:mt-8 inline-flex items-center gap-2 md:gap-3 px-4 md:px-5 py-2 md:py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg md:rounded-xl text-[10px] md:text-sm font-black uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> {step.outcome}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Architecture = ({ architecture }: { architecture: NormalizedPage['architecture'] }) => {
  if (!architecture) return null;
  return (
    <div className="bg-[#0a1628] rounded-[2rem] md:rounded-[3rem] p-8 md:p-20 text-white overflow-hidden relative group shadow-2xl border border-slate-800">
      <div className="absolute top-0 right-0 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/10 rounded-full blur-[80px] md:blur-[120px] group-hover:bg-blue-500/20 transition-all duration-1000 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 p-8 md:p-12 opacity-[0.03] group-hover:scale-110 transition-transform duration-1000 pointer-events-none">
        <Cpu className="w-48 h-48 md:w-96 md:h-96" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-4 md:gap-6 mb-10 md:mb-16">
          <div className="w-3 h-3 md:w-4 md:h-4 bg-blue-500 rounded-full animate-pulse shadow-[0_0_25px_rgba(59,130,246,0.8)] shrink-0" />
          <h3 className="text-2xl md:text-4xl font-black tracking-tight">System Specification</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-16">
          {Object.entries(architecture).map(([key, value]) => (
            <div key={key} className="space-y-2 md:space-y-4 group/item">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-slate-400 group-hover/item:text-blue-400 transition-colors">
                {key.replace(/([A-Z])/g, ' $1')}
              </div>
              <div className="text-lg md:text-2xl font-bold leading-relaxed md:leading-tight group-hover/item:translate-x-1 transition-transform">
                {value as string}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 md:mt-20 pt-8 md:pt-12 border-t border-slate-800/50 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
           <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest"><Globe className="w-4 h-4 md:w-5 md:h-5 text-blue-500 shrink-0" /> Multi-Region</div>
           <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest"><Lock className="w-4 h-4 md:w-5 md:h-5 text-blue-500 shrink-0" /> SOC2 Type II</div>
           <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest"><Workflow className="w-4 h-4 md:w-5 md:h-5 text-blue-500 shrink-0" /> API First</div>
           <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest"><BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-blue-500 shrink-0" /> Low Latency</div>
        </div>
      </div>
    </div>
  );
};

const UseCases = ({ useCases }: { useCases: NormalizedPage['useCases'] }) => {
  if (useCases.length === 0) return null;
  return (
    <div className="space-y-10 md:space-y-12">
      <SectionHeading subtitle="Real-world orchestration patterns deployed by our top enterprise partners.">
        Strategic Deployment
      </SectionHeading>
      <div className="grid sm:grid-cols-2 gap-6 md:gap-8">
        {useCases.map((item, i) => (
          <div key={i} className="p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500 group">
            <div className="flex justify-between items-start mb-6 md:mb-8">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <ShieldCheck className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
              </div>
              {item.complexity && (
                <span className="text-[9px] md:text-[10px] uppercase font-black tracking-widest bg-slate-100 text-slate-500 px-3 md:px-4 py-1.5 md:py-2 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {item.complexity}
                </span>
              )}
            </div>
            <h4 className="font-black text-xl md:text-2xl text-[#0a1628] mb-3 md:mb-4 tracking-tight">{item.title}</h4>
            <p className="text-slate-500 text-base md:text-lg font-medium leading-relaxed mb-6 md:mb-10">{item.description}</p>
            {item.businessQuestion && (
              <div className="p-4 md:p-6 bg-slate-50 rounded-[1rem] md:rounded-[1.5rem] text-slate-700 text-sm md:text-base border border-slate-100 flex items-start gap-3 md:gap-4 italic font-medium shadow-inner">
                <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-slate-300 shrink-0" />
                "{item.businessQuestion}"
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 4. STATIC GENERATION & METADATA
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
// 5. MAIN PAGE COMPONENT
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleSchema) }}
      />

      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-40 z-0">
          <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-100 blur-[120px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-50 blur-[100px]" />
        </div>

        <Hero data={data} />
        
        <Demo demo={data.demo} />

        <Personas personas={data.personas} />

        <section className="max-w-7xl mx-auto px-6 lg:px-8 py-20 md:py-32 grid lg:grid-cols-12 gap-16 md:gap-24 relative z-10">
          
          <div className="lg:col-span-8 space-y-24 md:space-y-40">
            
            <Matrix matrix={data.matrix} />

            <WorkflowSection workflow={data.workflow} />

            <Steps steps={data.steps} />

            <UseCases useCases={data.useCases} />

            <Architecture architecture={data.architecture} />

            {data.faqs.length > 0 && (
              <div className="space-y-8 md:space-y-12">
                <SectionHeading id="faq" subtitle="Everything you need to know about implementing Arcli's analytical engine into your stack.">
                  Expert Insights
                </SectionHeading>
                <Accordion type="single" collapsible className="w-full space-y-4 md:space-y-6">
                  {data.faqs.map((faq, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="bg-white border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] px-6 md:px-8 py-2 data-[state=open]:border-blue-400 shadow-sm transition-all duration-300">
                      <AccordionTrigger className="font-black text-[#0a1628] text-lg md:text-xl hover:no-underline hover:text-blue-600 text-left">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-slate-500 text-base md:text-xl leading-relaxed font-medium pb-6 md:pb-8 pt-2 md:pt-4">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-24 md:top-28 space-y-10 md:space-y-12">
              
              {data.features.length > 0 && (
                <div className="p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -z-10 transition-all group-hover:w-32 group-hover:h-32"></div>
                  <h3 className="text-base md:text-lg font-black text-[#0a1628] mb-8 md:mb-10 uppercase tracking-[0.2em] flex items-center gap-3 md:gap-4">
                    <Layers className="w-5 h-5 md:w-6 md:h-6 text-blue-600"/>
                    Core Stack
                  </h3>
                  <ul className="space-y-6 md:space-y-8 mb-10 md:mb-12">
                    {data.features.map((feature, i) => (
                      <li key={i} className="flex items-start group/item">
                        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-50 flex items-center justify-center mr-4 md:mr-5 shrink-0 group-hover/item:bg-blue-600 transition-colors">
                          <Check className="w-3 h-3 md:w-4 md:h-4 text-blue-600 group-hover/item:text-white transition-colors" />
                        </div>
                        <div>
                          <span className="font-black text-[#0a1628] text-base md:text-lg tracking-tight block group-hover/item:text-blue-600 transition-colors">{feature.title}</span>
                          {feature.description && <p className="text-slate-500 mt-1.5 md:mt-2 text-sm md:text-base font-medium leading-relaxed">{feature.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link 
                    href={data.hero.cta.primary.href} 
                    className="flex w-full h-14 md:h-16 items-center justify-center rounded-xl md:rounded-[1.25rem] bg-[#0a1628] text-lg md:text-xl font-black text-white transition-all hover:bg-blue-600 hover:shadow-[0_20px_40px_-10px_rgba(37,99,235,0.5)] hover:-translate-y-1 duration-300"
                  >
                    Get Access Now
                  </Link>
                </div>
              )}

              {data.relatedSlugs.length > 0 && (
                <div className="p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-200 bg-[#fafafa] relative overflow-hidden">
                  <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-6 md:mb-8 flex items-center gap-3">
                    <Compass className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                    Deep Dives
                  </h3>
                  
                  <div className="grid gap-4 md:gap-6">
                    {data.relatedSlugs.map((relatedSlug) => {
                      const rawRelated = getPageCached(relatedSlug) as unknown as RawPage;
                      if (!rawRelated) return null;
                      const tp = rawRelated as RawTemplatePage;
                      const sp = rawRelated as RawStandardPage;
                      
                      const relatedTitle = rawRelated.type === 'template' 
                        ? tp.hero.h1 
                        : (sp.h1 || sp.heroTitle || rawRelated.title || relatedSlug);
                        
                      const relatedDesc = rawRelated.type === 'template' 
                        ? tp.hero.subtitle 
                        : (sp.subtitle || sp.heroDescription || rawRelated.description);
                      
                      return (
                        <Link 
                          key={relatedSlug}
                          href={`/${relatedSlug}`}
                          className="group relative flex flex-col p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 bg-white hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-500"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-sm md:text-base font-black text-[#0a1628] group-hover:text-blue-600 transition-colors line-clamp-1 pr-4">
                              {relatedTitle}
                            </span>
                            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-600 transition-all shrink-0">
                              <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-slate-400 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                          {relatedDesc && (
                            <p className="text-xs md:text-sm text-slate-500 line-clamp-2 leading-relaxed font-medium">
                              {relatedDesc}
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

      <Footer />
    </>
  );
}