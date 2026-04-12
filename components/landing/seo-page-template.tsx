// components/landing/seo-page-template.tsx
import React from 'react';
import Link from 'next/link';
import { 
  Database, 
  CloudSnow, 
  Server, 
  AlertTriangle, 
  ArrowRight, 
  FileText,
  CheckCircle2,
  TrendingUp,
  FileJson,
  TableProperties,
  DatabaseBackup,
  Zap,
  DatabaseZap
} from 'lucide-react';

// 1. Types
import { SEOPageData, Block, BlockType } from '@/lib/seo/database-integrations-1';

// 2. Real UI Component Imports (Matched exactly to your repo exports)
import { Hero, Demo, Personas, Matrix } from '@/components/landing/seo-blocks-1';
import { Steps, Features, Architecture, RelatedLinks, FAQs as FAQBlock } from '@/components/landing/seo-blocks-2';
import { ContrarianBanner, SecurityGuardrails, StrategicQuery } from '@/components/landing/seo-blocks-3';
import { ZeroDataProof, SemanticTranslation, TrustAndCompliance } from '@/components/landing/seo-blocks-4';
import { ParadigmTeardown, TelemetryTrace } from '@/components/landing/seo-blocks-5';
import { MetricGovernance, EmbeddableSDK } from '@/components/landing/seo-blocks-6';
import { DataGravityCost, DynamicSchemaMapping } from '@/components/landing/seo-blocks-7';
import { GranularAccessControl, ConcurrencyProof } from '@/components/landing/seo-blocks-8';
import { TenantIsolationArchitecture, DeterministicGuardrails } from '@/components/landing/seo-blocks-9';

// ----------------------------------------------------------------------
// EXTENDED BLOCK UNION (Unlocks all advanced UI blocks)
// ----------------------------------------------------------------------
export type ExtendedBlockType = 
  | BlockType
  | 'ZeroDataProof'
  | 'SemanticTranslation'
  | 'TrustAndCompliance'
  | 'ParadigmTeardown'
  | 'TelemetryTrace'
  | 'MetricGovernance'
  | 'EmbeddableSDK'
  | 'DataGravityCost'
  | 'DynamicSchemaMapping'
  | 'GranularAccessControl'
  | 'ConcurrencyProof'
  | 'TenantIsolationArchitecture'
  | 'DeterministicGuardrails'
  | 'Personas'
  | 'Features'
  | 'Demo'
  | 'Architecture'
  | 'RelatedLinks'
  | 'FAQs';

// ----------------------------------------------------------------------
// ADAPTERS: Translating pure JSON payload to exact component prop shapes
// ----------------------------------------------------------------------

const InformationGainAdapter = ({ data }: { data: any }) => (
  <div className="w-full max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8">
    <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
      <div>
        {data.headline && <h2 className="text-[clamp(32px,4vw,40px)] font-extrabold text-[#0B1221] tracking-tight mb-8 leading-[1.1]">{data.headline}</h2>}
        {data.bullets && (
          <ul className="space-y-5 mb-8">
            {data.bullets.map((b: string, i: number) => (
              <li key={i} className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                </div>
                <span className="text-slate-600 font-medium leading-relaxed text-lg">{b}</span>
              </li>
            ))}
          </ul>
        )}
        {data.workflowBefore && data.workflowAfter && (
          <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
             <h3 className="text-lg font-bold mb-4">Workflow Transformation</h3>
             <div className="flex flex-col gap-4">
               <div><span className="text-red-500 font-bold text-sm uppercase tracking-wide">Before</span><p className="text-slate-600 text-sm mt-1">{data.workflowBefore[0]}</p></div>
               <div><span className="text-green-600 font-bold text-sm uppercase tracking-wide">After</span><p className="text-slate-600 text-sm mt-1">{data.workflowAfter[0]}</p></div>
             </div>
          </div>
        )}
      </div>
      <div className="grid gap-4">
        {data.metrics?.map((m: any, i: number) => (
          <div key={i} className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-5 hover:shadow-md hover:border-[#2563eb]/30 transition-all duration-300">
            <div className="w-14 h-14 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-[#2563eb]" />
            </div>
            <div>
              <div className="flex items-end gap-3 mb-1">
                <span className="text-2xl font-black text-[#0B1221] tracking-tight">{m.value}</span>
                <span className="text-[11px] font-mono font-bold text-[#2563eb] uppercase tracking-widest mb-1.5">{m.label}</span>
              </div>
              <p className="text-sm text-slate-500 font-medium">{m.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const CTAGroupAdapter = ({ data }: { data: any }) => (
  <div className="w-full py-24 bg-white border-t border-slate-100">
    <div className="max-w-4xl mx-auto text-center px-4">
      <h2 className="text-3xl font-extrabold text-[#0B1221] tracking-tight mb-8">Ready to unify your data engine?</h2>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href={data.primaryHref || '/register'} className="w-full sm:w-auto bg-[#2563eb] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all duration-300 shadow-[0_8px_24px_-6px_rgba(37,99,235,0.4)] hover:shadow-[0_12px_30px_-6px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
          {data.primaryLabel || data.text} <ArrowRight className="w-5 h-5" />
        </Link>
        {data.secondaryLabel && (
          <Link href={data.secondaryHref || '#'} className="w-full sm:w-auto bg-white text-slate-700 border border-slate-200 shadow-sm px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" /> {data.secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  </div>
);

// ----------------------------------------------------------------------
// 3. MEGA BLOCK REGISTRY (The Ultimate Switchboard)
// ----------------------------------------------------------------------
const BlockRegistry: Record<ExtendedBlockType, React.FC<{ data: any; intent?: string }>> = {
  // Legacy / Fundamental Blocks
// Legacy / Fundamental Blocks
  HeroBlock: ({ data }) => (
    <Hero 
      data={{ 
        type: data.type || 'integration', 
        hero: data, 
        seo: { 
          title: data.title || 'Arcli Analytics', 
          description: data.description || '', 
          h1: data.title || 'Arcli Analytics',
          datePublished: new Date().toISOString(),
          dateModified: new Date().toISOString()
        } 
      } as any} // 'as any' safely bridges any deeper missing NormalizedPage properties
    />
  ),
  ContrarianBanner: ({ data }) => <ContrarianBanner statement={data.statement} subtext={data.subtext} />,
  InformationGain: ({ data }) => <InformationGainAdapter data={data} />,
  ArchitectureDiagram: ({ data }) => <Steps steps={data.steps?.map((s: any) => ({ title: s.title, description: s.description || s.outcome })) || []} />,
  ComparisonMatrix: ({ data }) => <Matrix matrix={data.rows} />,
  AnalyticsDashboard: ({ data }) => (
    <div className="w-full flex flex-col">
      {data.scenarios?.map((s: any, i: number) => (
        <StrategicQuery key={i} scenario={{
          title: s.title,
          description: s.businessOutcome,
          dialect: 'SQL Compilation',
          sql: s.sqlSnippet || `-- Arcli Semantic Compilation Engine\n-- Extracted Intent: ${s.businessQuestion}`,
          businessOutcome: s.businessQuestion
        }} />
      ))}
    </div>
  ),
  SecurityGuardrails: ({ data }) => <SecurityGuardrails items={data.principles || data.items} />,
  MetricsChart: ({ data }) => (
    <MetricGovernance data={{
      title: data.title || "Compute & Financial Telemetry",
      subtitle: "Live operational dashboard",
      executiveOutcome: "Automated partition pruning active.",
      codeSnippet: { filename: "query_planner.sql", language: "sql", code: data.codeSnippet?.code || "-- Loading..." },
      governedOutputs: data.governedOutputs || []
    }} />
  ),
  DataRelationshipsGraph: ({ data }) => <Steps steps={data.steps?.map((s: any) => ({ title: s.title, description: s.description || s.outcome })) || data.traces?.map((t: any) => ({ title: t.phase, description: t.log })) || []} />,
  CTAGroup: ({ data }) => <CTAGroupAdapter data={data} />,

  // 🔥 ADVANCED ENTERPRISE BLOCKS (seo-blocks-4 through seo-blocks-9 integrations) 🔥
  ZeroDataProof: ({ data }) => <ZeroDataProof data={data} />, 
  SemanticTranslation: ({ data }) => <SemanticTranslation data={data} />,
  TrustAndCompliance: ({ data }) => <TrustAndCompliance data={data} />,
  ParadigmTeardown: ({ data }) => <ParadigmTeardown data={data} />,
  TelemetryTrace: ({ data }) => <TelemetryTrace data={data} />,
  MetricGovernance: ({ data }) => <MetricGovernance data={data} />,
  EmbeddableSDK: ({ data }) => <EmbeddableSDK data={data} />,
  DataGravityCost: ({ data }) => <DataGravityCost data={data} />,
  DynamicSchemaMapping: ({ data }) => <DynamicSchemaMapping data={data} />,
  GranularAccessControl: ({ data }) => <GranularAccessControl data={data} />,
  ConcurrencyProof: ({ data }) => <ConcurrencyProof data={data} />,
  TenantIsolationArchitecture: ({ data }) => <TenantIsolationArchitecture data={data} />,
  DeterministicGuardrails: ({ data }) => <DeterministicGuardrails data={data} />,
  
  // Marketing & Explainer Blocks (Matched to real exports)
  Personas: ({ data }) => <Personas personas={data.personas || data} />,
  Features: ({ data }) => <Features features={data.features || data} />,
  Demo: ({ data }) => <Demo demo={data.demo || data} />,
  Architecture: ({ data }) => <Architecture architecture={data.architecture || data} />,
  RelatedLinks: ({ data }) => <RelatedLinks slugs={data.slugs} links={data.links} heroCta={data.heroCta} />,
  FAQs: ({ data }) => <FAQBlock faqs={data.faqs || data} />
};

// ----------------------------------------------------------------------
// 4. ICON REGISTRY (Expanded for your new schemas)
// ----------------------------------------------------------------------
const IconRegistry: Record<string, React.ElementType> = {
  Database,
  CloudSnow,
  Server,
  FileJson,
  TableProperties,
  DatabaseBackup,
  Zap,
  DatabaseZap,
  TrendingUp,
  FileText
};

// ----------------------------------------------------------------------
// 5. INDIVIDUAL BLOCK RENDERER
// ----------------------------------------------------------------------
const BlockRenderer = ({ block, index }: { block: any; index: number }) => {
  const Component = BlockRegistry[block.type as ExtendedBlockType];

  if (!Component) {
    console.warn(`[SEO ENGINE] Unknown block type skipped: ${block.type}`);
    return null; 
  }

  return (
    <div 
      key={`${block.type}-${index}`} 
      data-block-purpose={block.purpose} 
      data-intent={block.intentServed}
      className="w-full flex flex-col items-center"
    >
      <Component data={block.data} intent={block.intentServed} />
    </div>
  );
};

// ----------------------------------------------------------------------
// 6. MASTER PAGE ENGINE
// ----------------------------------------------------------------------
export const SEOPageTemplate: React.FC<{ pageData: SEOPageData }> = ({ pageData }) => {
  
  if (!pageData || !pageData.blocks || !pageData.blocks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-4">
        <AlertTriangle className="text-red-500 w-12 h-12 mb-4" />
        <h1 className="text-xl font-bold">Error: Invalid SEO Payload</h1>
        <p className="text-slate-500 mt-2">The compiler failed to generate valid block architecture.</p>
      </div>
    );
  }

  const IconComponent = IconRegistry[pageData.icon as string] || Database;

  return (
    <main className="flex flex-col min-h-screen bg-white text-slate-900 overflow-x-hidden">
      
      {/* PAGE HEADER */}
      <header className="w-full pt-32 pb-24 px-4 sm:px-6 relative bg-slate-50/50">
        <div className="absolute inset-0 z-0 opacity-[0.03] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#2563eb]/5 rounded-full blur-[100px] pointer-events-none z-0" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
              <IconComponent className="w-10 h-10 text-[#2563eb]" />
            </div>
          </div>
          <h1 className="text-[clamp(40px,6vw,64px)] font-black tracking-tight mb-6 text-[#0B1221] leading-[1.05]">
            {pageData.h1}
          </h1>
          <p className="text-lg md:text-xl text-slate-500 font-medium max-w-3xl mx-auto leading-relaxed">
            {pageData.subtitle}
          </p>
        </div>
      </header>

      {/* DYNAMIC BLOCK PIPELINE */}
      <article className="flex flex-col items-center w-full">
        {pageData.blocks.map((block, index) => (
          <BlockRenderer key={index} block={block} index={index} />
        ))}
      </article>

    </main>
  );
};