"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  ShieldCheck,
  Zap,
  XCircle,
  Users,
  CheckCircle2,
  Code2,
  Sparkles,
  Terminal, 
  Database, 
  LayoutTemplate, 
  BarChart3, 
  LineChart,
  Calculator,
  ListFilter,
  TrendingDown,
  LayoutDashboard,
  Presentation,
  Share2
} from 'lucide-react';

import { NormalizedPage } from '@/lib/seo/parser';
import { useVisible } from "@/hooks/useVisible";

// ----------------------------------------------------------------------
// SHARED UI ACCENTS & ANIMATION WRAPPERS
// ----------------------------------------------------------------------

export const SectionHeading = ({ children, id, subtitle, monoLabel, align = 'center' }: { children: React.ReactNode; id?: string; subtitle?: string; monoLabel?: string; align?: 'center' | 'left' }) => {
  const [ref, vis] = useVisible(0.1);

  return (
    <div 
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`max-w-4xl mb-20 scroll-mt-28 relative z-10 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} ${align === 'center' ? 'text-center mx-auto' : 'text-left'}`} 
      id={id}
    >
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
      {subtitle && (
        <p className="text-slate-500 font-medium" style={{ fontSize: 18, lineHeight: 1.6, maxWidth: align === 'center' ? 640 : '100%', margin: align === 'center' ? '0 auto' : '0' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// PHASE 3: TOP-OF-FUNNEL BLOCKS (DATA-DRIVEN & HIGH CONVERSION)
// ----------------------------------------------------------------------

export const Hero = ({ data }: { data: NormalizedPage }) => {
  const [ref, vis] = useVisible(0);
  const currentCta = data.hero.cta.primary;

  return (
    <section className="relative pt-40 pb-32 overflow-hidden bg-slate-50/30">
      <div className="absolute inset-0 z-0 opacity-[0.03] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#2563eb]/5 rounded-[100%] blur-[120px] pointer-events-none z-0" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <div 
          ref={ref as React.RefObject<HTMLDivElement>} 
          className={`text-center max-w-4xl mx-auto transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-1.5 rounded-full mb-8">
            <Code2 size={14} className="text-[#2563eb]" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#0B1221]">
              {(data.type || 'SYSTEM').toUpperCase()}_ARCHITECTURE
            </span>
          </div>
          
          <h1 className="text-[clamp(44px,6vw,72px)] font-extrabold tracking-tight text-[#0B1221] mb-6 leading-[1.05]">
            {data.seo.h1}
          </h1>
          
          <p className="text-slate-500 text-[20px] font-medium leading-[1.6] max-w-3xl mx-auto mb-12">
            {data.hero.subtitle}
          </p>

          <div className="flex flex-col items-center justify-center gap-4">
            <Link 
              href={currentCta.href} 
              className="group relative flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-8 py-4 rounded-xl text-lg font-bold shadow-[0_8px_24px_-6px_rgba(37,99,235,0.4)] hover:shadow-[0_12px_30px_-6px_rgba(37,99,235,0.6)] transition-all duration-300 transform hover:-translate-y-0.5"
            >
              {currentCta.text}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 rounded-xl ring-2 ring-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </Link>
            
            <div className="flex items-center gap-4 mt-3 text-sm font-bold text-slate-500 font-mono tracking-tight">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#2563eb]" />14-DAY TRIAL</div>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <div className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#2563eb]" />NO CREDIT CARD</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const Demo = ({ demo }: { demo: NormalizedPage['demo'] }) => {
  const [ref, vis] = useVisible(0.2);

  if (!demo) return null;
  return (
    <section id="interactive-demo" className="pb-32 bg-slate-50 relative pt-10 px-4 sm:px-6 lg:px-8 border-t border-slate-200/50">
      <div className="container mx-auto max-w-5xl relative z-10">
        <div 
          ref={ref as React.RefObject<HTMLDivElement>} 
          className={`rounded-2xl bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(2,6,23,0.1)] overflow-hidden flex flex-col relative z-10 group transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
        >
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

          <div className="p-8 md:p-12 flex flex-col gap-8 bg-white relative">
            <div className="absolute right-0 top-0 w-64 h-64 bg-[#2563eb]/5 blur-[80px] rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-200 text-[#0B1221] font-bold text-sm shadow-sm">US</div>
              <div className="bg-slate-50 border border-slate-200 shadow-sm rounded-2xl rounded-tl-sm px-6 py-5 text-[#0B1221] max-w-xl text-lg font-bold">"{demo.userPrompt}"</div>
            </div>
            
            <div className="pl-14 space-y-6 relative z-10">
              <div className={`p-6 bg-[#0B1221] rounded-xl font-mono text-sm text-slate-300 overflow-x-auto shadow-inner max-w-3xl border border-[#1e293b] transition-all duration-700 delay-300 ${vis ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
                <div className="flex gap-4 mb-3 border-b border-white/10 pb-3">
                  <div className="text-[#60a5fa] font-bold uppercase tracking-[0.2em] text-[10px]">/// SQL_GENERATED</div>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-slate-300">{demo.generatedSql}</div>
              </div>

              <div className={`flex flex-col sm:flex-row items-stretch gap-6 transition-all duration-700 delay-500 ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex-1 p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-[#2563eb] font-mono font-bold text-[10px] uppercase tracking-[0.2em]">
                    <Zap className="w-3 h-3" /> sys.insight_extraction
                  </div>
                  <div className="text-[#0B1221] text-lg leading-relaxed font-bold">{demo.aiInsight}</div>
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

// ----------------------------------------------------------------------
// ELEGANT PERSONA MOCKUPS (ZIG-ZAG LAYOUT)
// ----------------------------------------------------------------------

const DashboardMockup = () => (
  <div className="relative bg-white p-6 md:p-8 rounded-2xl border border-slate-200 z-10 shadow-[0_20px_40px_rgba(0,0,0,0.05)] w-full max-w-lg mx-auto">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h4 className="text-[16px] font-bold text-[#0B1221] mb-1">Omni-Graph Overview</h4>
        <div className="flex gap-2 items-center">
          <span className="text-[11px] font-bold text-[#635BFF] bg-[#635BFF]/10 px-2 py-0.5 rounded-full">STRIPE</span>
          <span className="text-[11px] font-bold text-[#96BF48] bg-[#96BF48]/10 px-2 py-0.5 rounded-full">SHOPIFY</span>
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-[12px] font-bold text-slate-500">
        Last 30 Days
      </div>
    </div>
    <div className="flex gap-3 mb-6">
      <div className="flex-1 border border-slate-200 rounded-xl p-4">
        <div className="text-[11px] text-slate-400 font-bold tracking-widest mb-2">REVENUE</div>
        <div className="text-[20px] font-extrabold text-[#0B1221]">$124.5k</div>
        <div className="text-[12px] text-[#10B981] font-bold mt-1">+14.2%</div>
      </div>
      <div className="flex-1 border border-slate-200 rounded-xl p-4">
        <div className="text-[11px] text-slate-400 font-bold tracking-widest mb-2">AVG ORDER</div>
        <div className="text-[20px] font-extrabold text-[#0B1221]">$84.20</div>
        <div className="text-[12px] text-[#10B981] font-bold mt-1">+2.1%</div>
      </div>
    </div>
    <div className="h-[140px] flex items-end gap-1.5 relative">
      <div className="absolute top-0 left-0 right-0 border-t border-dashed border-slate-200 z-0" />
      <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-200 z-0" />
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 z-0" />
      {[30, 45, 25, 60, 75, 50, 85, 100, 70, 90].map((h, i) => (
        <div key={i} className="flex-1 flex flex-col justify-end gap-1 h-full z-10 relative pb-[1px]">
          <div className="w-full bg-[#3b9ae8]/30 rounded-sm transition-all hover:bg-[#3b9ae8]/50" style={{ height: `${h * 0.4}%` }} />
          <div className="w-full bg-[#2563eb] rounded-sm transition-all hover:bg-blue-700" style={{ height: `${h * 0.6}%` }} />
          {i === 7 && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#0B1221] text-white px-2.5 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap shadow-xl">
              $14,200
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-45 w-2 h-2 bg-[#0B1221]" />
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const ReportMockup = () => (
  <div className="relative bg-[#0B1221] rounded-2xl p-6 md:p-8 z-10 text-white shadow-[0_30px_60px_rgba(10,22,40,0.2)] w-full max-w-lg mx-auto">
    <div className="flex justify-between items-start mb-8">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-[#3b9ae8]/20 flex items-center justify-center text-[#60a5fa]">
            <Sparkles size={14} />
          </div>
          <span className="text-[12px] font-bold text-[#60a5fa] tracking-widest">EXECUTIVE BRIEF</span>
        </div>
        <h3 className="text-[22px] font-bold m-0 leading-tight text-white">Q3 Pipeline Synthesis</h3>
      </div>
      <div className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer hover:bg-white/20 transition-colors">
        <Share2 size={14} className="text-slate-300" />
        <span className="text-[12px] font-bold text-slate-300">Share</span>
      </div>
    </div>
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 mb-5">
      <div className="flex items-center gap-4 mb-5 pb-5 border-b border-white/10">
        <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 flex items-center justify-center text-[#10B981]">
          <LineChart size={20} />
        </div>
        <div>
          <div className="text-[14px] font-bold text-slate-200">Enterprise LTV Growth</div>
          <div className="text-[13px] text-[#10B981] font-bold">+24% vs Prev Quarter</div>
        </div>
      </div>
      <div className="text-[14px] text-slate-400 leading-[1.7]">
        <p className="mb-3">
          Based on the current Omni-Graph state, Enterprise LTV has driven the majority of Q3 growth, directly correlated with the introduction of the new Zendesk integration.
        </p>
        <p>
          <span className="text-slate-200 font-bold">Recommendation:</span> Increase allocation to the Enterprise outbound campaign, as CAC payback period has shortened to 4.2 months.
        </p>
      </div>
    </div>
    <div className="inline-flex items-center gap-2 bg-[#0B1120] border border-white/10 px-3 py-2 rounded-lg text-[11px] text-slate-500 font-mono">
      STATE HASH: <span className="text-[#60a5fa] font-bold">#A7F92B</span>
      <span className="mx-1 text-white/20">|</span>
      FROZEN: <span className="text-slate-400">OCT 24, 14:00 UTC</span>
    </div>
  </div>
);

const TerminalMockup = () => (
  <div className="relative bg-[#0B1221] rounded-2xl p-6 md:p-8 z-10 text-slate-300 shadow-[0_30px_60px_rgba(10,22,40,0.2)] overflow-hidden w-full max-w-lg mx-auto">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-[#10B981]"></div>
    <div className="flex items-center gap-2 mb-6">
      <div className="w-3 h-3 rounded-full bg-slate-600"></div>
      <div className="w-3 h-3 rounded-full bg-slate-600"></div>
      <div className="w-3 h-3 rounded-full bg-slate-600"></div>
      <span className="ml-2 text-[11px] font-mono text-slate-500">sys.engine --local</span>
    </div>
    <div className="font-mono text-[13px] leading-[1.8]">
       <div className="flex items-start gap-3 mb-3">
          <span className="text-[#10B981] mt-0.5">➜</span>
          <span className="text-white break-all">SELECT COUNT(*) FROM read_parquet('s3://lake/events_*.parquet');</span>
       </div>
       <div className="text-slate-500 mb-4 pl-6 border-l border-slate-700/50 py-1">
         Executing embedded DuckDB over 14M rows...<br/>
         Pushing projection filters down to storage...
       </div>
       <div className="flex items-center gap-3 mb-2">
          <span className="text-[#60a5fa]">✔</span>
          <span className="text-slate-300">Result: 14,239,012 processed</span>
       </div>
       <div className="text-[#10B981] font-bold pl-6">
         Execution time: 210ms
       </div>
    </div>
  </div>
);

export const Personas = ({ personas }: { personas: NormalizedPage['personas'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!personas || personas.length === 0) return null;

  // We rotate through these elegant frames depending on the index
  const elegantFrames = [
    { 
      Icon: Terminal, 
      Mockup: TerminalMockup 
    },
    { 
      Icon: LayoutDashboard, 
      Mockup: DashboardMockup 
    },
    { 
      Icon: Presentation, 
      Mockup: ReportMockup 
    },
  ];

  return (
    <section id="roles" className="py-32 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading 
          monoLabel="// ROLE_DEFINITIONS"
          subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise."
        >
          Engineered for Roles
        </SectionHeading>

        <div ref={ref as React.RefObject<HTMLDivElement>} className="flex flex-col gap-24 mt-12">
          {personas.map((persona, i) => {
            const frame = elegantFrames[i % elegantFrames.length];
            const Icon = frame.Icon;
            const Mockup = frame.Mockup;
            const isEven = i % 2 === 0;
            
            // Ensure clean role names (stripping "For ")
            const cleanRole = persona.role.replace(/^For\s+/i, '');

            return (
              <div 
                key={i} 
                className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`} 
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {/* Text Content */}
                <div className={`flex flex-col ${isEven ? 'lg:order-1' : 'lg:order-2'}`}>
                  <div className="inline-flex items-center gap-2 text-[#2563eb] font-bold text-[13px] mb-4 uppercase tracking-widest">
                    <Icon size={16} /> THE {cleanRole}
                  </div>
                  <h2 className="text-3xl md:text-4xl text-[#0B1221] font-extrabold leading-[1.15] mb-6 tracking-tight">
                    {persona.role}
                  </h2>
                  <p className="text-slate-500 text-[18px] leading-[1.6] mb-8 font-medium">
                    {persona.description}
                  </p>
                  <ul className="flex flex-col gap-4 list-none m-0 p-0">
                    {persona.capabilities.map((cap, j) => (
                      <li key={j} className="flex items-start gap-3 text-[16px] font-semibold text-[#0B1221] leading-snug">
                        <CheckCircle2 size={20} className="text-[#2563eb] shrink-0 mt-0.5" /> 
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Abstract Mockup Visual */}
                <div className={`relative p-8 md:p-12 rounded-[2rem] bg-white border border-slate-200 shadow-sm flex justify-center items-center ${isEven ? 'lg:order-2' : 'lg:order-1'}`}>
                   <Mockup />
                   
                   {/* Offset background accent depending on alignment */}
                   <div 
                     className="absolute bg-[#2563eb] rounded-[2rem] z-0 opacity-[0.03] pointer-events-none" 
                     style={{ 
                       top: isEven ? -16 : 16, 
                       bottom: isEven ? 16 : -16, 
                       left: isEven ? 16 : -16, 
                       right: isEven ? -16 : 16 
                     }} 
                   />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const Matrix = ({ matrix }: { matrix: NormalizedPage['matrix'] }) => {
  const [ref, vis] = useVisible(0.1);
  const [viewMode, setViewMode] = useState<'features' | 'tco'>('features');
  const [dataEngineers, setDataEngineers] = useState<number>(3);

  if (!matrix || matrix.length === 0) return null;

  // Phase 3: Interactive TCO Calculator Logic
  const legacyTco = useMemo(() => dataEngineers * 140000, [dataEngineers]); 
  const arcliTco = useMemo(() => 15000 + (dataEngineers * 20000), [dataEngineers]); // Base platform + slight admin overhead

  return (
    <section id="tco-calculator" className="py-24 bg-white relative border-y border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <SectionHeading 
          monoLabel="// COMPETITIVE_ANALYSIS"
          subtitle="Why the world's most aggressive teams are migrating from legacy stacks to Arcli's unified engine."
        >
          The Competitive Edge
        </SectionHeading>

        {/* View Mode Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-slate-50 border border-slate-200 p-1.5 rounded-full inline-flex shadow-sm">
            <button 
              onClick={() => setViewMode('features')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all ${viewMode === 'features' ? 'bg-[#0B1221] text-white shadow-md' : 'text-slate-500 hover:text-[#0B1221]'}`}
            >
              <ListFilter size={16} /> Feature Matrix
            </button>
            <button 
              onClick={() => setViewMode('tco')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all ${viewMode === 'tco' ? 'bg-[#2563eb] text-white shadow-md' : 'text-slate-500 hover:text-[#0B1221]'}`}
            >
              <Calculator size={16} /> Interactive TCO
            </button>
          </div>
        </div>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className={`transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          {viewMode === 'features' ? (
            <div className="grid gap-6">
              {matrix.map((item, i) => (
                <div 
                  key={i} 
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#2563eb]/30 transition-all duration-700 overflow-hidden group"
                >
                  <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center border border-slate-200 shrink-0 group-hover:border-[#2563eb]/30 transition-colors">
                      <Zap className="w-4 h-4 text-[#2563eb]" />
                    </div>
                    <h3 className="text-lg font-bold text-[#0B1221] tracking-tight">{item.category}</h3>
                  </div>

                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    <div className="p-8 flex flex-col justify-start bg-white">
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
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-2xl font-black text-[#0B1221] mb-2 tracking-tight">Calculate Your Savings</h3>
                    <p className="text-slate-500 font-medium">See how consolidating your stack reduces engineering overhead.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <label className="font-bold text-[#0B1221]">Current Data Engineering Team</label>
                      <span className="font-mono text-[#2563eb] font-bold text-xl">{dataEngineers} Engineers</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" max="20" 
                      value={dataEngineers} 
                      onChange={(e) => setDataEngineers(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
                    />
                    <p className="text-xs text-slate-400 font-mono">*Assuming $140k fully loaded cost per engineer maintaining legacy ETL.</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[40px]"></div>
                  
                  <div className="space-y-6 relative z-10">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                      <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">Legacy Stack TCO</span>
                      <span className="text-2xl font-mono font-bold text-[#0B1221]">${legacyTco.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-blue-200 pb-4">
                      <span className="text-[#2563eb] font-bold uppercase tracking-wider text-xs">Arcli TCO</span>
                      <span className="text-2xl font-mono font-bold text-[#2563eb]">${arcliTco.toLocaleString()}</span>
                    </div>
                    
                    <div className="pt-4">
                      <div className="bg-[#0B1221] rounded-xl p-6 text-white flex items-center justify-between shadow-lg">
                        <div>
                          <span className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Annual Savings</span>
                          <span className="text-4xl font-black text-[#60a5fa] tracking-tighter">
                            ${(legacyTco - arcliTco).toLocaleString()}
                          </span>
                        </div>
                        <TrendingDown size={40} className="text-[#60a5fa] opacity-50" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export const WorkflowSection = ({ workflow }: { workflow: NormalizedPage['workflow'] }) => {
  const [ref, vis] = useVisible(0.2);
  const [activeStep, setActiveStep] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const hasWorkflow = workflow && workflow.legacyBottleneck?.length > 0 && workflow.arcliAutomation?.length > 0;
  
  const dynamicSteps = useMemo(() => {
    if (!hasWorkflow) return [];
    return workflow.arcliAutomation.map((text, i) => ({
      id: `phase-${i}`,
      label: `PHASE_0${i+1} // ${i===0 ? 'INGEST' : i===1 ? 'PROCESS' : 'SERVE'}`,
      title: text.split('.')[0] || `Phase ${i+1}`,
      description: text,
      legacyWarning: workflow.legacyBottleneck[i],
      icon: i === 0 ? Terminal : i === 1 ? LayoutTemplate : Sparkles,
    }));
  }, [hasWorkflow, workflow]);

  useEffect(() => {
    if (!hasWorkflow || isHovered) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % dynamicSteps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isHovered, dynamicSteps.length, hasWorkflow]);

  if (!hasWorkflow || dynamicSteps.length === 0) return null;

  return (
    <section className="py-24 bg-slate-50 relative border-y border-slate-200/50 overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-[0.03] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <SectionHeading 
          monoLabel="// EXECUTION_PIPELINE"
          subtitle="Our engine automates legacy bottlenecks so you can focus on high-level decision logic."
        >
          Implementation Pipeline
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>} 
          className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start pt-8 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEFT PANE: The Logic Log */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {dynamicSteps.map((step, index) => {
              const isActive = activeStep === index;
              const StepIcon = step.icon;
              
              return (
                <div
                  key={step.id}
                  onMouseEnter={() => { setActiveStep(index); setIsHovered(true); }}
                  onMouseLeave={() => setIsHovered(false)}
                  className={`relative p-6 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isActive 
                      ? "bg-white border-[#2563eb]/50 shadow-[0_20px_40px_-15px_rgba(37,99,235,0.15)] ring-1 ring-[#2563eb]/20" 
                      : "bg-white/50 border-slate-200 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <StepIcon size={14} />
                    </div>
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-[#2563eb]' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${isActive ? 'text-[#0B1221]' : 'text-slate-600'}`}>{step.title}</h3>
                  <p className={`text-sm leading-relaxed ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>{step.description}</p>
                </div>
              );
            })}
          </div>

          {/* RIGHT PANE: System State Execution */}
          <div className="lg:col-span-7 bg-[#0B1221] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative h-[500px]">
            <div className="h-10 bg-[#1e293b] border-b border-slate-700/50 flex items-center px-4 gap-4 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
              </div>
              <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></div>
                sys.execution_pipeline
              </div>
            </div>

            <div className="p-6 flex-1 flex flex-col relative overflow-hidden">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#2563eb]/20 blur-[60px] rounded-full pointer-events-none"></div>

               {dynamicSteps.map((step, index) => (
                  <div 
                    key={step.id} 
                    className={`absolute inset-0 p-8 flex flex-col transition-all duration-700 ${activeStep === index ? 'opacity-100 z-10 translate-y-0' : 'opacity-0 z-0 translate-y-8 pointer-events-none'}`}
                  >
                    <div className="mb-8 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                       <div className="text-amber-500 font-mono text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                         <XCircle size={12} /> Legacy Bottleneck Detected
                       </div>
                       <p className="text-slate-300 text-sm font-mono leading-relaxed">
                         {step.legacyWarning}
                       </p>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-4">
                        <Terminal className="text-[#60a5fa]" size={18} />
                        <span className="text-[#60a5fa] font-mono text-sm font-bold">Arcli Overrides...</span>
                      </div>
                      <div className="p-5 bg-blue-950/30 border border-blue-900/50 rounded-xl font-mono text-[13px] text-slate-200 leading-loose">
                         <span className="text-[#10B981]">➜</span> Applying zero-ETL protocols.<br/>
                         <span className="text-[#10B981]">➜</span> Bypassing rigid schemas.<br/>
                         <span className="text-[#10B981]">➜</span> Extracting semantic insights in ms.<br/>
                         <div className="mt-4 pt-4 border-t border-blue-900/50 text-[#60a5fa] font-bold">
                           [SUCCESS] {step.title.toUpperCase()} OPTIMIZED.
                         </div>
                      </div>
                    </div>
                  </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};