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
  cloud:      <Cloud      className="w-6 h-6 text-blue-600" />,
  pieChart:   <PieChart   className="w-6 h-6 text-blue-600" />,
  lineChart:  <LineChart  className="w-6 h-6 text-blue-600" />,
  trendingUp: <TrendingUp className="w-6 h-6 text-blue-600" />,
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
    subtitle: p.type === 'template' ? p.hero?.subtitle : (p.subtitle || p.heroDescription || p.description || ''),
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

// Reusable Section Heading for standardized typography
const SectionHeading = ({ children, id, subtitle }: { children: React.ReactNode; id?: string; subtitle?: string }) => (
  <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20 scroll-mt-28" id={id}>
    <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
      {children}
    </h2>
    {subtitle && <p className="text-xl text-slate-600 font-medium leading-relaxed">{subtitle}</p>}
  </div>
);

// ----------------------------------------------------------------------
// PAGE SECTIONS
// ----------------------------------------------------------------------

const Hero = ({ data }: { data: NormalizedPage }) => (
  <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-50/50 rounded-full blur-3xl -z-10 pointer-events-none"></div>
    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,white_100%)] -z-10 pointer-events-none"></div>
    
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
      <div className="text-center max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-blue-700 text-sm font-semibold border border-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <div className="text-blue-600 flex items-center justify-center">
            {React.isValidElement(data.hero.icon) 
              ? React.cloneElement(data.hero.icon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4 shrink-0 fill-blue-500" }) 
              : data.hero.icon}
          </div>
          <span className="capitalize">{data.type} Definition</span>
        </div>
        
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-balance leading-[1.1] text-slate-900">
          {data.seo.h1}
        </h1>
        
        <p className="text-base md:text-xl lg:text-2xl text-slate-600 max-w-3xl mx-auto leading-relaxed text-balance font-medium">
          {data.hero.subtitle}
        </p>
        
        <div className="flex flex-col items-center justify-center pt-6 gap-4">
          <Link 
            href={data.hero.cta.primary.href} 
            className="w-full sm:w-auto px-10 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(15,23,42,0.15)] hover:shadow-[0_0_40px_rgba(15,23,42,0.25)] hover:-translate-y-0.5 duration-300 text-lg"
          >
            {data.hero.cta.primary.text}
            <ArrowRight className="w-5 h-5" />
          </Link>
          
          <div className="flex items-center gap-4 mt-4 text-sm font-medium text-slate-500">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              14-day free trial
            </div>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> 
              No credit card required
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
    <section id="interactive-demo" className="pb-24 md:pb-32 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-5xl relative">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-sky-200/30 rounded-full blur-3xl -z-10"></div>
        <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl -z-10"></div>
        
        <div className="rounded-3xl border border-slate-200/80 bg-white/50 p-2 md:p-4 shadow-2xl shadow-blue-900/10 relative overflow-hidden backdrop-blur-xl">
          <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm flex flex-col h-full">
            
            {/* Header */}
            <div className="h-14 border-b border-slate-100 flex items-center px-6 gap-4 bg-slate-50/80 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
              </div>
              <div className="mx-auto flex items-center justify-center bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 gap-2 min-w-[200px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                Live Engine Execution
              </div>
              <div className="w-10"></div>
            </div>

            {/* Body */}
            <div className="p-6 md:p-12 flex flex-col gap-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50/50 to-white relative z-10">
              
              {/* User Prompt */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 border border-slate-200 shadow-sm">
                  <span className="text-slate-600 font-bold text-sm">US</span>
                </div>
                <div className="bg-white rounded-3xl rounded-tl-sm px-6 py-5 text-slate-800 border border-slate-200 shadow-sm max-w-xl text-lg font-medium">
                  "{demo.userPrompt}"
                </div>
              </div>
              
              {/* Pipeline Steps */}
              <div className="pl-14 space-y-8">
                
                {/* SQL Output */}
                <div className="p-4 md:p-6 bg-slate-900 rounded-2xl border border-slate-800 font-mono text-xs md:text-sm text-blue-300 overflow-x-auto shadow-xl max-w-3xl">
                  <div className="flex gap-4 mb-3 border-b border-slate-700 pb-3">
                    <div className="text-slate-500 font-bold">SQL_GENERATED</div>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-300">
                    {demo.generatedSql}
                  </div>
                </div>

                {/* Insight Response */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-6 md:p-8 bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100 rounded-2xl shadow-sm">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-widest">
                      <Zap className="w-4 h-4 fill-blue-600" /> Insight Extraction
                    </div>
                    <div className="text-slate-800 text-lg leading-relaxed font-medium">
                      {demo.aiInsight}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center px-8 py-6 bg-white rounded-2xl border border-slate-200 shadow-sm min-w-[160px]">
                    <div className="text-3xl font-extrabold text-blue-600 tracking-tight">{demo.chartMetric}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.1em] mt-2">Confidence</div>
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

const Personas = ({ personas }: { personas: NormalizedPage['personas'] }) => {
  if (personas.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise.">
          Engineered for Roles
        </SectionHeading>
        <div className="grid md:grid-cols-3 gap-8">
          {personas.map((persona, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-3xl p-8 hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all duration-300 group flex flex-col h-full">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
                <Users className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 mb-4 tracking-tight">{persona.role}</h3>
              <p className="text-slate-600 text-lg font-medium leading-relaxed mb-8 flex-grow">
                {persona.description}
              </p>
              <div className="space-y-4 pt-6 border-t border-slate-100">
                {persona.capabilities.map((cap, j) => (
                  <div key={j} className="flex items-start gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
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
    <section className="py-24 bg-white border-y border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine.">
          The Competitive Edge
        </SectionHeading>
        
        <div className="grid gap-12">
          {matrix.map((item, i) => (
            <div key={i} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200 shrink-0">
                  <Zap className="w-5 h-5 text-blue-600 fill-blue-600" />
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">{item.category}</h3>
              </div>

              {/* Body */}
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Legacy */}
                <div className="p-8 md:p-10 flex flex-col justify-start group">
                  <div className="flex items-center gap-2 mb-4">
                    <XCircle className="w-5 h-5 text-slate-400" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Legacy Approach</span>
                  </div>
                  <p className="text-slate-600 text-lg font-medium leading-relaxed">{item.legacy}</p>
                </div>

                {/* Arcli */}
                <div className="p-8 md:p-10 flex flex-col justify-start bg-blue-50/20 group">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-blue-600">Arcli Advantage</span>
                  </div>
                  <p className="text-slate-900 text-lg font-bold leading-relaxed">{item.arcliAdvantage}</p>
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
    <section className="py-24 bg-slate-50 border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Arcli eliminates manual intervention from your data lifecycle, moving compute directly to the storage layer.">
          Infrastructure Transformation
        </SectionHeading>
        <div className="grid md:grid-cols-2 gap-8">
          {/* Legacy */}
          <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-200 relative overflow-hidden group hover:shadow-lg transition-shadow">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                 <XCircle className="w-6 h-6 text-slate-400" />
               </div>
               <h3 className="text-2xl font-extrabold text-slate-900">Structural Bottleneck</h3>
             </div>
             <div className="space-y-4 relative z-10">
               {workflow.legacyBottleneck.map((str, i) => (
                 <div key={i} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 text-lg font-medium leading-relaxed">
                   {str}
                 </div>
               ))}
             </div>
          </div>

          {/* Arcli */}
          <div className="bg-slate-900 rounded-3xl p-8 md:p-10 border border-slate-800 relative overflow-hidden group shadow-xl">
             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
             <div className="flex items-center gap-4 mb-8 relative z-10">
               <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] shrink-0">
                 <Zap className="w-6 h-6 text-white fill-white" />
               </div>
               <h3 className="text-2xl font-extrabold text-white">Autonomous Execution</h3>
             </div>
             <div className="space-y-4 relative z-10">
               {workflow.arcliAutomation.map((str, i) => (
                 <div key={i} className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700 text-blue-50 text-lg font-medium leading-relaxed backdrop-blur-sm">
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
    <section className="py-24 bg-white border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Real-world orchestration patterns deployed by our top enterprise partners.">
          Strategic Deployment
        </SectionHeading>
        
        <div className="grid md:grid-cols-2 gap-8">
          {useCases.map((item, i) => {
            const isAdvanced = item.complexity?.toLowerCase().includes('advanced') || item.complexity?.toLowerCase().includes('strategic');
            const badgeColor = isAdvanced 
              ? 'bg-purple-100 text-purple-700 border-purple-200' 
              : 'bg-blue-100 text-blue-700 border-blue-200';
            
            return (
              <div key={i} className="bg-white rounded-3xl border border-slate-200 p-8 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                    <ShieldCheck className="w-7 h-7 text-slate-700" />
                  </div>
                  {item.complexity && (
                    <span className={`text-xs uppercase font-extrabold tracking-widest px-3 py-1 rounded-full border ${badgeColor}`}>
                      {item.complexity}
                    </span>
                  )}
                </div>
                
                <h4 className="font-extrabold text-2xl text-slate-900 mb-4">{item.title}</h4>
                <p className="text-slate-600 text-lg font-medium leading-relaxed mb-8 flex-grow">{item.description}</p>
                
                {item.businessQuestion && (
                  <div className="bg-slate-900 rounded-2xl p-6 mt-auto">
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" /> Natural Language
                    </div>
                    <p className="text-white text-lg font-medium italic leading-relaxed">
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
    <section className="py-24 bg-slate-50 border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic.">
          Implementation Pipeline
        </SectionHeading>
        
        <div className="relative pl-6 md:pl-0">
          <div className="absolute left-[38px] md:left-1/2 md:-ml-px top-0 bottom-0 w-px bg-slate-200"></div>
          
          <div className="space-y-12">
            {steps.map((step, i) => (
              <div key={i} className={`relative flex flex-col md:flex-row items-start md:items-center justify-between gap-8 md:gap-12 ${i % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                <div className="hidden md:block w-1/2"></div>
                
                <div className="absolute left-[-24px] md:left-1/2 md:-ml-6 w-12 h-12 rounded-full bg-white border-4 border-slate-100 flex items-center justify-center text-lg font-extrabold text-slate-400 z-10 shadow-sm">
                  {i + 1}
                </div>
                
                <div className={`w-full md:w-1/2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:border-blue-200 transition-colors ${i % 2 === 0 ? 'md:text-left' : 'md:text-right'}`}>
                  <h4 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h4>
                  <p className="text-slate-600 text-lg leading-relaxed font-medium">{step.description}</p>
                  
                  {step.outcome && (
                    <div className={`mt-6 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-sm font-bold`}>
                      <CheckCircle2 className="w-4 h-4" /> {step.outcome}
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
    <section className="py-24 bg-white border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="The technological foundation behind the unified engine.">
          Core Capabilities
        </SectionHeading>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-3xl p-8 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
                <Layers className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              {feature.description && (
                <p className="text-slate-600 leading-relaxed font-medium">
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
    <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-900 to-slate-950"></div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Cpu className="w-6 h-6 text-blue-400" />
              <span className="text-sm font-extrabold uppercase tracking-widest text-blue-400">System Specification</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Enterprise Architecture</h2>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {Object.entries(architecture).map(([key, value]) => (
            <div key={key} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-8 rounded-3xl hover:border-blue-500/50 transition-colors">
              <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                {key.replace(/([A-Z])/g, ' $1')}
              </h4>
              <p className="text-xl font-bold text-white leading-relaxed">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-10 border-t border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-6">
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Globe className="w-5 h-5 text-blue-500" /> Multi-Region
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Lock className="w-5 h-5 text-blue-500" /> SOC2 Type II
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Workflow className="w-5 h-5 text-blue-500" /> API First
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <BarChart3 className="w-5 h-5 text-blue-500" /> Low Latency
           </div>
        </div>
      </div>
    </section>
  );
};

const RelatedLinks = ({ slugs, heroCta }: { slugs: string[], heroCta: NormalizedPage['hero']['cta'] }) => {
  if (slugs.length === 0) return null;
  return (
    <section className="py-24 bg-slate-900 relative overflow-hidden border-t border-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-950"></div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">Explore Deep Dives</h2>
          <p className="text-xl text-blue-100/80 font-medium max-w-2xl mx-auto">Discover specific architectural setups and orchestration patterns.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {slugs.map((relatedSlug) => {
            const rawRelated = getPageCached(relatedSlug) as any;
            if (!rawRelated) return null;
            
            const relatedTitle = rawRelated.type === 'template' 
              ? rawRelated.hero?.h1 
              : (rawRelated.h1 || rawRelated.heroTitle || rawRelated.title || relatedSlug);
            
            return (
              <Link 
                key={relatedSlug}
                href={`/${relatedSlug}`}
                className="bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl border border-slate-700 hover:bg-slate-800 hover:border-blue-500/50 transition-all group flex flex-col justify-between h-full"
              >
                <h3 className="text-lg font-bold text-white mb-4 group-hover:text-blue-400 transition-colors">
                  {relatedTitle}
                </h3>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-sm font-bold text-slate-400">Read Article</span>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
        
        <div className="flex justify-center">
          <Link 
            href={heroCta.primary.href} 
            className="px-10 py-5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] text-lg flex items-center gap-2"
          >
            {heroCta.primary.text} <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

// 100% Server-side CSS-driven Accordion for optimal performance & SEO
const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  if (faqs.length === 0) return null;
  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Everything you need to know about implementing Arcli's engine into your stack.">
          Expert Insights
        </SectionHeading>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="group bg-white border border-slate-200 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-bold text-slate-900 text-lg hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset">
                {faq.q}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-slate-100 p-2 rounded-full text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="p-6 pt-0 text-slate-600 text-lg leading-relaxed font-medium bg-white border-t border-slate-100">
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

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-blue-100 selection:text-blue-900">
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