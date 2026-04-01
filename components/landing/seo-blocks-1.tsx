"use client";

import React, { useState, useEffect } from 'react';
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
  LineChart
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
// TOP-OF-FUNNEL BLOCKS
// ----------------------------------------------------------------------

export const Hero = ({ data }: { data: NormalizedPage }) => {
  const [ref, vis] = useVisible(0);

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
              {data.type}_ARCHITECTURE
            </span>
          </div>
          
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

export const Personas = ({ personas }: { personas: NormalizedPage['personas'] }) => {
  const [ref, vis] = useVisible(0.1);

  if (personas.length === 0) return null;
  return (
    <section className="py-32 bg-white relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-[600px] bg-slate-50/80 rounded-full blur-[100px] -z-10" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading 
          monoLabel="// ROLE_DEFINITIONS"
          subtitle="Customized data orchestration paths for every stakeholder in the modern enterprise."
        >
          Engineered for Roles
        </SectionHeading>
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-3 gap-8 md:gap-6 pt-12 pb-16">
          {personas.map((persona, i) => (
            <div 
              key={i} 
              style={{ transitionDelay: `${i * 150}ms` }}
              className={`relative bg-white/70 backdrop-blur-xl border border-slate-200 p-8 pt-12 rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(11,18,33,0.08)] transition-all duration-700 hover:-translate-y-2 hover:shadow-[0_30px_60px_-20px_rgba(37,99,235,0.15)] group ${i === 1 ? 'md:mt-12' : i === 2 ? 'md:mt-24' : ''} flex flex-col transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
            >
              <div className="absolute -top-6 left-8 bg-white border border-slate-200 shadow-md px-5 py-2 rounded-xl flex items-center gap-3 transition-transform group-hover:scale-105">
                <Users className="w-5 h-5 text-[#2563eb]" />
                <h3 className="text-2xl font-black text-[#0B1221] tracking-tight">{persona.role}</h3>
              </div>

              <p className="text-slate-500 text-[17px] font-medium leading-relaxed mb-10 flex-grow relative z-10">
                {persona.description}
              </p>

              <div className="space-y-4 relative z-10">
                {persona.capabilities.map((cap, j) => (
                  <div key={j} className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-[0_10px_30px_-10px_rgba(11,18,33,0.08)] border border-slate-100 group-hover:border-blue-100 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-blue-50/50 flex items-center justify-center shrink-0 border border-blue-100/50">
                      <CheckCircle2 className="w-5 h-5 text-[#2563eb]" />
                    </div>
                    <span className="font-bold text-[#0B1221] text-[15px] leading-tight">{cap}</span>
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

export const Matrix = ({ matrix }: { matrix: NormalizedPage['matrix'] }) => {
  const [ref, vis] = useVisible(0.1);

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
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid gap-6">
          {matrix.map((item, i) => (
            <div 
              key={i} 
              style={{ transitionDelay: `${i * 100}ms` }}
              className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#2563eb]/30 transition-all duration-700 overflow-hidden group transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center border border-slate-200 shrink-0 group-hover:border-[#2563eb]/30 transition-colors">
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

// ----------------------------------------------------------------------
// EXECUTION PIPELINE (TELEMETRY VIEW)
// Replaces the original WorkflowSection
// ----------------------------------------------------------------------

const PIPELINE_STEPS = [
  {
    id: "describe",
    label: "PHASE_01 // DESCRIBE",
    title: "State your goal",
    description: 'Input "Track our new product launch metrics." The system automatically selects relevant tables.',
    icon: Terminal,
  },
  {
    id: "generate",
    label: "PHASE_02 // GENERATE",
    title: "AI renders the layout",
    description: "The engine bypasses SQL compilation entirely, rendering a multi-chart dashboard instantly.",
    icon: LayoutTemplate,
  },
  {
    id: "refine",
    label: "PHASE_03 // REFINE",
    title: "Instant iteration",
    description: "Ask to tweak a specific chart. The UI updates instantly to reflect your new filters or formatting.",
    icon: Sparkles,
  },
];

export const WorkflowSection = ({ workflow }: { workflow: NormalizedPage['workflow'] }) => {
  const [ref, vis] = useVisible(0.2);
  const [activeStep, setActiveStep] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isHovered]);

  if (!workflow) return null;
  return (
    <section className="py-24 bg-white relative border-y border-slate-200/50 overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-[0.03] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <SectionHeading 
          monoLabel="// EXECUTION_PIPELINE"
          subtitle="Our engine handles the complexity of data movement while you focus on high-level decision logic."
        >
          Implementation Pipeline
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>} 
          className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center pt-8 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEFT PANE: The Logic Log */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {PIPELINE_STEPS.map((step, index) => {
              const isActive = activeStep === index;
              const StepIcon = step.icon;
              
              return (
                <div
                  key={step.id}
                  onMouseEnter={() => { setActiveStep(index); setIsHovered(true); }}
                  onMouseLeave={() => setIsHovered(false)}
                  className={`relative p-6 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isActive 
                      ? "bg-white border-slate-200 shadow-[0_20px_40px_-15px_rgba(11,18,33,0.08)] scale-[1.02]" 
                      : "bg-transparent border-transparent hover:bg-slate-50 opacity-60 hover:opacity-100"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-[#2563eb] rounded-r-md" />
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl mt-1 shrink-0 ${isActive ? "bg-blue-50 text-[#2563eb] border border-blue-100" : "bg-slate-100 text-slate-400"}`}>
                      <StepIcon size={20} />
                    </div>
                    <div>
                      <div className={`font-mono text-[10px] font-bold tracking-[0.2em] mb-2 uppercase ${isActive ? "text-[#2563eb]" : "text-slate-400"}`}>
                        {step.label}
                      </div>
                      <h3 className={`text-xl font-bold mb-2 tracking-tight ${isActive ? "text-[#0B1221]" : "text-slate-600"}`}>
                        {step.title}
                      </h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* RIGHT PANE: The Live Sandbox */}
          <div className="lg:col-span-7 relative h-[480px] w-full bg-white rounded-3xl border border-slate-200 shadow-[0_30px_60px_-20px_rgba(11,18,33,0.12)] overflow-hidden flex flex-col">
            
            <div className="h-12 border-b border-slate-100 bg-slate-50 flex items-center px-6 justify-between">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30" />
                <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30" />
                <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400/30" />
              </div>
              <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                engine_runtime_v2
              </div>
            </div>

            <div className="flex-1 relative bg-slate-50/50">
              {/* STATE 1 */}
              <div className={`absolute inset-0 p-8 flex items-center justify-center transition-opacity duration-500 ${activeStep === 0 ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>
                <div className="w-full max-w-md bg-white border border-slate-200 shadow-sm rounded-xl p-5 flex items-center gap-4">
                  <Terminal size={20} className="text-[#2563eb]" />
                  <span className="text-[#0B1221] font-bold text-base font-mono flex items-center">
                    Track our new product launch metrics...
                    <span className="inline-block w-2 h-4 bg-[#2563eb] ml-1 animate-pulse" />
                  </span>
                </div>
              </div>

              {/* STATE 2 */}
              <div className={`absolute inset-0 p-8 flex flex-col gap-6 transition-opacity duration-500 ${activeStep === 1 ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>
                <div className="h-10 w-1/3 bg-slate-200/50 rounded-lg animate-pulse" />
                <div className="flex-1 grid grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center relative overflow-hidden">
                    <BarChart3 size={40} className="text-slate-200" />
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2563eb] animate-[pulse-glow_2s_infinite]" />
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
                    <LineChart size={40} className="text-slate-200" />
                  </div>
                </div>
              </div>

              {/* STATE 3 */}
              <div className={`absolute inset-0 p-8 flex flex-col gap-6 transition-opacity duration-500 ${activeStep === 2 ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>
                 <div className="absolute top-6 right-6 bg-[#0B1221] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg z-20 flex items-center gap-2 font-mono">
                  <Sparkles size={14} className="text-[#60a5fa]" />
                  "Filter to US region"
                </div>

                <div className="h-10 w-1/3 bg-slate-200/50 rounded-lg" />
                <div className="flex-1 grid grid-cols-2 gap-6">
                  <div className="bg-blue-50/50 rounded-xl border-2 border-[#2563eb]/20 flex items-center justify-center relative shadow-inner">
                    <div className="absolute bottom-6 left-6 flex gap-2 items-end h-24 w-32">
                       <div className="w-6 bg-[#2563eb]/40 h-[40%] rounded-t-md transition-all duration-500 delay-100"></div>
                       <div className="w-6 bg-[#2563eb]/60 h-[70%] rounded-t-md transition-all duration-500 delay-200"></div>
                       <div className="w-6 bg-[#2563eb] h-[90%] rounded-t-md shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-500 delay-300"></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center opacity-40">
                    <LineChart size={40} className="text-slate-200" />
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

export const UseCases = ({ useCases }: { useCases: NormalizedPage['useCases'] }) => {
  const [ref, vis] = useVisible(0.1);

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
        
        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-2 gap-6">
          {useCases.map((item, i) => {
            const isAdvanced = item.complexity?.toLowerCase().includes('advanced') || item.complexity?.toLowerCase().includes('strategic');
            return (
              <div 
                key={i} 
                style={{ transitionDelay: `${i * 150}ms` }}
                className={`bg-gradient-to-b from-white to-slate-50/80 rounded-2xl border border-slate-200 p-8 md:p-10 shadow-sm hover:shadow-[0_15px_30px_-10px_rgba(37,99,235,0.15)] hover:border-[#2563eb]/40 hover:-translate-y-1 transition-all duration-700 flex flex-col h-full group transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              >
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