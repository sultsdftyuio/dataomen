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
  CheckCircle2,
  Activity,
  Cpu,
  Globe,
  Lock,
  Workflow,
  BarChart3,
  Sparkles,
  Cloud,
  PieChart,
  LineChart,
  TrendingUp,
  ChevronDown
} from 'lucide-react';

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
  | 'workflow' | 'barChart3' | 'cloud' | 'pieChart' | 'lineChart' | 'trendingUp';

// Deep Navy: #0B1221, Sharp Blue: #2563eb
export const iconRegistry: Record<IconKey, React.ReactNode> = {
  database:   <Database   className="w-6 h-6 text-[#0B1221]" />,
  layers:     <Layers     className="w-6 h-6 text-[#0B1221]" />,
  shieldCheck:<ShieldCheck className="w-6 h-6 text-[#0B1221]" />,
  zap:        <Zap        className="w-6 h-6 text-[#0B1221]" />,
  terminal:   <Terminal   className="w-6 h-6 text-[#0B1221]" />,
  users:      <Users      className="w-6 h-6 text-[#0B1221]" />,
  activity:   <Activity   className="w-6 h-6 text-[#0B1221]" />,
  cpu:        <Cpu        className="w-6 h-6 text-[#0B1221]" />,
  globe:      <Globe      className="w-6 h-6 text-[#0B1221]" />,
  lock:       <Lock       className="w-6 h-6 text-[#0B1221]" />,
  workflow:   <Workflow   className="w-6 h-6 text-[#0B1221]" />,
  barChart3:  <BarChart3  className="w-6 h-6 text-[#0B1221]" />,
  cloud:      <Cloud      className="w-6 h-6 text-[#0B1221]" />,
  pieChart:   <PieChart   className="w-6 h-6 text-[#0B1221]" />,
  lineChart:  <LineChart  className="w-6 h-6 text-[#0B1221]" />,
  trendingUp: <TrendingUp className="w-6 h-6 text-[#0B1221]" />,
};

const DEFAULT_ICON_KEY: IconKey = 'layers';

function resolveIcon(raw: string | React.ReactNode | undefined): React.ReactNode {
  if (typeof raw === 'string' && raw in iconRegistry) {
    return iconRegistry[raw as IconKey];
  }
  if (raw && typeof raw !== 'string') return raw;
  return iconRegistry[DEFAULT_ICON_KEY];
}

// Internal Representation of a fully parsed page
export interface NormalizedPage {
  slug: string;
  type: string;
  seo: { title: string; description: string; h1: string; datePublished: string; dateModified: string };
  hero: { subtitle: string; icon: React.ReactNode; cta: { primary: CTA; secondary?: CTA } };
  demo?: { userPrompt: string; generatedSql: string; aiInsight: string; chartMetric: string };
  personas: Array<{ role: string; description: string; capabilities: string[] }>;
  matrix: Array<{ category: string; legacy: string; arcliAdvantage: string }>;
  workflow?: { legacyBottleneck: string[]; arcliAutomation: string[] };
  steps: Array<{ title: string; description: string; outcome?: string }>;
  useCases: Array<{ title: string; description: string; businessQuestion?: string; complexity?: string }>;
  architecture?: Record<string, string>;
  faqs: Array<{ q: string; a: string }>;
  relatedSlugs: string[];
  features: CoreCapability[];
}

const normalizeSEO = (p: any): NormalizedPage['seo'] => {
  const published = p.datePublished || '2024-01-01T08:00:00Z';
  const modified  = p.dateModified  || published;

  return {
    title: p.title || p.metadata?.title || 'Arcli Platform',
    description: p.description || p.metadata?.description || '',
    h1: p.type === 'template' ? p.hero?.h1 : (p.h1 || p.heroTitle || p.title || 'Arcli'),
    datePublished: published,
    dateModified:  modified,
  };
};

const normalizeHero = (p: any): NormalizedPage['hero'] => {
  const rawIcon = p.type === 'template' ? (p.hero?.icon ?? p.icon) : p.icon;

  return {
    subtitle: p.type === 'template' ? p.hero?.subtitle : (p.heroDescription || p.description || ''),
    icon: resolveIcon(rawIcon),
    cta: p.ctaHierarchy || { primary: { text: 'Start Free Trial', href: '/register' } },
  };
};

const normalizeFeatures = (p: any): CoreCapability[] => {
  const raw = p.features || p.capabilities || p.performanceMetrics || p.trustAndSecurity;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  const mapped = safe.map((f: any) => {
    if (typeof f === 'string') return { title: f, description: '' };
    return {
      title: f?.title || f?.name || f?.principle || '',
      description: f?.description || f?.executiveExplanation || f?.howWeDeliver || ''
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

const normalizeSteps = (p: any): NormalizedPage['steps'] => {
  const raw = p.steps || p.onboardingExperience || p.orchestrationWorkflow || p.pipelinePhases;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  return safe.map((s: any) => ({
    title: s?.title || s?.name || s?.phase || 'Phase',
    description: typeof s === 'string' ? s : (s?.text || s?.action || s?.description || (s?.userAction ? `${s.userAction}` : '')),
    outcome: s?.outcome
  }));
};

const normalizeUseCases = (p: any): NormalizedPage['useCases'] => {
  const raw = p.useCases || p.analyticalScenarios || p.executiveScenarios || p.enterpriseApplications;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  return safe.map((u: any) => ({
    title: u?.title || u?.vertical || (u?.complexity ? `${u.complexity} Scenario` : 'Application'),
    description: typeof u === 'string' 
      ? u 
      : (u?.description || u?.businessOutcome || u?.application || (u?.competitorFriction && u?.arcliResolution ? `${u.competitorFriction} ${u.arcliResolution}` : '') || ''),
    businessQuestion: u?.businessQuestion,
    complexity: u?.complexity
  }));
};

const normalizeMatrix = (p: any): NormalizedPage['matrix'] => {
  if (p.comparison) {
     return (p.comparison.competitorFlaws || []).map((flaw: string, i: number) => ({
        category: p.comparison.competitor || 'Legacy',
        legacy: flaw,
        arcliAdvantage: p.comparison.arcliWins?.[i] || 'Automated AI processing'
     }));
  }

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
    const rawPage = getPageCached(slug) as any;
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


// ----------------------------------------------------------------------
// PAGE SECTIONS
// ----------------------------------------------------------------------

const SectionHeading = ({ children, id, subtitle }: { children: React.ReactNode; id?: string; subtitle?: string }) => (
  <div className="text-center max-w-4xl mx-auto mb-20 scroll-mt-28" id={id}>
    <h2 
      className="text-[#0B1221] tracking-tight font-extrabold" 
      style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.1, marginBottom: '20px' }}
    >
      {children}
    </h2>
    {subtitle && <p className="text-slate-500 font-medium" style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 600, margin: '0 auto' }}>{subtitle}</p>}
  </div>
);


const Hero = ({ data }: { data: NormalizedPage }) => (
  <section className="relative pt-40 pb-32 overflow-hidden bg-white">
    {/* Gentle soft gradients for depth without boxiness */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-50/50 rounded-[100%] blur-[100px] -z-10" />
    
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
      <div className="text-center max-w-4xl mx-auto">
        
        {/* Clean, minimalist eyebrow */}
        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-1.5 rounded-full mb-8">
          <Sparkles size={14} className="text-[#2563eb]" />
          <span className="text-[#0B1221] text-xs font-bold uppercase tracking-widest">
            {data.type}
          </span>
        </div>
        
        {/* Deep Navy Main Text */}
        <h1 className="text-[clamp(44px,6vw,72px)] font-extrabold tracking-tight text-[#0B1221] mb-6 leading-[1.05]">
          {data.seo.h1}
        </h1>
        
        <p className="text-slate-500 text-[20px] font-medium leading-[1.6] max-w-2xl mx-auto mb-10">
          {data.hero.subtitle}
        </p>
        
        <div className="flex flex-col items-center justify-center gap-4">
          <Link 
            href={data.hero.cta.primary.href} 
            className="group flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-[0_8px_24px_-6px_rgba(37,99,235,0.4)] transition-all duration-300 transform hover:-translate-y-0.5"
          >
            {data.hero.cta.primary.text}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          
          <div className="flex items-center gap-4 mt-3 text-sm font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
              14-day free trial
            </div>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2563eb]" /> 
              No credit card
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Demo = ({ demo }: { demo: NormalizedPage['demo'] }) => {
  if (!demo) return null;
  return (
    <section id="interactive-demo" className="pb-32 bg-white px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-5xl relative">
        <div className="absolute top-10 left-10 w-96 h-96 bg-blue-50/60 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-slate-50/80 rounded-full blur-3xl -z-10"></div>
        
        {/* Crisp White Panel with Soft Shadow */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_12px_40px_-12px_rgba(2,6,23,0.08)] overflow-hidden flex flex-col relative z-10">
          
          {/* Header */}
          <div className="h-12 border-b border-slate-100 flex items-center px-6 gap-4 bg-slate-50/50">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-200"></div>
              <div className="w-3 h-3 rounded-full bg-slate-200"></div>
              <div className="w-3 h-3 rounded-full bg-slate-200"></div>
            </div>
            <div className="mx-auto flex items-center justify-center text-[11px] font-bold text-slate-400 uppercase tracking-widest gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-pulse"></span>
              Live Execution
            </div>
            <div className="w-10"></div>
          </div>

          {/* Body */}
          <div className="p-8 md:p-12 flex flex-col gap-8 bg-white">
            
            {/* User Prompt */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-100 text-[#0B1221] font-bold text-sm">
                US
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-6 py-5 text-[#0B1221] max-w-xl text-lg font-medium">
                "{demo.userPrompt}"
              </div>
            </div>
            
            <div className="pl-14 space-y-8">
              {/* SQL Output (Deep Navy Box) */}
              <div className="p-6 bg-[#0B1221] rounded-xl font-mono text-sm text-slate-300 overflow-x-auto shadow-sm max-w-3xl">
                <div className="flex gap-4 mb-3 border-b border-white/10 pb-3">
                  <div className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">SQL_GENERATED</div>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-[#60a5fa]">
                  {demo.generatedSql}
                </div>
              </div>

              {/* Insight Response */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-white border border-slate-100 rounded-xl shadow-sm">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-[#2563eb] font-bold text-[10px] uppercase tracking-widest">
                    <Zap className="w-3 h-3" /> Insight Extraction
                  </div>
                  <div className="text-[#0B1221] text-lg leading-relaxed font-bold">
                    {demo.aiInsight}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-center justify-center px-6 py-5 bg-slate-50 rounded-xl border border-slate-100 min-w-[140px]">
                  <div className="text-3xl font-extrabold text-[#2563eb] tracking-tight">{demo.chartMetric}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Confidence</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

const Personas = ({ personas }: { personas: NormalizedPage['personas'] }) => {
  if (personas.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise.">
          Engineered for Roles
        </SectionHeading>
        <div className="grid md:grid-cols-3 gap-6">
          {personas.map((persona, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-8 hover:shadow-[0_8px_30px_-12px_rgba(2,6,23,0.1)] transition-all duration-300 flex flex-col h-full">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6 border border-slate-100 text-[#0B1221]">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-[22px] font-bold text-[#0B1221] mb-3 tracking-tight">{persona.role}</h3>
              <p className="text-slate-500 text-[17px] font-medium leading-relaxed mb-8 flex-grow">
                {persona.description}
              </p>
              <div className="space-y-3 pt-6 border-t border-slate-50">
                {persona.capabilities.map((cap, j) => (
                  <div key={j} className="flex items-start gap-3 text-[#0B1221] font-medium text-[15px]">
                    <CheckCircle2 className="w-5 h-5 text-[#2563eb] shrink-0 mt-0.5" />
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
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine.">
          The Competitive Edge
        </SectionHeading>
        
        <div className="grid gap-6">
          {matrix.map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md overflow-hidden transition-shadow duration-300">
              <div className="px-8 py-5 border-b border-slate-50 bg-slate-50/50 flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-100 shrink-0">
                  <Zap className="w-4 h-4 text-[#2563eb]" />
                </div>
                <h3 className="text-xl font-bold text-[#0B1221] tracking-tight">{item.category}</h3>
              </div>

              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Legacy */}
                <div className="p-8 flex flex-col justify-start">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Legacy Approach</span>
                  </div>
                  <p className="text-slate-500 text-lg font-medium leading-relaxed">{item.legacy}</p>
                </div>

                {/* Arcli */}
                <div className="p-8 flex flex-col justify-start bg-blue-50/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb]">Arcli Advantage</span>
                  </div>
                  <p className="text-[#0B1221] text-lg font-bold leading-relaxed">{item.arcliAdvantage}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const WorkflowSection = ({ workflow }: { workflow: NormalizedPage['workflow'] }) => {
  if (!workflow) return null;
  return (
    <section className="py-24 bg-slate-50/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Arcli eliminates manual intervention from your data lifecycle, moving compute directly to the storage layer.">
          Infrastructure Transformation
        </SectionHeading>
        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Legacy Phase */}
          <div className="bg-white rounded-2xl p-10 border border-slate-100 relative overflow-hidden">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
                 <XCircle className="w-6 h-6 text-slate-400" />
               </div>
               <h3 className="text-2xl font-bold text-[#0B1221] tracking-tight">Structural Bottleneck</h3>
             </div>
             <div className="space-y-3 relative z-10">
               {workflow.legacyBottleneck.map((str, i) => (
                 <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 text-[17px] font-medium leading-relaxed">
                   {str}
                 </div>
               ))}
             </div>
          </div>

          {/* Arcli Phase - Deep Navy */}
          <div className="bg-[#0B1221] rounded-2xl p-10 relative overflow-hidden shadow-lg shadow-[#0B1221]/10">
             <div className="absolute top-0 right-0 w-64 h-64 bg-[#2563eb]/20 blur-[80px] pointer-events-none"></div>
             <div className="flex items-center gap-4 mb-8 relative z-10">
               <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                 <Zap className="w-6 h-6 text-[#60a5fa]" />
               </div>
               <h3 className="text-2xl font-bold text-white tracking-tight">Autonomous Execution</h3>
             </div>
             <div className="space-y-3 relative z-10">
               {workflow.arcliAutomation.map((str, i) => (
                 <div key={i} className="p-4 bg-white/5 rounded-lg border border-white/10 text-slate-300 text-[17px] font-medium leading-relaxed">
                   {str}
                 </div>
               ))}
             </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const UseCases = ({ useCases }: { useCases: NormalizedPage['useCases'] }) => {
  if (useCases.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Real-world orchestration patterns deployed by our top enterprise partners.">
          Strategic Deployment
        </SectionHeading>
        
        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((item, i) => {
            const isAdvanced = item.complexity?.toLowerCase().includes('advanced') || item.complexity?.toLowerCase().includes('strategic');
            return (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 hover:shadow-md p-8 md:p-10 transition-shadow duration-300 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100">
                    <ShieldCheck className="w-6 h-6 text-[#0B1221]" />
                  </div>
                  {item.complexity && (
                    <span className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-md border ${isAdvanced ? 'text-[#2563eb] border-blue-200 bg-blue-50' : 'text-slate-500 border-slate-100'}`}>
                      {item.complexity}
                    </span>
                  )}
                </div>
                
                <h4 className="font-bold text-2xl tracking-tight text-[#0B1221] mb-3">{item.title}</h4>
                <p className="text-slate-500 text-[17px] font-medium leading-relaxed mb-8 flex-grow">{item.description}</p>
                
                {item.businessQuestion && (
                  <div className="bg-slate-50 rounded-xl p-5 mt-auto border border-slate-100">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb] mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Query
                    </div>
                    <p className="text-[#0B1221] text-lg font-medium italic leading-relaxed">
                      "{item.businessQuestion}"
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const Steps = ({ steps }: { steps: NormalizedPage['steps'] }) => {
  if (steps.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic.">
          Implementation Pipeline
        </SectionHeading>
        
        <div className="relative pl-10 md:pl-0">
          <div className="absolute left-[29px] md:left-1/2 md:-ml-px top-0 bottom-0 w-px bg-slate-200"></div>
          
          <div className="space-y-12 md:space-y-16">
            {steps.map((step, i) => (
              <div 
                key={i} 
                className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-12" 
              >
                <div className="hidden md:block w-1/2"></div>
                
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-2.5 w-5 h-5 rounded-full bg-white border-2 border-[#2563eb] z-10 flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-[#2563eb] rounded-full"></div>
                </div>
                
                <div className="w-full md:w-1/2 bg-white border border-slate-100 rounded-2xl p-8 hover:shadow-md transition-shadow relative overflow-hidden">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb] mb-2">
                    {step.title}
                  </div>
                  <h4 className="text-xl font-bold text-[#0B1221] leading-snug mb-2 tracking-tight">
                    {step.description}
                  </h4>
                  {step.outcome && (
                    <div className="mt-4 text-[15px] text-slate-500 font-medium flex items-center gap-2 pt-4 border-t border-slate-50">
                      <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                      {step.outcome}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const Features = ({ features }: { features: NormalizedPage['features'] }) => {
  if (features.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="The technological foundation behind the unified engine.">
          Core Capabilities
        </SectionHeading>
        
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-8 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center mb-5 border border-slate-100">
                <Layers className="w-5 h-5 text-[#2563eb]" />
              </div>
              <h3 className="text-xl tracking-tight font-bold text-[#0B1221] mb-2">{feature.title}</h3>
              {feature.description && (
                <p className="text-slate-500 leading-relaxed font-medium">
                  {feature.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Architecture = ({ architecture }: { architecture: NormalizedPage['architecture'] }) => {
  if (!architecture || Object.keys(architecture).length === 0) return null;
  return (
    <section className="py-24 bg-[#0B1221] text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#2563eb]/10 blur-[100px] pointer-events-none"></div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-5 h-5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Specification</span>
            </div>
            <h2 className="text-[clamp(32px,5vw,48px)] font-extrabold tracking-tight leading-[1.05]">Enterprise Architecture</h2>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {Object.entries(architecture).map(([key, value], i) => (
            <div key={key} className="bg-white/5 border border-white/10 p-8 rounded-2xl hover:bg-white/10 transition-colors">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#60a5fa] mb-2">
                {key.replace(/([A-Z])/g, ' $1')}
              </h4>
              <p className="text-xl font-bold text-white leading-relaxed tracking-tight">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6">
           <div className="flex items-center gap-2 text-slate-300 font-medium">
             <Globe className="w-4 h-4 text-slate-500" /> Multi-Region
           </div>
           <div className="flex items-center gap-2 text-slate-300 font-medium">
             <Lock className="w-4 h-4 text-slate-500" /> SOC2 Type II
           </div>
           <div className="flex items-center gap-2 text-slate-300 font-medium">
             <Workflow className="w-4 h-4 text-slate-500" /> API First
           </div>
           <div className="flex items-center gap-2 text-slate-300 font-medium">
             <BarChart3 className="w-4 h-4 text-slate-500" /> Low Latency
           </div>
        </div>
      </div>
    </section>
  );
};

const RelatedLinks = ({ slugs, heroCta }: { slugs: string[], heroCta: NormalizedPage['hero']['cta'] }) => {
  if (slugs.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden border-t border-slate-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-[clamp(32px,5vw,48px)] font-extrabold text-[#0B1221] mb-4 tracking-tight leading-[1.05]">Explore Deep Dives</h2>
          <p className="text-[18px] text-slate-500 font-medium max-w-2xl mx-auto">Discover specific architectural setups and orchestration patterns.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {slugs.map((relatedSlug, i) => {
            const rawRelated = getPageCached(relatedSlug) as any;
            if (!rawRelated) return null;
            
            const relatedTitle = rawRelated.type === 'template' 
              ? rawRelated.hero?.h1 
              : (rawRelated.h1 || rawRelated.heroTitle || rawRelated.title || relatedSlug);
            
            return (
              <Link 
                key={relatedSlug}
                href={`/${relatedSlug}`}
                className="bg-white p-8 rounded-2xl border border-slate-100 hover:border-[#2563eb]/30 hover:shadow-md transition-all group flex flex-col justify-between h-full"
              >
                <h3 className="text-xl font-bold text-[#0B1221] mb-4 tracking-tight">
                  {relatedTitle}
                </h3>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[13px] font-bold text-[#2563eb] uppercase tracking-wider">Read Article</span>
                  <ArrowRight className="w-4 h-4 text-[#2563eb] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
        
        <div className="flex justify-center">
          <Link 
            href={heroCta.primary.href} 
            className="group flex items-center justify-center gap-2 bg-[#0B1221] hover:bg-[#1f2937] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-md transition-all duration-300"
          >
            {heroCta.primary.text} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
};

const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  if (faqs.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Everything you need to know about implementing Arcli's engine into your stack.">
          Expert Insights
        </SectionHeading>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="group bg-white border border-slate-100 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden shadow-sm">
              <summary className="flex items-center justify-between cursor-pointer p-6 md:p-8 font-bold text-[#0B1221] text-lg hover:bg-slate-50 transition-colors focus:outline-none tracking-tight">
                {faq.q}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-50 border border-slate-100 p-1.5 rounded-lg text-slate-500 group-hover:bg-[#2563eb] group-hover:text-white group-hover:border-[#2563eb]">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="p-6 md:p-8 pt-0 text-slate-500 text-[17px] leading-relaxed font-medium bg-white border-t border-slate-50">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

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