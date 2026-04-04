// components/landing/seo-blocks-9.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  DatabaseZap, 
  Lock, 
  ArrowRight, 
  BrainCircuit, 
  AlertTriangle, 
  CheckCircle2, 
  XOctagon,
  TerminalSquare,
  Network,
  SplitSquareHorizontal,
  Workflow
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BLOCK DEFINITIONS (Arcli Block System Standards)
// ----------------------------------------------------------------------

export const TenantIsolationDef = {
  id: "tenant_isolation_architecture",
  purpose: "To prove to B2B SaaS buyers that Arcli can be embedded into their multi-tenant application without risking cross-tenant data leakage.",
  capability: "Provides a structural visualization of Row-Level Security (RLS) and namespace isolation. Shifts the conversation from 'Can we embed this?' to 'How safely is this embedded?'",
  inputs: {
    title: "string",
    subtitle: "string",
    executiveOutcome: "string", // e.g., "Deploy customer-facing analytics with zero risk of cross-tenant data spillage."
    routerState: {
      label: "string",
      mechanism: "string" // e.g., "JWT Token Interception & Injection"
    },
    tenants: "Array<{ name: string; id: string; themeColor: string; status: string }>",
    isolationGuarantees: "Array<{ title: string; description: string }>"
  },
  ui: {
    layout: "Top-down flow diagram. Top: Application Gateway (Shared). Middle: The Isolation Router. Bottom: Strictly partitioned tenant data vaults.",
    hierarchy: "Visual emphasis on the 'air-gap' or strict boundary between the tenant vaults. The router acts as the cryptographic gatekeeper.",
    interaction: "Hovering over a tenant triggers a simulated query path, tracing from the top down into only their specific partition, highlighting the cryptographic boundary."
  },
  usage: {
    whenToUse: [
      "On 'Embedded Analytics' or 'For SaaS' persona pages.",
      "To counter security objections from CTOs building multi-tenant platforms.",
      "On architecture deep-dive pages."
    ],
    whenNotToUse: [
      "On internal BI / single-tenant enterprise use case pages."
    ]
  }
};

export const DeterministicGuardrailsDef = {
  id: "deterministic_ai_guardrails",
  purpose: "To dismantle the enterprise fear of 'AI Hallucinations'. Proves that Arcli uses AI strictly as a translation layer, bounded by deterministic schema rules.",
  capability: "Introduces the 'Negative Space' proof—showing what the AI is *not* allowed to do. Contrasts generic LLM behavior (making things up) with Arcli's semantic boundary enforcement.",
  inputs: {
    title: "string",
    description: "string",
    guardrailStages: "Array<{ step: number; name: string; iconType: string; isEnforced: boolean }>",
    simulation: {
      badPrompt: "string",
      badOutcome: {
        reason: "string",
        systemResponse: "string"
      },
      goodPrompt: "string",
      goodOutcome: {
        sqlGenerated: "string"
      }
    }
  },
  ui: {
    layout: "Interactive split-pane 'Terminal vs Gateway'. Left: User submits an ambiguous or out-of-bounds prompt. Right: The Guardrail Engine visually blocks it, citing exact schema violations.",
    hierarchy: "The 'Block/Deny' action is visually celebrated (red/warning styling) to prove safety, contrasting with a standard successful query.",
    interaction: "A toggle switch between 'Unsafe Prompt' (shows blocking mechanism) and 'Governed Prompt' (shows safe SQL compilation)."
  },
  usage: {
    whenToUse: [
      "On Semantic Layer or AI Trust pages.",
      "When addressing Data Engineering leaders who are skeptical of text-to-SQL tools.",
      "To highlight governance and schema strictness."
    ],
    whenNotToUse: [
      "For simple, top-of-funnel capabilities overviews (might be too deep)."
    ]
  }
};

// ----------------------------------------------------------------------
// INTERFACES
// ----------------------------------------------------------------------

export interface TenantIsolationProps {
  title: string;
  subtitle: string;
  executiveOutcome: string;
  routerState: {
    label: string;
    mechanism: string;
  };
  tenants: Array<{
    name: string;
    id: string;
    themeClass: string; // e.g., 'text-blue-500 border-blue-200 bg-blue-50'
    status: string;
  }>;
  isolationGuarantees: Array<{
    title: string;
    description: string;
  }>;
}

export interface DeterministicGuardrailsProps {
  title: string;
  description: string;
  guardrailStages: Array<{
    name: string;
    isEnforced: boolean;
  }>;
  simulation: {
    badPrompt: string;
    badOutcome: {
      reason: string;
      systemResponse: string;
    };
    goodPrompt: string;
    goodOutcome: {
      sqlGenerated: string;
    };
  };
}

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

export const TenantIsolationArchitecture = ({ data }: { data: TenantIsolationProps }) => {
  const [ref, vis] = useVisible(0.1);
  const [activeTenant, setActiveTenant] = useState<number | null>(1); // Default to middle tenant

  if (!data) return null;

  return (
    <section className="py-24 bg-slate-50 relative border-y border-slate-200/50 overflow-hidden">
      {/* Background Architectural Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50 z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <SectionHeading 
            monoLabel="// MULTI-TENANT_ISOLATION"
            subtitle={data.subtitle}
          >
            {data.title}
          </SectionHeading>
          
          <div className={`mt-8 inline-flex items-center gap-3 bg-white border border-slate-200 shadow-sm px-6 py-3 rounded-full transition-all duration-1000 delay-100 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <p className="text-[#0B1221] font-bold text-sm">
              {data.executiveOutcome}
            </p>
          </div>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`relative transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* TOP: Application Gateway */}
          <div className="flex justify-center mb-8 relative z-20">
            <div className="bg-[#0B1221] text-white border border-[#1e293b] rounded-2xl px-8 py-5 shadow-xl flex items-center gap-4 w-full max-w-md">
              <Network className="w-6 h-6 text-[#60a5fa]" />
              <div>
                <div className="font-bold text-lg">Your Application API</div>
                <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mt-1">Shared Gateway</div>
              </div>
            </div>
          </div>

          {/* Connection Lines to Router */}
          <div className="flex justify-center -my-4 relative z-10">
            <div className="w-[2px] h-12 bg-gradient-to-b from-[#1e293b] to-[#2563eb]" />
          </div>

          {/* MIDDLE: Cryptographic Router */}
          <div className="flex justify-center mb-12 relative z-20">
            <div className="bg-blue-50 border-2 border-[#2563eb] rounded-2xl p-6 shadow-[0_0_30px_rgba(37,99,235,0.15)] text-center w-full max-w-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-[#2563eb]/5 group-hover:bg-[#2563eb]/10 transition-colors duration-500" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <SplitSquareHorizontal className="w-5 h-5 text-[#2563eb]" />
                <h3 className="font-black text-[#0B1221] text-xl">{data.routerState.label}</h3>
              </div>
              <div className="inline-flex items-center gap-2 bg-white border border-blue-200 px-3 py-1.5 rounded-md font-mono text-xs font-bold text-[#2563eb] shadow-sm">
                <Lock className="w-3.5 h-3.5" /> {data.routerState.mechanism}
              </div>
            </div>
          </div>

          {/* Connection Lines from Router to Tenants */}
          <div className="relative h-16 -my-6 z-10 w-full max-w-4xl mx-auto hidden md:block">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-8 bg-[#2563eb]" />
            <div className="absolute top-8 left-[16.66%] right-[16.66%] h-[2px] bg-slate-200" />
            <div className="absolute top-8 left-[16.66%] w-[2px] h-8 bg-slate-200" />
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[2px] h-8 bg-[#2563eb]" /> {/* Active Line */}
            <div className="absolute top-8 right-[16.66%] w-[2px] h-8 bg-slate-200" />
          </div>

          {/* BOTTOM: Isolated Tenants */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto relative z-20 mt-8 md:mt-0">
            {data.tenants.map((tenant, idx) => {
              const isActive = activeTenant === idx;
              
              return (
                <div 
                  key={idx}
                  onMouseEnter={() => setActiveTenant(idx)}
                  className={`bg-white border-2 rounded-3xl p-6 transition-all duration-300 cursor-default relative overflow-hidden
                    ${isActive ? 'border-[#2563eb] shadow-[0_20px_40px_-15px_rgba(37,99,235,0.15)] -translate-y-2' : 'border-slate-200 shadow-sm opacity-60 hover:opacity-100'}
                  `}
                >
                  {/* Internal Glow for active */}
                  {isActive && <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#2563eb]/10 rounded-full blur-[40px] pointer-events-none" />}
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isActive ? 'bg-blue-50 border-blue-200 text-[#2563eb]' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className={`font-bold ${isActive ? 'text-[#0B1221]' : 'text-slate-600'}`}>{tenant.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{tenant.id}</div>
                      </div>
                    </div>
                  </div>

                  <div className={`bg-slate-50 rounded-xl p-4 border relative overflow-hidden ${isActive ? 'border-blue-100' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <DatabaseZap className={`w-4 h-4 ${isActive ? 'text-[#2563eb]' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Partition</span>
                    </div>
                    
                    {/* Simulated Data Rows */}
                    <div className="space-y-2">
                      {[1, 2, 3].map((row) => (
                        <div key={row} className="h-2 rounded bg-slate-200 w-full overflow-hidden relative">
                           {isActive && <div className="absolute inset-0 bg-blue-400/20 animate-pulse" />}
                        </div>
                      ))}
                    </div>

                    {isActive && (
                       <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center font-mono text-xs font-bold text-[#2563eb] border border-[#2563eb]/20 m-2 rounded-lg">
                          <Lock className="w-3 h-3 mr-1" /> Isolate: {tenant.id}
                       </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guarantees Footer */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16 pt-12 border-t border-slate-200">
            {data.isolationGuarantees.map((guarantee, idx) => (
              <div key={idx} className="text-center md:text-left">
                <h4 className="font-bold text-[#0B1221] mb-2 flex items-center justify-center md:justify-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {guarantee.title}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {guarantee.description}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
};


export const DeterministicGuardrails = ({ data }: { data: DeterministicGuardrailsProps }) => {
  const [ref, vis] = useVisible(0.2);
  const [isSafeMode, setIsSafeMode] = useState(false);

  if (!data) return null;

  return (
    <section className="py-32 bg-[#0B1221] text-white relative border-y border-[#1e293b] overflow-hidden">
       {/* Glow Effect */}
       <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] blur-[150px] pointer-events-none transition-colors duration-1000 z-0 ${isSafeMode ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-8 justify-between items-end mb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-[#1e293b]/50 border border-white/10 px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm">
              <BrainCircuit className="w-4 h-4 text-[#60a5fa]" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#60a5fa]">
                DETERMINISTIC_ENGINE
              </span>
            </div>
            <h2 className="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.1] mb-4">
              {data.title}
            </h2>
            <p className="text-slate-400 text-lg font-medium leading-relaxed">
              {data.description}
            </p>
          </div>

          {/* Interactive Toggle */}
          <div className="shrink-0 bg-[#0f172a] p-2 rounded-xl border border-[#1e293b] flex gap-2">
             <button 
                onClick={() => setIsSafeMode(false)}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${!isSafeMode ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-500 hover:text-slate-300'}`}
             >
                <XOctagon className="w-4 h-4" /> Unsafe Prompt
             </button>
             <button 
                onClick={() => setIsSafeMode(true)}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${isSafeMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300'}`}
             >
                <CheckCircle2 className="w-4 h-4" /> Valid Prompt
             </button>
          </div>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEFT: User Input */}
          <div className="bg-[#0f172a]/90 backdrop-blur-xl border border-[#1e293b] rounded-3xl p-8 shadow-2xl h-full flex flex-col relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full transition-colors duration-500 ${isSafeMode ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#1e293b]">
              <TerminalSquare className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-white text-lg">User Request</h3>
            </div>
            
            <div className="flex-grow flex items-center">
              <div className="font-mono text-sm leading-relaxed text-slate-300 bg-[#0B1221] p-6 rounded-xl border border-[#1e293b] w-full">
                <span className="text-[#60a5fa] font-bold">Ask: </span>
                <span className="transition-all duration-500">"{isSafeMode ? data.simulation.goodPrompt : data.simulation.badPrompt}"</span>
              </div>
            </div>
          </div>

          {/* MIDDLE: Guardrail Pipeline */}
          <div className="flex flex-col justify-center py-8 relative">
            <div className="hidden lg:block absolute right-1/2 top-1/2 w-[200%] h-[2px] bg-[#1e293b] -translate-y-1/2 -z-10" />
            
            <div className="bg-[#0B1221] border border-[#1e293b] shadow-2xl rounded-2xl p-6 w-72 relative z-10">
              <div className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-6">Execution Pipeline</div>
              
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[19px] before:-translate-x-px before:h-full before:w-[2px] before:bg-[#1e293b]">
                {data.guardrailStages.map((stage, idx) => {
                  // Logic to determine if this specific stage fails based on safe mode
                  // If unsafe mode, the last stage (e.g., Schema Validation) fails.
                  const isFailingStage = !isSafeMode && idx === data.guardrailStages.length - 1;
                  const isPassed = isSafeMode || idx < data.guardrailStages.length - 1;

                  return (
                    <div key={idx} className="relative flex items-center gap-4 z-10">
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 bg-[#0B1221] transition-colors duration-500
                        ${isFailingStage ? 'border-rose-500 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]' : 
                          isPassed ? 'border-emerald-500 text-emerald-500' : 'border-[#1e293b] text-slate-600'}
                      `}>
                        {isFailingStage ? <XOctagon className="w-4 h-4" /> : <Workflow className="w-4 h-4" />}
                      </div>
                      <div className={`font-mono text-xs font-bold transition-colors duration-500 ${isFailingStage ? 'text-rose-400' : isPassed ? 'text-slate-300' : 'text-slate-600'}`}>
                        {stage.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: System Resolution */}
          <div className={`rounded-3xl border p-8 shadow-2xl h-full flex flex-col relative overflow-hidden transition-colors duration-500
            ${isSafeMode ? 'bg-[#0f172a]/90 border-emerald-500/30' : 'bg-[#0f172a]/90 border-rose-500/30'}
          `}>
             <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1e293b]">
              <div className="flex items-center gap-3">
                <DatabaseZap className={`w-5 h-5 ${isSafeMode ? 'text-emerald-400' : 'text-rose-400'}`} />
                <h3 className="font-bold text-white text-lg">System Output</h3>
              </div>
              <div className={`px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest rounded ${isSafeMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {isSafeMode ? 'Compiled Successfully' : 'Execution Blocked'}
              </div>
            </div>

            <div className="flex-grow flex flex-col justify-center transition-all duration-500">
              {!isSafeMode ? (
                // Blocked State
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-100 text-sm mb-1">Schema Violation Prevented</div>
                      <p className="text-sm text-rose-200/70">{data.simulation.badOutcome.reason}</p>
                    </div>
                  </div>
                  <div className="bg-[#0B1221] border border-rose-500/30 rounded-lg p-4 font-mono text-xs text-rose-400">
                    {data.simulation.badOutcome.systemResponse}
                  </div>
                </div>
              ) : (
                // Success State
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
                   <div className="flex items-start gap-3 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-emerald-100 text-sm mb-1">Strict Mapping Verified</div>
                      <p className="text-sm text-emerald-200/70">Generated mathematically guaranteed SQL.</p>
                    </div>
                  </div>
                  <pre className="bg-[#0B1221] border border-emerald-500/30 rounded-lg p-4 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    <code>{data.simulation.goodOutcome.sqlGenerated}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};