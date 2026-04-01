// app/(landing)/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import React, { cache } from 'react';
import { 
  ArrowRight, 
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
  ChevronDown,
  Code2
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
  database:   <Database   className="w-6 h-6 text-[#2563eb]" />,
  layers:     <Layers     className="w-6 h-6 text-[#2563eb]" />,
  shieldCheck:<ShieldCheck className="w-6 h-6 text-[#2563eb]" />,
  zap:        <Zap        className="w-6 h-6 text-[#2563eb]" />,
  terminal:   <Terminal   className="w-6 h-6 text-[#2563eb]" />,
  users:      <Users      className="w-6 h-6 text-[#2563eb]" />,
  activity:   <Activity   className="w-6 h-6 text-[#2563eb]" />,
  cpu:        <Cpu        className="w-6 h-6 text-[#2563eb]" />,
  globe:      <Globe      className="w-6 h-6 text-[#2563eb]" />,
  lock:       <Lock       className="w-6 h-6 text-[#2563eb]" />,
  workflow:   <Workflow   className="w-6 h-6 text-[#2563eb]" />,
  barChart3:  <BarChart3  className="w-6 h-6 text-[#2563eb]" />,
  cloud:      <Cloud      className="w-6 h-6 text-[#2563eb]" />,
  pieChart:   <PieChart   className="w-6 h-6 text-[#2563eb]" />,
  lineChart:  <LineChart  className="w-6 h-6 text-[#2563eb]" />,
  trendingUp: <TrendingUp className="w-6 h-6 text-[#2563eb]" />,
};

const DEFAULT_ICON_KEY: IconKey = 'layers';

function resolveIcon(raw: string | React.ReactNode | undefined): React.ReactNode {
  if (typeof raw === 'string' && raw in iconRegistry) {
    return iconRegistry[raw as IconKey];
  }
  if (raw && typeof raw !== 'string') return raw;
  return iconRegistry[DEFAULT_ICON_KEY];
}

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

const SectionHeading = ({ children, id, subtitle, monoLabel }: { children: React.ReactNode; id?: string; subtitle?: string; monoLabel?: string }) => (
  <div className="text-center max-w-4xl mx-auto mb-20 scroll-mt-28 relative z-10" id={id}>
    {monoLabel && (
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#2563eb] mb-4">
        {monoLabel}
      </div>
    )}
    <h2 
      className="text-[#0B1221] tracking-tight font-extrabold" 
      style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.1, marginBottom: '20px' }}
    >
      {children}
    </h2>
    {subtitle && <p className="text-slate-500 font-medium" style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 640, margin: '0 auto' }}>{subtitle}</p>}
  </div>
);


const Hero = ({ data }: { data: NormalizedPage }) => (
  <section className="relative pt-40 pb-32 overflow-hidden bg-white">
    {/* Atmospheric Background Pattern */}
    <div className="absolute inset-0 z-0 opacity-[0.03] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />
    
    {/* Soft Glow */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#2563eb]/5 rounded-[100%] blur-[120px] pointer-events-none z-0" />
    
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
      <div className="text-center max-w-4xl mx-auto">
        
        {/* Monospace Eyebrow */}
        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 shadow-sm px-4 py-1.5 rounded-full mb-8">
          <Code2 size={14} className="text-[#2563eb]" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#0B1221]">
            {data.type}_ARCHITECTURE
          </span>
        </div>
        
        {/* Deep Navy Main Text */}
        <h1 className="text-[clamp(44px,6vw,72px)] font-extrabold tracking-tight text-[#0B1221] mb-6 leading-[1.05]">
          {data.seo.h1}
        </h1>
        
        <p className="text-slate-500 text-[20px] font-medium leading-[1.6] max-w-3xl mx-auto mb-10">
          {data.hero.subtitle}
        </p>
        
        <div className="flex flex-col items-center justify-center gap-4">
          <Link 
            href={data.hero.cta.primary.href} 
            className="group relative flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-[0_8px_24px_-6px_rgba(37,99,235,0.4)] hover:shadow-[0_12px_30px_-6px_rgba(37,99,235,0.6)] transition-all duration-300 transform hover:-translate-y-0.5"
          >
            {data.hero.cta.primary.text}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            <div className="absolute inset-0 rounded-xl ring-2 ring-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>
          
          <div className="flex items-center gap-4 mt-3 text-sm font-bold text-slate-500 font-mono tracking-tight">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
              14-DAY TRIAL
            </div>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2563eb]" /> 
              NO CREDIT CARD
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
    // Spatial Layering: Negative margin pulls demo up into the hero space slightly
    <section id="interactive-demo" className="pb-32 bg-slate-50 relative -mt-10 pt-20 px-4 sm:px-6 lg:px-8 border-t border-slate-200/50">
      <div className="container mx-auto max-w-5xl relative z-10">
        
        {/* Asymmetrical IDE Mockup Panel */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(2,6,23,0.1)] overflow-hidden flex flex-col relative z-10 group">
          
          {/* Mockup Header (macOS style dots + Monospace title) */}
          <div className="h-12 border-b border-slate-100 flex items-center px-6 gap-4 bg-slate-50">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30"></div>
              <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30"></div>
              <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30"></div>
            </div>
            <div className="mx-auto flex items-center justify-center font-mono text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] gap-2 bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-pulse"></span>
              sys.execution_engine
            </div>
            <div className="w-10"></div>
          </div>

          {/* Mockup Body */}
          <div className="p-8 md:p-12 flex flex-col gap-8 bg-white relative">
            <div className="absolute right-0 top-0 w-64 h-64 bg-[#2563eb]/5 blur-[80px] rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            
            {/* User Prompt */}
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-200 text-[#0B1221] font-bold text-sm shadow-sm">
                US
              </div>
              <div className="bg-slate-50 border border-slate-200 shadow-sm rounded-2xl rounded-tl-sm px-6 py-5 text-[#0B1221] max-w-xl text-lg font-bold">
                "{demo.userPrompt}"
              </div>
            </div>
            
            <div className="pl-14 space-y-6 relative z-10">
              {/* SQL Output */}
              <div className="p-6 bg-[#0B1221] rounded-xl font-mono text-sm text-slate-300 overflow-x-auto shadow-inner max-w-3xl border border-[#1e293b]">
                <div className="flex gap-4 mb-3 border-b border-white/10 pb-3">
                  <div className="text-[#60a5fa] font-bold uppercase tracking-[0.2em] text-[10px]">/// SQL_GENERATED</div>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-slate-300">
                  {demo.generatedSql}
                </div>
              </div>

              {/* Insight Response */}
              <div className="flex flex-col sm:flex-row items-stretch gap-6">
                <div className="flex-1 p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-[#2563eb] font-mono font-bold text-[10px] uppercase tracking-[0.2em]">
                    <Zap className="w-3 h-3" /> sys.insight_extraction
                  </div>
                  <div className="text-[#0B1221] text-lg leading-relaxed font-bold">
                    {demo.aiInsight}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-center justify-center px-8 py-5 bg-blue-50/50 rounded-xl border border-blue-100 shadow-sm min-w-[160px]">
                  <div className="text-4xl font-extrabold text-[#2563eb] tracking-tight">{demo.chartMetric}</div>
                  <div className="font-mono text-[10px] text-blue-600/70 font-bold uppercase tracking-[0.2em] mt-2">Confidence</div>
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
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading 
          monoLabel="// ROLE_DEFINITIONS"
          subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise."
        >
          Engineered for Roles
        </SectionHeading>
        
        <div className="grid md:grid-cols-3 gap-6">
          {personas.map((persona, i) => (
            // Punchy Cards: Solid background, strong border, distinct top highlight, hover lift
            <div key={i} className="group bg-white border border-slate-200 border-t-4 border-t-[#0B1221] rounded-xl p-8 shadow-[0_4px_15px_-5px_rgba(2,6,23,0.05)] hover:shadow-[0_20px_40px_-10px_rgba(37,99,235,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
              <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center mb-6 border border-slate-200 text-[#0B1221] group-hover:bg-[#2563eb] group-hover:text-white group-hover:border-[#2563eb] transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-[22px] font-bold text-[#0B1221] mb-3 tracking-tight">{persona.role}</h3>
              <p className="text-slate-500 text-[16px] font-medium leading-relaxed mb-8 flex-grow">
                {persona.description}
              </p>
              <div className="space-y-3 pt-6 border-t border-slate-100">
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
    <section className="py-24 bg-slate-50 relative border-y border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading 
          monoLabel="// COMPETITIVE_ANALYSIS"
          subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine."
        >
          The Competitive Edge
        </SectionHeading>
        
        <div className="grid gap-6">
          {matrix.map((item, i) => (
            // Punchy List Items
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#2563eb]/30 transition-all duration-300 overflow-hidden group">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center border border-slate-200 shrink-0 group-hover:border-[#2563eb]/30">
                  <Zap className="w-4 h-4 text-[#2563eb]" />
                </div>
                <h3 className="text-lg font-bold text-[#0B1221] tracking-tight">{item.category}</h3>
              </div>

              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                <div className="p-8 flex flex-col justify-start">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">LEGACY_APPROACH</span>
                  </div>
                  <p className="text-slate-500 text-[17px] font-medium leading-relaxed">{item.legacy}</p>
                </div>

                <div className="p-8 flex flex-col justify-start bg-blue-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb]">ARCLI_ADVANTAGE</span>
                  </div>
                  <p className="text-[#0B1221] text-[17px] font-bold leading-relaxed">{item.arcliAdvantage}</p>
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
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading 
          monoLabel="// INFRA_TRANSFORMATION"
          subtitle="Arcli eliminates manual intervention from your data lifecycle, moving compute directly to the storage layer."
        >
          Infrastructure Transformation
        </SectionHeading>
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Legacy Phase */}
          <div className="bg-slate-50 rounded-2xl p-10 border border-slate-200 relative overflow-hidden">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                 <XCircle className="w-6 h-6 text-slate-400" />
               </div>
               <h3 className="text-2xl font-bold text-[#0B1221] tracking-tight">Structural Bottleneck</h3>
             </div>
             <div className="space-y-3 relative z-10">
               {workflow.legacyBottleneck.map((str, i) => (
                 <div key={i} className="p-4 bg-white rounded-lg border border-slate-200 text-slate-500 text-[16px] font-medium leading-relaxed shadow-sm">
                   {str}
                 </div>
               ))}
             </div>
          </div>

          {/* Arcli Phase - Deep Navy Punchy Card */}
          <div className="bg-[#0B1221] rounded-2xl p-10 relative overflow-hidden shadow-[0_20px_50px_-15px_rgba(11,18,33,0.5)] transform md:-translate-y-4">
             <div className="absolute top-0 right-0 w-64 h-64 bg-[#2563eb]/20 blur-[80px] pointer-events-none"></div>
             <div className="absolute inset-0 border border-white/10 rounded-2xl"></div>
             <div className="flex items-center gap-4 mb-8 relative z-10">
               <div className="w-12 h-12 rounded-xl bg-[#2563eb] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                 <Zap className="w-6 h-6 text-white" />
               </div>
               <h3 className="text-2xl font-bold text-white tracking-tight">Autonomous Execution</h3>
             </div>
             <div className="space-y-3 relative z-10">
               {workflow.arcliAutomation.map((str, i) => (
                 <div key={i} className="p-4 bg-white/5 rounded-lg border border-white/10 text-slate-200 text-[16px] font-medium leading-relaxed backdrop-blur-sm">
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
    <section className="py-24 bg-slate-50 border-y border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading 
          monoLabel="// STRATEGIC_DEPLOYMENT"
          subtitle="Real-world orchestration patterns deployed by our top enterprise partners."
        >
          Strategic Deployment
        </SectionHeading>
        
        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((item, i) => {
            const isAdvanced = item.complexity?.toLowerCase().includes('advanced') || item.complexity?.toLowerCase().includes('strategic');
            return (
              // Punchy Card with gradient background and border lift
              <div key={i} className="bg-gradient-to-b from-white to-slate-50/80 rounded-2xl border border-slate-200 p-8 md:p-10 shadow-sm hover:shadow-[0_15px_30px_-10px_rgba(37,99,235,0.15)] hover:border-[#2563eb]/40 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-slate-200 shadow-sm group-hover:border-[#2563eb]/40 transition-colors">
                    <ShieldCheck className="w-6 h-6 text-[#0B1221] group-hover:text-[#2563eb]" />
                  </div>
                  {item.complexity && (
                    <span className={`font-mono text-[10px] uppercase font-bold tracking-[0.2em] px-3 py-1.5 rounded-md border ${isAdvanced ? 'text-[#2563eb] border-blue-200 bg-blue-50' : 'text-slate-500 border-slate-200 bg-white'}`}>
                      {item.complexity}
                    </span>
                  )}
                </div>
                
                <h4 className="font-bold text-2xl tracking-tight text-[#0B1221] mb-3">{item.title}</h4>
                <p className="text-slate-500 text-[16px] font-medium leading-relaxed mb-8 flex-grow">{item.description}</p>
                
                {item.businessQuestion && (
                  <div className="bg-white rounded-xl p-5 mt-auto border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563eb]"></div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb] mb-2 flex items-center gap-2 ml-2">
                      <Sparkles className="w-3 h-3" /> QUERY_INPUT
                    </div>
                    <p className="text-[#0B1221] text-lg font-bold italic leading-relaxed ml-2">
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
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// EXECUTION_PIPELINE"
          subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic."
        >
          Implementation Pipeline
        </SectionHeading>
        
        <div className="relative pl-10 md:pl-0">
          {/* Stronger central line */}
          <div className="absolute left-[29px] md:left-1/2 md:-ml-[1.5px] top-0 bottom-0 w-[3px] bg-slate-100"></div>
          
          <div className="space-y-12 md:space-y-16">
            {steps.map((step, i) => (
              <div 
                key={i} 
                className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-12 group" 
              >
                <div className="hidden md:block w-1/2"></div>
                
                {/* Timeline node */}
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-3 w-6 h-6 rounded-full bg-white border-[3px] border-slate-200 group-hover:border-[#2563eb] z-10 flex items-center justify-center transition-colors duration-300">
                   <div className="w-2 h-2 bg-transparent group-hover:bg-[#2563eb] rounded-full transition-colors duration-300"></div>
                </div>
                
                {/* Punchy Step Card */}
                <div className="w-full md:w-1/2 bg-white border border-slate-200 shadow-sm rounded-2xl p-8 hover:shadow-[0_10px_25px_-5px_rgba(37,99,235,0.15)] hover:border-[#2563eb]/30 transition-all duration-300 relative overflow-hidden">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb] mb-2">
                    PHASE_{i + 1} // {step.title}
                  </div>
                  <h4 className="text-xl font-bold text-[#0B1221] leading-snug mb-2 tracking-tight">
                    {step.description}
                  </h4>
                  {step.outcome && (
                    <div className="mt-4 text-[15px] text-slate-500 font-bold flex items-center gap-2 pt-4 border-t border-slate-100">
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
    <section className="py-24 bg-slate-50 border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading 
          monoLabel="// CORE_CAPABILITIES"
          subtitle="The technological foundation behind the unified engine."
        >
          Core Capabilities
        </SectionHeading>
        
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            // Punchy feature box
            <div key={i} className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 hover:shadow-[0_12px_24px_-8px_rgba(2,6,23,0.1)] hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-50/50 rounded-lg flex items-center justify-center mb-5 border border-blue-100 text-[#2563eb] group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-[20px] tracking-tight font-bold text-[#0B1221] mb-2">{feature.title}</h3>
              {feature.description && (
                <p className="text-slate-500 leading-relaxed font-medium text-[15px]">
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
      {/* Deep Space Background Tech */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#2563eb]/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-[#60a5fa]" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#60a5fa]">SYSTEM_SPECIFICATION</span>
            </div>
            <h2 className="text-[clamp(32px,5vw,48px)] font-extrabold tracking-tight leading-[1.05]">Enterprise Architecture</h2>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {Object.entries(architecture).map(([key, value], i) => (
            // Tech-focused punchy dark card
            <div key={key} className="bg-white/5 border border-white/10 p-8 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 group">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 group-hover:text-[#60a5fa] transition-colors">
                {key.replace(/([A-Z])/g, '_$1')}
              </h4>
              <p className="text-xl font-bold text-white leading-relaxed tracking-tight">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6">
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Globe className="w-4 h-4 text-slate-500" /> MULTI-REGION
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Lock className="w-4 h-4 text-slate-500" /> SOC2 TYPE II
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <Workflow className="w-4 h-4 text-slate-500" /> API FIRST
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-bold font-mono text-[12px] tracking-tight uppercase">
             <BarChart3 className="w-4 h-4 text-slate-500" /> LOW LATENCY
           </div>
        </div>
      </div>
    </section>
  );
};

const RelatedLinks = ({ slugs, heroCta }: { slugs: string[], heroCta: NormalizedPage['hero']['cta'] }) => {
  if (slugs.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#2563eb] mb-4">
            // RELATED_MODULES
          </div>
          <h2 className="text-[clamp(32px,5vw,48px)] font-extrabold text-[#0B1221] mb-4 tracking-tight leading-[1.05]">Explore Deep Dives</h2>
          <p className="text-[18px] text-slate-500 font-medium max-w-2xl mx-auto">Discover specific architectural setups and orchestration patterns.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
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
                className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm hover:border-[#2563eb]/40 hover:shadow-[0_8px_20px_-6px_rgba(37,99,235,0.15)] transition-all duration-300 group flex flex-col justify-between h-full hover:-translate-y-1"
              >
                <h3 className="text-[19px] font-bold text-[#0B1221] mb-6 tracking-tight">
                  {relatedTitle}
                </h3>
                <div className="flex items-center justify-between mt-auto">
                  <span className="font-mono text-[10px] font-bold text-[#2563eb] uppercase tracking-[0.2em]">ACCESS_FILE</span>
                  <ArrowRight className="w-4 h-4 text-[#2563eb] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
        
        <div className="flex justify-center">
          <Link 
            href={heroCta.primary.href} 
            className="group relative flex items-center justify-center gap-2 bg-[#0B1221] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-[0_4px_14px_0_rgb(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all duration-300"
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
    <section className="py-24 bg-white border-t border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading 
          monoLabel="// DOCUMENTATION"
          subtitle="Everything you need to know about implementing Arcli's engine into your stack."
        >
          Expert Insights
        </SectionHeading>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            // Punchy FAQ items
            <details key={i} className="group bg-white border border-slate-200 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden shadow-sm hover:border-slate-300 transition-colors">
              <summary className="flex items-center justify-between cursor-pointer p-6 md:p-8 font-bold text-[#0B1221] text-[18px] hover:bg-slate-50 transition-colors focus:outline-none tracking-tight">
                {faq.q}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-500 group-hover:bg-[#2563eb] group-hover:text-white group-hover:border-[#2563eb]">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="p-6 md:p-8 pt-0 text-slate-500 text-[16px] leading-relaxed font-medium bg-white border-t border-slate-100">
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