// components/landing/seo-blocks-5.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Zap, 
  Database, 
  Network, 
  Cpu, 
  Clock, 
  DollarSign, 
  XCircle, 
  Activity,
  ServerCrash,
  Terminal,
  ActivitySquare
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BLOCK DEFINITIONS (Arcli Block System Standards)
// ----------------------------------------------------------------------

export const ParadigmTeardownDef = {
  id: "paradigm_teardown",
  purpose: "Visually and cognitively dismantles the legacy approach to data analytics (ETL pipelines, data duplication, warehouse lock-in) and structurally contrasts it with Arcli's Zero-Data Movement architecture.",
  capability: "Provides a stark, architectural teardown. It moves beyond feature comparisons (Matrix) into architectural philosophy, highlighting the elimination of integration friction, security risks, and latency.",
  inputs: {
    title: "string",
    subtitle: "string",
    executiveOutcome: "string", // ROI framing: e.g., "Eliminate $50k/yr in pipeline costs and weeks of engineering delay."
    legacyState: {
      label: "string",
      steps: "Array<{ name: string; iconType: string; latency: string; vulnerability: string }>",
      hiddenCosts: "string[]",
    },
    arcliState: {
      label: "string",
      steps: "Array<{ name: string; iconType: string; latency: string; advantage: string }>",
      valueDrivers: "string[]",
    }
  },
  ui: {
    layout: "Two-column staggered comparison grid. Legacy state on the left (muted/error styling, fragile UI), Arcli state on the right (brand/success styling, solid UI).",
    hierarchy: "Executive outcome sits prominently above the technical split to frame the business value before the technical dive.",
    interaction: "Hover states on legacy nodes reveal vulnerability tooltips. Arcli side features a glowing, unified 'engine' state."
  },
  usage: {
    whenToUse: [
      "On integration pages (e.g., Shopify, Stripe) to show why Arcli is better than syncing to a warehouse.",
      "On 'vs Competitor' pages where the competitor relies on ETL/reverse-ETL.",
      "To address objections regarding implementation time and maintenance overhead."
    ],
    whenNotToUse: [
      "For generic feature listings.",
      "If the page already heavily relies on the ComparisonMatrix block (avoid redundant comparisons)."
    ]
  }
};

export const TelemetryTraceDef = {
  id: "telemetry_trace",
  purpose: "Proves the 'Low Latency' and 'Bypass compilation' claims by simulating an actual microsecond-level execution trace of the Arcli engine.",
  capability: "Builds deep technical trust with engineering buyers by visualizing the exact chronological breakdown of a query's lifecycle (Parsing -> Semantic Routing -> DuckDB Exec -> Render).",
  inputs: {
    title: "string",
    queryInput: "string",
    totalLatency: "string",
    traces: "Array<{ phase: string; duration: string; log: string; status: 'success' | 'warn' }>",
    architecturalTakeaway: "string"
  },
  ui: {
    layout: "Dark-mode terminal/telemetry dashboard hybrid. Uses horizontal animated progress bars representing execution time per phase (flame graph style).",
    hierarchy: "Top bar shows total latency. Body shows staggered execution logs.",
    interaction: "Auto-playing or scroll-triggered animation that 'runs' the trace sequentially."
  },
  usage: {
    whenToUse: [
      "On technical deep-dive pages focusing on performance and compute efficiency.",
      "To prove the speed advantage of WebAssembly/DuckDB over traditional cloud data warehouses."
    ],
    whenNotToUse: [
      "On high-level buyer persona pages (e.g., for CMOs or RevOps who don't care about microsecond trace logs)."
    ]
  }
};

// ----------------------------------------------------------------------
// INTERFACES
// ----------------------------------------------------------------------

export interface ParadigmTeardownProps {
  title: string;
  subtitle: string;
  executiveOutcome: string;
  legacyState: {
    label: string;
    steps: Array<{ name: string; latency: string; vulnerability: string }>;
    hiddenCosts: string[];
  };
  arcliState: {
    label: string;
    steps: Array<{ name: string; latency: string; advantage: string }>;
    valueDrivers: string[];
  };
}

export interface TelemetryTraceProps {
  title: string;
  subtitle?: string;
  queryInput: string;
  totalLatency: string;
  traces: Array<{ phase: string; durationMs: number; log: string }>;
  architecturalTakeaway: string;
}

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

export const ParadigmTeardown = ({ data }: { data: ParadigmTeardownProps }) => {
  const [ref, vis] = useVisible(0.1);
  const [hoveredLegacyStep, setHoveredLegacyStep] = useState<number | null>(null);

  if (!data) return null;

  return (
    <section className="py-32 bg-white relative border-y border-slate-200/50 overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 opacity-[0.03] bg-[linear-gradient(to_right,#0B1221_1px,transparent_1px),linear-gradient(to_bottom,#0B1221_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <SectionHeading 
          monoLabel="// ARCHITECTURAL_TEARDOWN"
          subtitle={data.subtitle}
        >
          {data.title}
        </SectionHeading>

        {/* Executive Layer Framing */}
        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`max-w-4xl mx-auto mb-16 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
              <DollarSign className="w-5 h-5 text-[#2563eb]" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase font-bold text-[#2563eb] tracking-[0.2em] mb-1">The Executive ROI</div>
              <p className="text-lg font-bold text-[#0B1221] leading-relaxed">
                {data.executiveOutcome}
              </p>
            </div>
          </div>
        </div>

        {/* The Split Grid */}
        <div className={`grid lg:grid-cols-2 gap-8 lg:gap-16 relative transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          
          {/* LEGACY STATE (The Problem) */}
          <div className="flex flex-col bg-slate-50/50 border-2 border-slate-200/60 rounded-3xl p-8 lg:p-10 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-10">
              <ServerCrash className="w-6 h-6 text-slate-400" />
              <h3 className="text-xl font-bold text-slate-500 tracking-tight">{data.legacyState.label}</h3>
            </div>

            {/* Fragile Pipeline Visualization */}
            <div className="relative flex-grow mb-12">
              <div className="absolute left-6 top-6 bottom-6 w-[2px] bg-gradient-to-b from-slate-200 via-rose-200 to-slate-200 border-l border-dashed border-rose-300" />
              
              <div className="space-y-6 relative z-10">
                {data.legacyState.steps.map((step, idx) => (
                  <div 
                    key={idx} 
                    className="flex gap-6 relative group"
                    onMouseEnter={() => setHoveredLegacyStep(idx)}
                    onMouseLeave={() => setHoveredLegacyStep(null)}
                  >
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 bg-white transition-colors duration-300 ${hoveredLegacyStep === idx ? 'border-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.3)] z-20' : 'border-slate-200 shadow-sm z-10'}`}>
                      <Network className={`w-5 h-5 ${hoveredLegacyStep === idx ? 'text-rose-500' : 'text-slate-400'}`} />
                    </div>
                    
                    <div className={`flex-1 bg-white border rounded-xl p-4 transition-all duration-300 ${hoveredLegacyStep === idx ? 'border-rose-300 shadow-md translate-x-1' : 'border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-[#0B1221]">{step.name}</div>
                        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          <Clock className="w-3 h-3" /> {step.latency}
                        </div>
                      </div>
                      
                      <div className={`text-sm font-medium transition-all duration-300 flex items-start gap-2 ${hoveredLegacyStep === idx ? 'text-rose-600' : 'text-slate-500'}`}>
                        {hoveredLegacyStep === idx ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />}
                        {step.vulnerability}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden Costs Footer */}
            <div className="mt-auto pt-6 border-t border-slate-200">
              <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Hidden Architectural Costs</div>
              <ul className="space-y-3">
                {data.legacyState.hiddenCosts.map((cost, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    {cost}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ARCLI STATE (The Solution) */}
          <div className="flex flex-col bg-white border-2 border-[#2563eb]/20 shadow-[0_30px_60px_-20px_rgba(37,99,235,0.12)] rounded-3xl p-8 lg:p-10 relative overflow-hidden group">
            <div className="absolute -right-32 -top-32 w-64 h-64 bg-[#2563eb]/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-[#2563eb]/20 transition-colors duration-1000" />
            
            <div className="flex items-center gap-3 mb-10 relative z-10">
              <Zap className="w-6 h-6 text-[#2563eb]" />
              <h3 className="text-xl font-black text-[#0B1221] tracking-tight">{data.arcliState.label}</h3>
            </div>

            {/* Unified Engine Visualization */}
            <div className="relative flex-grow mb-12 flex flex-col justify-center">
              <div className="absolute left-6 top-6 bottom-6 w-[3px] bg-gradient-to-b from-[#2563eb] to-emerald-400 shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
              
              <div className="space-y-6 relative z-10 my-auto">
                {data.arcliState.steps.map((step, idx) => (
                  <div key={idx} className="flex gap-6 relative">
                    <div className="w-12 h-12 rounded-xl border-2 border-[#2563eb] flex items-center justify-center shrink-0 bg-white shadow-[0_0_20px_rgba(37,99,235,0.2)] z-10 relative">
                      {idx === 0 ? <Database className="w-5 h-5 text-[#2563eb]" /> : <Cpu className="w-5 h-5 text-[#2563eb]" />}
                      {/* Pulse effect */}
                      <div className="absolute inset-0 border-2 border-[#2563eb] rounded-xl animate-ping opacity-20" />
                    </div>
                    
                    <div className="flex-1 bg-blue-50/30 border border-blue-100 rounded-xl p-5 shadow-sm hover:border-[#2563eb]/40 hover:shadow-md transition-all duration-300">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-black text-[#0B1221]">{step.name}</div>
                        <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-[#2563eb] bg-white px-2 py-0.5 rounded border border-blue-200 shadow-sm">
                          <Zap className="w-3 h-3" /> {step.latency}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-slate-600 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                        {step.advantage}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Value Drivers Footer */}
            <div className="mt-auto pt-6 border-t border-blue-100 relative z-10">
              <div className="font-mono text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-4">The Arcli Advantage</div>
              <ul className="space-y-3">
                {data.arcliState.valueDrivers.map((driver, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-bold text-[#0B1221]">
                    <ArrowRight className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" />
                    {driver}
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export const TelemetryTrace = ({ data }: { data: TelemetryTraceProps }) => {
  const [ref, vis] = useVisible(0.2);
  const [activeStep, setActiveStep] = useState(-1);

  // Auto-play the telemetry trace when visible
  useEffect(() => {
    if (vis && activeStep < data.traces.length) {
      const timer = setTimeout(() => {
        setActiveStep(prev => prev + 1);
      }, activeStep === -1 ? 500 : 800); // initial delay, then stagger
      return () => clearTimeout(timer);
    }
  }, [vis, activeStep, data.traces.length]);

  if (!data) return null;

  // Calculate max duration for flame graph scaling
  const maxDuration = Math.max(...data.traces.map(t => t.durationMs));

  return (
    <section className="py-32 bg-[#0B1221] relative border-y border-[#1e293b] overflow-hidden text-white">
      {/* Background glow */}
      <div className="absolute top-0 right-1/4 w-[800px] h-[600px] bg-blue-600/5 blur-[150px] pointer-events-none z-0" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 bg-[#1e293b]/80 border border-white/10 px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm">
            <ActivitySquare className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-emerald-400">
              LIVE_TELEMETRY_TRACE
            </span>
          </div>
          <h2 className="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.1] mb-6">
            {data.title}
          </h2>
          {data.subtitle && (
            <p className="text-slate-400 text-lg font-medium leading-relaxed">
              {data.subtitle}
            </p>
          )}
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`bg-[#0f172a]/90 backdrop-blur-2xl rounded-3xl border border-[#1e293b] shadow-2xl overflow-hidden transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
        >
          {/* Terminal Header */}
          <div className="px-6 py-4 border-b border-[#1e293b] flex items-center justify-between bg-[#0B1221]/50">
            <div className="flex items-center gap-4">
              <Terminal className="w-5 h-5 text-slate-500" />
              <div className="font-mono text-xs text-slate-400 font-medium">
                <span className="text-[#60a5fa] font-bold">~ query</span> "{data.queryInput}"
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Execution</span>
              <span className="font-mono text-sm font-black text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-md border border-emerald-400/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]">
                {data.totalLatency}
              </span>
            </div>
          </div>

          {/* Flame Graph / Trace Body */}
          <div className="p-8 md:p-10 space-y-6 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[2.25rem] top-10 bottom-10 w-[1px] bg-[#1e293b] z-0" />

            {data.traces.map((trace, idx) => {
              const isActive = activeStep >= idx;
              const widthPercentage = Math.max((trace.durationMs / maxDuration) * 100, 15); // min 15% width for visibility
              
              return (
                <div key={idx} className="relative z-10 flex items-start gap-6 group">
                  {/* Status Indicator */}
                  <div className={`mt-1.5 w-3 h-3 rounded-full shrink-0 transition-all duration-500 ${isActive ? 'bg-emerald-500 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-slate-700'}`} />
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                      <div className={`font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-500 ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>
                        {trace.phase}
                      </div>
                      <div className={`font-mono text-xs font-bold transition-colors duration-500 ${isActive ? 'text-[#60a5fa]' : 'text-slate-700'}`}>
                        {isActive ? `${trace.durationMs}ms` : '---'}
                      </div>
                    </div>
                    
                    {/* Flame Graph Bar */}
                    <div className="h-6 bg-[#1e293b] rounded-md overflow-hidden relative mb-3 border border-white/5">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#2563eb] to-[#60a5fa] transition-all duration-700 ease-out flex items-center px-3"
                        style={{ width: isActive ? `${widthPercentage}%` : '0%' }}
                      >
                         {/* Optional subtle pattern inside the bar */}
                         <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px]" />
                      </div>
                    </div>

                    {/* Console Output (Typewriter effect simulation) */}
                    <div className={`font-mono text-sm leading-relaxed transition-all duration-500 overflow-hidden ${isActive ? 'text-slate-400 max-h-20 opacity-100' : 'text-slate-800 max-h-0 opacity-0'}`}>
                      {'>'} {trace.log}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Architectural Takeaway */}
          <div className={`bg-[#0B1221] border-t border-[#1e293b] p-6 px-8 md:px-10 transition-all duration-1000 delay-500 ${activeStep >= data.traces.length - 1 ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-start gap-4">
              <Zap className="w-5 h-5 text-[#fbbf24] shrink-0 mt-0.5" />
              <p className="text-slate-300 font-medium leading-relaxed">
                <strong className="text-white font-bold">Architectural Takeaway: </strong>
                {data.architecturalTakeaway}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};