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

// Refined: Neutralize icon overuse by switching the default to text-slate-600 or text-[#020617]
export const iconRegistry: Record<IconKey, React.ReactNode> = {
  database:   <Database   className="w-6 h-6 text-[#020617]" />,
  layers:     <Layers     className="w-6 h-6 text-[#020617]" />,
  shieldCheck:<ShieldCheck className="w-6 h-6 text-[#020617]" />,
  zap:        <Zap        className="w-6 h-6 text-[#020617]" />,
  terminal:   <Terminal   className="w-6 h-6 text-[#020617]" />,
  users:      <Users      className="w-6 h-6 text-[#020617]" />,
  activity:   <Activity   className="w-6 h-6 text-[#020617]" />,
  cpu:        <Cpu        className="w-6 h-6 text-[#020617]" />,
  globe:      <Globe      className="w-6 h-6 text-[#020617]" />,
  lock:       <Lock       className="w-6 h-6 text-[#020617]" />,
  workflow:   <Workflow   className="w-6 h-6 text-[#020617]" />,
  barChart3:  <BarChart3  className="w-6 h-6 text-[#020617]" />,
  cloud:      <Cloud      className="w-6 h-6 text-[#020617]" />,
  pieChart:   <PieChart   className="w-6 h-6 text-[#020617]" />,
  lineChart:  <LineChart  className="w-6 h-6 text-[#020617]" />,
  trendingUp: <TrendingUp className="w-6 h-6 text-[#020617]" />,
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

// ----------------------------------------------------------------------
// SCROLL ANIMATION INJECTOR
// ----------------------------------------------------------------------
const ScrollRevealScript = () => (
  <script dangerouslySetInnerHTML={{ __html: `
    if (typeof window !== 'undefined') {
      const initReveal = () => {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('opacity-100', 'translate-y-0');
              entry.target.classList.remove('opacity-0', 'translate-y-8');
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1 });
        
        document.querySelectorAll('.reveal-on-scroll:not(.observed)').forEach(el => {
          el.classList.add('observed');
          observer.observe(el);
        });
      };
      
      setTimeout(initReveal, 100);
      
      const pushState = history.pushState;
      history.pushState = function() {
        pushState.apply(this, arguments);
        setTimeout(initReveal, 500);
      };
    }
  `}} />
);

// ----------------------------------------------------------------------
// PAGE SECTIONS
// ----------------------------------------------------------------------

const SectionHeading = ({ children, id, subtitle }: { children: React.ReactNode; id?: string; subtitle?: string }) => (
  <div className="text-center max-w-4xl mx-auto mb-20 scroll-mt-28 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000 ease-out" id={id}>
    <h2 
      className="pfd text-[#020617] tracking-[-0.035em] font-extrabold" 
      style={{ fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 1.05, marginBottom: '24px' }}
    >
      {children}
    </h2>
    {subtitle && <p className="text-slate-500" style={{ fontSize: 20, lineHeight: 1.6, maxWidth: 620, margin: '0 auto' }}>{subtitle}</p>}
  </div>
);


const Hero = ({ data }: { data: NormalizedPage }) => (
  <section className="relative pt-40 pb-32 overflow-hidden dot-grid bg-[#f8fafc]">
    <div style={{ position: "absolute", top: "10%", left: "5%", width: 400, height: 400, background: "#dbeafe", borderRadius: "50%", filter: "blur(100px)", opacity: 0.6, zIndex: 0 }} />
    <div style={{ position: "absolute", top: "30%", right: "-5%", width: 500, height: 500, background: "#eff6ff", borderRadius: "50%", filter: "blur(120px)", opacity: 0.8, zIndex: 0 }} />
    
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
      <div className="text-center max-w-5xl mx-auto reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000 ease-out">
        
        {/* Elegant Eyebrow - Glassy & Refined */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(255, 255, 255, 0.6)", backdropFilter: "blur(12px)",
          border: `1px solid rgba(15,23,42,0.08)`,
          padding: "6px 16px", borderRadius: 30, marginBottom: 32,
          boxShadow: "0 4px 12px rgba(2,6,23,0.03)"
        }}>
          <Sparkles size={14} className="text-[#020617] animate-pulse" />
          <span className="text-[#020617]" style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {data.type} Definition
          </span>
        </div>
        
        {/* Restrained Luxury Gradient Typography */}
        <h1 className="pfd text-[clamp(48px,6vw,80px)] font-extrabold tracking-[-0.04em] text-[#020617] max-w-[900px] mx-auto mb-6 leading-[1.05]">
          <span className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] bg-clip-text text-transparent">
            {data.seo.h1}
          </span>
        </h1>
        
        <p className="text-slate-500 text-[20px] leading-[1.6] max-w-[680px] mx-auto mb-12">
          {data.hero.subtitle}
        </p>
        
        <div className="flex flex-col items-center justify-center pt-2 gap-4">
          <Link 
            href={data.hero.cta.primary.href} 
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white ring-1 ring-blue-400/20 shadow-[0_10px_25px_rgba(37,99,235,0.35)] hover:shadow-[0_15px_35px_rgba(37,99,235,0.45)] transition-all duration-300"
            style={{ padding: "18px 44px", fontSize: 16, fontWeight: 700, borderRadius: 8 }}
          >
            {data.hero.cta.primary.text}
            <ArrowRight size={18} />
          </Link>
          
          <div className="flex items-center gap-4 mt-4 text-sm font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#020617]" />
              14-day free trial
            </div>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#020617]" /> 
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
    <section id="interactive-demo" className="pb-32 bg-gradient-to-b from-[#f8fafc] to-white px-4 sm:px-6 lg:px-8 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000 ease-out delay-200">
      <div className="container mx-auto max-w-5xl relative">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-sky-200/30 rounded-full blur-3xl -z-10"></div>
        <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl -z-10"></div>
        
        {/* Subtle outer glass layer */}
        <div className="rounded-2xl border border-slate-200/40 bg-white/40 p-2 md:p-4 shadow-[0_10px_30px_rgba(2,6,23,0.04)] relative overflow-hidden backdrop-blur-xl">
          <div className="rounded-2xl overflow-hidden border border-slate-200/50 bg-white flex flex-col h-full shadow-sm">
            
            {/* Header */}
            <div className="h-14 border-b border-slate-100 flex items-center px-6 gap-4 bg-white/60 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div>
              </div>
              <div className="mx-auto flex items-center justify-center bg-white px-3 py-1.5 rounded-md border border-slate-200/50 shadow-[0_4px_12px_rgba(2,6,23,0.03)] text-xs font-bold text-slate-600 gap-2 min-w-[200px]">
                <span className="w-2 h-2 rounded-full bg-[#020617] animate-pulse shadow-[0_0_8px_rgba(2,6,23,0.3)]"></span>
                Live Engine Execution
              </div>
              <div className="w-10"></div>
            </div>

            {/* Body */}
            <div className="p-10 md:p-12 flex flex-col gap-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50/50 to-white relative z-10">
              
              {/* User Prompt */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-md flex items-center justify-center flex-shrink-0 border border-slate-200/40 shadow-sm">
                  <span className="text-[#020617] font-bold text-sm">US</span>
                </div>
                <div className="bg-transparent border border-slate-200/40 rounded-2xl rounded-tl-sm px-6 py-5 text-[#020617] shadow-[0_4px_20px_rgba(2,6,23,0.02)] max-w-xl text-lg font-bold">
                  "{demo.userPrompt}"
                </div>
              </div>
              
              {/* Pipeline Steps */}
              <div className="pl-14 space-y-8">
                
                {/* SQL Output */}
                <div className="p-6 bg-[#020617] rounded-2xl border border-white/10 font-mono text-sm text-slate-300 overflow-x-auto shadow-[0_10px_30px_rgba(2,6,23,0.15)] max-w-3xl">
                  <div className="flex gap-4 mb-3 border-b border-slate-800 pb-3">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-xs">SQL_GENERATED</div>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-300">
                    {demo.generatedSql}
                  </div>
                </div>

                {/* Insight Response */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-8 bg-transparent border border-slate-200/40 rounded-2xl shadow-[0_4px_20px_rgba(2,6,23,0.02)]">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-[#020617] font-bold text-xs uppercase tracking-widest">
                      <Zap className="w-4 h-4 fill-[#020617]" /> Insight Extraction
                    </div>
                    <div className="text-[#020617] text-lg leading-relaxed font-bold">
                      {demo.aiInsight}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center px-8 py-6 bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/40 shadow-sm min-w-[160px]">
                    <div className="text-3xl font-extrabold text-[#020617] tracking-tight">{demo.chartMetric}</div>
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
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise.">
          Engineered for Roles
        </SectionHeading>
        <div className="grid md:grid-cols-3 gap-8">
          {personas.map((persona, i) => (
            <div key={i} className="bg-transparent border border-slate-200/40 hover:bg-white/40 hover:backdrop-blur-md rounded-2xl p-10 md:p-12 transition-all duration-500 group flex flex-col h-full reveal-on-scroll opacity-0 translate-y-8" style={{ transitionDelay: `${i * 100}ms` }}>
              {/* Invisible Card Layering */}
              <div className="w-14 h-14 bg-white/60 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-slate-200/40 group-hover:bg-slate-50 transition-all duration-300">
                <Users className="w-7 h-7 text-[#020617]" />
              </div>
              <h3 className="text-[24px] font-bold text-[#020617] mb-4 tracking-[-0.02em]">{persona.role}</h3>
              <p className="text-slate-500 text-lg font-medium leading-relaxed mb-8 flex-grow">
                {persona.description}
              </p>
              <div className="space-y-4 pt-6 border-t border-slate-100/50">
                {persona.capabilities.map((cap, j) => (
                  <div key={j} className="flex items-start gap-3 text-[#020617] font-medium">
                    <CheckCircle2 className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
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
    <section className="py-32 bg-[#f8fafc]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine.">
          The Competitive Edge
        </SectionHeading>
        
        <div className="grid gap-8">
          {matrix.map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200/40 shadow-[0_4px_20px_rgba(2,6,23,0.02)] hover:shadow-[0_20px_50px_rgba(2,6,23,0.06)] overflow-hidden transition-all duration-500 reveal-on-scroll opacity-0 translate-y-8">
              {/* Header */}
              <div className="px-10 py-6 border-b border-slate-100 bg-white/40 backdrop-blur-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-white/60 rounded-xl flex items-center justify-center border border-slate-200/40 shrink-0">
                  <Zap className="w-5 h-5 text-[#020617] fill-[#020617]" />
                </div>
                <h3 className="text-[24px] font-bold text-[#020617] tracking-[-0.02em]">{item.category}</h3>
              </div>

              {/* Body */}
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100/50">
                {/* Legacy */}
                <div className="p-10 flex flex-col justify-start group">
                  <div className="flex items-center gap-2 mb-4">
                    <XCircle className="w-5 h-5 text-slate-400" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Legacy Approach</span>
                  </div>
                  <p className="text-slate-500 text-lg font-medium leading-relaxed">{item.legacy}</p>
                </div>

                {/* Arcli */}
                <div className="p-10 flex flex-col justify-start bg-transparent group">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-[#020617]" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-[#020617]">Arcli Advantage</span>
                  </div>
                  <p className="text-[#020617] text-lg font-bold leading-relaxed">{item.arcliAdvantage}</p>
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
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading subtitle="Arcli eliminates manual intervention from your data lifecycle, moving compute directly to the storage layer.">
          Infrastructure Transformation
        </SectionHeading>
        <div className="grid md:grid-cols-2 gap-8 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000">
          {/* Legacy - Invisible Glass Layer */}
          <div className="bg-transparent rounded-2xl p-10 md:p-12 border border-slate-200/40 relative overflow-hidden transition-shadow hover:bg-slate-50/50">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center border border-slate-200/40 shrink-0">
                 <XCircle className="w-6 h-6 text-slate-400" />
               </div>
               <h3 className="text-[24px] font-bold text-[#020617] tracking-[-0.02em]">Structural Bottleneck</h3>
             </div>
             <div className="space-y-4 relative z-10">
               {workflow.legacyBottleneck.map((str, i) => (
                 <div key={i} className="p-5 bg-white/40 rounded-xl border border-slate-100 text-slate-500 text-lg font-medium leading-relaxed">
                   {str}
                 </div>
               ))}
             </div>
          </div>

          {/* Arcli - Dark Premium Layer */}
          <div className="bg-gradient-to-b from-[#020617] via-[#0b1220] to-[#020617] rounded-2xl p-10 md:p-12 border border-white/10 shadow-[0_10px_30px_rgba(2,6,23,0.06)] hover:shadow-[0_20px_50px_rgba(2,6,23,0.10)] relative overflow-hidden group transition-all">
             <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 blur-[120px] pointer-events-none"></div>
             <div className="flex items-center gap-4 mb-8 relative z-10">
               <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                 <Zap className="w-6 h-6 text-white fill-white" />
               </div>
               <h3 className="text-[24px] font-bold text-white tracking-[-0.02em]">Autonomous Execution</h3>
             </div>
             <div className="space-y-4 relative z-10">
               {workflow.arcliAutomation.map((str, i) => (
                 <div key={i} className="p-5 bg-white/5 rounded-xl border border-white/10 text-slate-300 text-lg font-medium leading-relaxed backdrop-blur-sm">
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
    <section className="py-32 bg-[#f8fafc]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="Real-world orchestration patterns deployed by our top enterprise partners.">
          Strategic Deployment
        </SectionHeading>
        
        <div className="grid md:grid-cols-2 gap-8">
          {useCases.map((item, i) => {
            const isAdvanced = item.complexity?.toLowerCase().includes('advanced') || item.complexity?.toLowerCase().includes('strategic');
            const badgeColor = isAdvanced 
              ? 'bg-transparent text-[#020617] border-slate-300' 
              : 'bg-transparent text-slate-500 border-slate-200';
            
            return (
              <div key={i} className="bg-transparent rounded-2xl border border-slate-200/40 hover:bg-white/40 hover:backdrop-blur-md p-10 md:p-12 transition-all duration-500 flex flex-col h-full reveal-on-scroll opacity-0 translate-y-8" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-white/60 backdrop-blur-md rounded-2xl flex items-center justify-center border border-slate-200/40">
                    <ShieldCheck className="w-7 h-7 text-[#020617]" />
                  </div>
                  {item.complexity && (
                    <span className={`text-xs uppercase font-extrabold tracking-widest px-3 py-1 rounded-full border ${badgeColor}`}>
                      {item.complexity}
                    </span>
                  )}
                </div>
                
                <h4 className="font-bold text-[24px] tracking-[-0.02em] text-[#020617] mb-4">{item.title}</h4>
                <p className="text-slate-500 text-lg font-medium leading-relaxed mb-8 flex-grow">{item.description}</p>
                
                {item.businessQuestion && (
                  <div className="bg-[#020617] rounded-xl p-6 mt-auto">
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" /> Natural Language
                    </div>
                    <p className="text-slate-300 text-lg font-medium italic leading-relaxed">
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
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic.">
          Implementation Pipeline
        </SectionHeading>
        
        <div className="relative pl-12 md:pl-0">
          <div className="absolute left-[38px] md:left-1/2 md:-ml-px top-0 bottom-0 w-px bg-slate-200/50"></div>
          
          <div className="space-y-16 md:space-y-20">
            {steps.map((step, i) => (
              <div 
                key={i} 
                className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-8 md:gap-12 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-700" 
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <div className="hidden md:block w-1/2"></div>
                
                <div className="absolute left-[-20px] md:left-1/2 md:-ml-2.5 w-5 h-5 rounded-full bg-white border border-slate-300 z-10 flex items-center justify-center">
                   <div className="w-2 h-2 bg-[#020617] rounded-full"></div>
                </div>
                
                {/* Invisible Card Layering */}
                <div className="w-full md:w-1/2 bg-transparent border border-slate-200/40 rounded-2xl p-10 hover:bg-white/40 hover:backdrop-blur-md transition-all duration-300 relative overflow-hidden">
                  
                  <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    {step.title}
                  </div>
                  
                  <h4 className="text-[20px] font-bold text-[#020617] leading-snug mb-3 tracking-[-0.01em]">
                    {step.description}
                  </h4>
                  
                  {step.outcome && (
                    <div className="mt-5 text-sm text-slate-500 font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#020617]" />
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
    <section className="py-32 bg-[#f8fafc]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading subtitle="The technological foundation behind the unified engine.">
          Core Capabilities
        </SectionHeading>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-transparent border border-slate-200/40 rounded-2xl p-10 md:p-12 hover:bg-white/60 hover:backdrop-blur-md transition-all duration-500 group reveal-on-scroll opacity-0 translate-y-8" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="w-12 h-12 bg-white/60 backdrop-blur-md rounded-xl flex items-center justify-center mb-6 border border-slate-200/40 group-hover:scale-110 transition-all duration-300">
                <Layers className="w-6 h-6 text-[#020617]" />
              </div>
              <h3 className="text-[22px] tracking-[-0.02em] font-bold text-[#020617] mb-3">{feature.title}</h3>
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
    <section className="py-32 bg-gradient-to-b from-[#020617] via-[#0b1220] to-[#020617] text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 blur-[120px] pointer-events-none"></div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Cpu className="w-6 h-6 text-slate-400" />
              <span className="text-sm font-extrabold uppercase tracking-widest text-slate-400">System Specification</span>
            </div>
            <h2 className="pfd text-[clamp(36px,5vw,56px)] font-extrabold tracking-[-0.04em] leading-[1.05]">Enterprise Architecture</h2>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {Object.entries(architecture).map(([key, value], i) => (
            <div key={key} className="bg-white/5 backdrop-blur-sm border border-white/10 p-10 md:p-12 rounded-2xl hover:bg-white/10 transition-colors reveal-on-scroll opacity-0 translate-y-8" style={{ transitionDelay: `${i * 100}ms` }}>
              <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                {key.replace(/([A-Z])/g, ' $1')}
              </h4>
              <p className="text-[22px] font-bold text-white leading-relaxed tracking-[-0.01em]">
                {value as string}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-10 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000 delay-300">
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Globe className="w-5 h-5 text-slate-500" /> Multi-Region
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Lock className="w-5 h-5 text-slate-500" /> SOC2 Type II
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <Workflow className="w-5 h-5 text-slate-500" /> API First
           </div>
           <div className="flex items-center gap-3 text-slate-300 font-medium text-lg">
             <BarChart3 className="w-5 h-5 text-slate-500" /> Low Latency
           </div>
        </div>
      </div>
    </section>
  );
};

const RelatedLinks = ({ slugs, heroCta }: { slugs: string[], heroCta: NormalizedPage['hero']['cta'] }) => {
  if (slugs.length === 0) return null;
  return (
    <section className="py-32 bg-gradient-to-b from-[#020617] via-[#0b1220] to-[#020617] relative overflow-hidden border-t border-white/10">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-20 reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000">
          <h2 className="pfd text-[clamp(36px,5vw,56px)] font-extrabold text-white mb-4 tracking-[-0.04em] leading-[1.05]">Explore Deep Dives</h2>
          <p className="text-[20px] text-slate-400 font-medium max-w-2xl mx-auto">Discover specific architectural setups and orchestration patterns.</p>
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
                className="bg-white/5 backdrop-blur-md p-10 md:p-12 rounded-2xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group flex flex-col justify-between h-full reveal-on-scroll opacity-0 translate-y-8"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <h3 className="text-xl font-bold text-white mb-4 transition-colors tracking-[-0.01em]">
                  {relatedTitle}
                </h3>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-sm font-bold text-slate-400">Read Article</span>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
        
        <div className="flex justify-center reveal-on-scroll opacity-0 translate-y-8 transition-all duration-1000 delay-200">
          <Link 
            href={heroCta.primary.href} 
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white ring-1 ring-blue-400/20 shadow-[0_10px_25px_rgba(37,99,235,0.35)] hover:shadow-[0_15px_35px_rgba(37,99,235,0.45)] transition-all duration-300"
            style={{ padding: "18px 44px", fontSize: 16, fontWeight: 700, borderRadius: 8 }}
          >
            {heroCta.primary.text} <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

const FAQs = ({ faqs }: { faqs: NormalizedPage['faqs'] }) => {
  if (faqs.length === 0) return null;
  return (
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <SectionHeading subtitle="Everything you need to know about implementing Arcli's engine into your stack.">
          Expert Insights
        </SectionHeading>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="group bg-transparent border border-slate-200/40 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden reveal-on-scroll opacity-0 translate-y-8 transition-all duration-500" style={{ transitionDelay: `${i * 100}ms` }}>
              <summary className="flex items-center justify-between cursor-pointer p-8 md:p-10 font-bold text-[#020617] text-[20px] hover:bg-white/40 hover:backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#020617] focus-visible:ring-inset tracking-[-0.01em]">
                {faq.q}
                <span className="ml-4 flex-shrink-0 transition duration-300 group-open:-rotate-180 bg-white/60 backdrop-blur-md border border-slate-200/40 p-2 rounded-full text-slate-500 group-hover:bg-[#020617] group-hover:text-white">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="p-8 md:p-10 pt-0 text-slate-500 text-lg leading-relaxed font-medium bg-transparent border-t border-slate-100/50">
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
      
      {/* Scroll Reveal Injector (Runs natively on client) */}
      <ScrollRevealScript />

      <main className="min-h-screen bg-white text-slate-600 font-sans selection:bg-[#020617] selection:text-white overflow-x-hidden">
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