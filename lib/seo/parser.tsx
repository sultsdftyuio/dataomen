// lib/seo/parser.tsx
import React, { cache } from 'react';
import { getNormalizedPage as getPage, getAllSlugs } from '@/lib/seo/registry';
import { 
  Database, Layers, ShieldCheck, Zap, Terminal, Users, Activity, 
  Cpu, Globe, Lock, Workflow, BarChart3, Cloud, PieChart, LineChart, TrendingUp
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

// --- UNIVERSAL DATA INTERFACE ---
export interface NormalizedPage {
  slug: string;
  type: string;
  tags: string[]; // Drives automated clustering
  seo: { title: string; description: string; h1: string; datePublished: string; dateModified: string };
  hero: { subtitle: string; icon: React.ReactNode; cta: { primary: CTA; secondary?: CTA } };
  demo?: { userPrompt: string; generatedSql: string; aiInsight: string; chartMetric: string };
  personas: Array<{ role: string; description: string; capabilities: string[] }>;
  matrix: Array<{ category: string; legacy: string; arcliAdvantage: string }>;
  workflow?: { legacyBottleneck: string[]; arcliAutomation: string[] };
  steps: Array<{ title: string; description: string; outcome?: string }>;
  useCases: Array<{ title: string; description: string; businessQuestion?: string; complexity?: string; sqlSnippet?: string }>;
  architecture?: Record<string, string>;
  faqs: Array<{ q: string; a: string }>;
  relatedSlugs: string[]; // Dynamically computed via Tag Clustering
  features: CoreCapability[];
  businessValueMetrics: Array<{ metric: string; value: string; context: string }>;
  trustAndSecurity: Array<{ principle: string; description: string }>;
}

// -------------------------------------------------------------------------
// COMPATIBILITY NORMALIZERS (Bridges Legacy, v9, and v10 SEO Architectures)
// -------------------------------------------------------------------------

const normalizeSEO = (p: any): NormalizedPage['seo'] => {
  const published = p.datePublished || '2024-01-01T08:00:00Z';
  return {
    title: p.title || p.seo?.title || p.metadata?.title || 'Arcli Platform',
    description: p.description || p.seo?.description || p.metadata?.description || '',
    h1: p.type === 'template' ? p.hero?.h1 : (p.h1 || p.seo?.h1 || p.heroTitle || p.title || 'Arcli'),
    datePublished: published,
    dateModified: p.dateModified || published,
  };
};

const normalizeHero = (p: any): NormalizedPage['hero'] => {
  const rawIcon = p.type === 'template' ? (p.hero?.icon ?? p.icon) : p.icon;
  return {
    subtitle: p.type === 'template' ? p.hero?.subtitle : (p.subtitle || p.heroDescription || p.description || ''),
    icon: resolveIcon(rawIcon),
    cta: p.ctaHierarchy || p.hero?.primaryCTA ? { primary: p.hero?.primaryCTA || { text: 'Start Free Trial', href: '/register' } } : { primary: { text: 'Start Free Trial', href: '/register' } },
  };
};

const normalizeDemo = (p: any): NormalizedPage['demo'] | undefined => {
  const rawDemo = p.demo || p.demoPipeline;
  
  // Best-fit heuristic: Fallback to the first scenario containing a sqlSnippet
  const scenarios = p.analyticalScenarios || p.useCases || [];
  const safeScenarios = Array.isArray(scenarios) ? scenarios : [scenarios];
  const firstSqlScenario = safeScenarios.find((s: any) => s?.sqlSnippet);

  if (!rawDemo && !firstSqlScenario) return undefined;

  return {
    userPrompt: rawDemo?.userPrompt || firstSqlScenario?.businessQuestion || 'Show me the revenue analysis.',
    generatedSql: rawDemo?.generatedSql || firstSqlScenario?.sqlSnippet || 'SELECT * FROM metrics;',
    aiInsight: rawDemo?.aiInsight || firstSqlScenario?.businessOutcome || firstSqlScenario?.description || 'Data successfully processed.',
    chartMetric: rawDemo?.chartMetric || 'Revenue'
  };
};

const normalizePersonas = (p: any): NormalizedPage['personas'] => {
  if (Array.isArray(p.targetPersonas)) return p.targetPersonas; // Legacy
  
  // SEO v10: Dynamically generate rich Persona cards from the lightweight 'idealFor' array
  if (Array.isArray(p.idealFor)) {
    return p.idealFor.map((role: string) => ({
      role,
      description: `Tailored orchestration workflows designed specifically for ${role}s to maximize data leverage.`,
      capabilities: ['Instant natural language querying', 'Automated anomaly detection', 'Live interactive dashboards']
    }));
  }
  return [];
};

const normalizeMatrix = (p: any): NormalizedPage['matrix'] => {
  // Legacy comparison
  if (p.comparison?.competitorFlaws) {
    return p.comparison.competitorFlaws.map((flaw: string, i: number) => ({
      category: p.comparison.competitor || 'Legacy',
      legacy: flaw,
      arcliAdvantage: p.comparison.arcliWins?.[i] || 'Automated AI processing'
    }));
  }
  // SEO v10 evaluationMatrix & competitiveAdvantage
  const rawMatrix = p.evaluationMatrix || p.competitiveAdvantage || [];
  return (Array.isArray(rawMatrix) ? rawMatrix : []).map((m: any) => ({
    category: m?.category || m?.legacyTool || 'Advantage',
    legacy: m?.competitorApproach || m?.limitation || 'Manual processes',
    arcliAdvantage: m?.arcliAdvantage || (typeof m === 'string' ? m : '')
  }));
};

const normalizeWorkflow = (p: any): NormalizedPage['workflow'] | undefined => {
  if (p.workflowUpgrade) return p.workflowUpgrade; // Legacy
  
  // UNBLOCK TELEMETRY: If new onboarding or uiBlocks exist, feed the UI a dummy object so it renders the Telemetry Pipeline
  if (p.onboardingExperience || p.steps || p.uiBlocks) {
    return { legacyBottleneck: [], arcliAutomation: [] };
  }
  return undefined;
};

const normalizeSteps = (p: any): NormalizedPage['steps'] => {
  const raw = p.steps || p.onboardingExperience || p.orchestrationWorkflow || [];
  return (Array.isArray(raw) ? raw : []).map((s: any) => ({
    title: s?.title || s?.name || s?.phase || 'Phase',
    description: typeof s === 'string' ? s : (s?.text || s?.action || s?.description || (s?.userAction ? `${s.userAction}` : '')),
    outcome: s?.outcome
  }));
};

const normalizeUseCases = (p: any): NormalizedPage['useCases'] => {
  const raw = p.useCases || p.analyticalScenarios || [];
  return (Array.isArray(raw) ? raw : []).map((u: any) => ({
    title: u?.title || u?.vertical || (u?.complexity ? `${u.complexity} Scenario` : 'Application'),
    description: typeof u === 'string' ? u : (u?.description || u?.businessOutcome || u?.application || ''),
    businessQuestion: u?.businessQuestion,
    complexity: u?.complexity,
    sqlSnippet: u?.sqlSnippet
  }));
};

const normalizeTags = (p: any): string[] => {
  if (Array.isArray(p.tags)) return p.tags;
  const derived = new Set<string>();
  if (p.type) derived.add(p.type);
  if (p.seo?.keywords) {
    const kws = Array.isArray(p.seo.keywords) ? p.seo.keywords : p.seo.keywords.split(',');
    kws.forEach((k: string) => derived.add(k.trim().toLowerCase()));
  }
  if (p.metaKeywords && Array.isArray(p.metaKeywords)) {
    p.metaKeywords.forEach((k: string) => derived.add(k.trim().toLowerCase()));
  }
  return Array.from(derived);
};

const normalizeFeatures = (p: any): CoreCapability[] => {
  const raw = p.features?.items || p.features || p.capabilities || p.performanceMetrics;
  if (!raw) return [];
  const safe = Array.isArray(raw) ? raw : [raw];
  const mapped = safe.map((f: any) => {
    if (typeof f === 'string') return { title: f, description: '' };
    return {
      title: f?.title || f?.name || f?.principle || '',
      description: f?.description || f?.executiveExplanation || f?.howWeDeliver || ''
    };
  });
  return mapped;
};

const normalizeTrust = (p: any): NormalizedPage['trustAndSecurity'] => {
  const raw = p.trustAndSecurity || p.security || [];
  return (Array.isArray(raw) ? raw : [raw]).map((t: any) => ({
    principle: t?.principle || t?.title || 'Security Standard',
    description: t?.howWeDeliver || t?.description || t?.detail || ''
  })).filter(t => t.description);
};

const normalizeMetrics = (p: any): NormalizedPage['businessValueMetrics'] => {
  const raw = p.businessValueMetrics || p.roiMetrics || p.executiveSummary || [];
  return (Array.isArray(raw) ? raw : [raw]).map((m: any) => ({
    metric: m?.metric || m?.label || m?.title || 'KPI',
    value: m?.value || m?.stat || m?.competitorAverage || 'N/A',
    context: m?.context || m?.description || m?.financialValue || ''
  })).filter(m => m.value !== 'N/A');
};

const getPageCached = cache((slug: string) => getPage(slug));

// -------------------------------------------------------------------------
// THE DATA ORCHESTRATOR
// -------------------------------------------------------------------------

export const getNormalizedPage = cache((slug: string): NormalizedPage | null => {
  try {
    const rawPage = getPageCached(slug) as any;
    if (!rawPage || typeof rawPage !== 'object') return null;

    const tags = normalizeTags(rawPage);

    // Automated Clustering: Computes semantic relevance based on Tag Intersections.
    let clusteredSlugs: string[] = [];
    if (tags.length > 0) {
      const allSlugs = getAllSlugs();
      clusteredSlugs = allSlugs
        .filter(s => s !== slug)
        .map(s => {
          const pageData = getPageCached(s);
          const pageTags = pageData ? normalizeTags(pageData) : [];
          const overlap = tags.filter(t => pageTags.includes(t)).length;
          return { slug: s, overlap };
        })
        .filter(r => r.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 3)
        .map(r => r.slug);
    }

    // Fallback if tag clustering yields nothing
    if (clusteredSlugs.length === 0) {
      clusteredSlugs = Array.isArray(rawPage.relatedSlugs) ? rawPage.relatedSlugs : 
                      (Array.isArray(rawPage.relatedBlueprints) ? rawPage.relatedBlueprints : []);
    }
    
    return {
      slug,
      type: rawPage.type === 'template' ? 'template' : (rawPage.type || 'standard'),
      tags,
      seo: normalizeSEO(rawPage),
      hero: normalizeHero(rawPage),
      demo: normalizeDemo(rawPage),
      personas: normalizePersonas(rawPage),
      matrix: normalizeMatrix(rawPage),
      workflow: normalizeWorkflow(rawPage),
      steps: normalizeSteps(rawPage),
      useCases: normalizeUseCases(rawPage),
      architecture: rawPage.processingArchitecture || rawPage.technicalArchitecture || rawPage.technicalStack,
      faqs: Array.isArray(rawPage.faqs) ? rawPage.faqs : [],
      relatedSlugs: clusteredSlugs,
      features: normalizeFeatures(rawPage),
      businessValueMetrics: normalizeMetrics(rawPage),
      trustAndSecurity: normalizeTrust(rawPage)
    };
  } catch (err) {
    console.error(`[getNormalizedPage] Failed to normalize slug "${slug}":`, err);
    return null;
  }
});