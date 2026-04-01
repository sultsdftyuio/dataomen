// lib/seo/parser.ts
import React, { cache } from 'react';
import { getPage } from '@/lib/seo/index';
import { 
  Database,
  Layers,
  ShieldCheck,
  Zap,
  Terminal,
  Users,
  Activity,
  Cpu,
  Globe,
  Lock,
  Workflow,
  BarChart3,
  Cloud,
  PieChart,
  LineChart,
  TrendingUp,
} from 'lucide-react';

export type CTA = { text: string; href: string };
export type CoreCapability = { title: string; description: string };

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

export function resolveIcon(raw: string | React.ReactNode | undefined): React.ReactNode {
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