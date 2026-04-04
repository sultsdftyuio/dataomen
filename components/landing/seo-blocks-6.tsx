// components/landing/seo-blocks-6.tsx
"use client";

import React, { useState } from 'react';
import { 
  Code2, 
  Terminal, 
  GitCommit, 
  FileCode2, 
  Activity, 
  CheckCircle2, 
  Boxes, 
  Lock, 
  Zap,
  ArrowRight
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BLOCK DEFINITIONS (Arcli Block System Standards)
// ----------------------------------------------------------------------

export const MetricGovernanceDef = {
  id: "metric_governance_code",
  purpose: "To prove that Arcli is a strictly governed system, not a loose text-to-SQL bot. Demonstrates how business logic is defined in version-controlled code.",
  capability: "Introduces 'Metrics as Code' visual proofs. It bridges the gap between data engineering (YAML/Git) and business users (trustable charts).",
  inputs: {
    title: "string",
    subtitle: "string",
    executiveOutcome: "string", // e.g., "Eliminate reporting discrepancies and dashboard sprawl."
    codeSnippet: {
      filename: "string",
      language: "string",
      code: "string"
    },
    governedOutputs: "Array<{ label: string; value: string; status: string }>"
  },
  ui: {
    layout: "Asymmetric split. Left: Dark-mode IDE showing the semantic definition (e.g., YAML). Right: Floating UI cards representing the downstream business consumption of that exact metric.",
    hierarchy: "Code acts as the visual anchor (the source of truth), with animated connection lines flowing to the clean business outputs.",
    interaction: "Hovering over code tokens highlights the corresponding value in the business UI cards."
  },
  usage: {
    whenToUse: [
      "On 'Semantic Layer' or 'Data Governance' pages.",
      "To address objections from Data Engineering leaders about AI hallucination.",
      "When explaining how metrics remain consistent across different departments."
    ],
    whenNotToUse: [
      "On top-of-funnel non-technical buyer pages (e.g., pure marketing personas)."
    ]
  }
};

export const EmbeddableSDKDef = {
  id: "embeddable_developer_sdk",
  purpose: "To showcase the developer experience and prove that Arcli can be used headlessly to power customer-facing analytics.",
  capability: "Provides a multi-language API/SDK code switcher. Proves the 'API-First' architectural claim by showing actual implementation code.",
  inputs: {
    title: "string",
    subtitle: "string",
    timeToValue: "string", // e.g., "Ship customer-facing dashboards in < 4 hours."
    snippets: "Array<{ language: string; iconType: string; code: string; highlightLines: number[] }>",
    features: "string[]"
  },
  ui: {
    layout: "Centered terminal window with a tabbed interface for different languages (Next.js, Python, cURL). Below the terminal, a sleek row of developer-centric value props.",
    hierarchy: "The code is the hero. The time-to-value metric sits as a contrasting badge.",
    interaction: "Clickable tabs switch the code language instantly with a subtle fade."
  },
  usage: {
    whenToUse: [
      "On 'Embeddable Analytics' or 'Developer API' pages.",
      "To convert engineering teams tasked with building in-house analytics.",
      "To demonstrate integration flexibility."
    ],
    whenNotToUse: [
      "When the page intent is purely about internal BI/reporting (where the Arcli UI is used instead of the SDK)."
    ]
  }
};

// ----------------------------------------------------------------------
// INTERFACES
// ----------------------------------------------------------------------

export interface MetricGovernanceProps {
  title: string;
  subtitle: string;
  executiveOutcome: string;
  codeSnippet: {
    filename: string;
    language: string;
    code: string;
  };
  governedOutputs: Array<{
    label: string;
    value: string;
    status: string;
  }>;
}

export interface EmbeddableSDKProps {
  title: string;
  subtitle: string;
  timeToValue: string;
  snippets: Array<{
    language: string;
    code: string;
  }>;
  features: string[];
}

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

export const MetricGovernance = ({ data }: { data: MetricGovernanceProps }) => {
  const [ref, vis] = useVisible(0.1);

  if (!data) return null;

  return (
    <section className="py-24 bg-white relative border-y border-slate-200/50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] opacity-30 z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <SectionHeading 
          monoLabel="// SEMANTIC_GOVERNANCE"
          subtitle={data.subtitle}
        >
          {data.title}
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid lg:grid-cols-12 gap-8 items-center transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEFT: Code as Truth (Data Engineering View) */}
          <div className="lg:col-span-7 bg-[#0B1221] rounded-2xl border border-[#1e293b] shadow-2xl overflow-hidden flex flex-col relative z-10">
            {/* IDE Header */}
            <div className="h-12 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <FileCode2 className="w-4 h-4 text-[#60a5fa]" />
                <span className="font-mono text-xs text-slate-300">{data.codeSnippet.filename}</span>
              </div>
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest">Main Branch</span>
              </div>
            </div>
            
            {/* IDE Body */}
            <div className="p-6 overflow-x-auto relative text-sm">
              <div className="absolute left-0 top-0 bottom-0 w-12 bg-[#0f172a]/50 border-r border-[#1e293b] flex flex-col items-center py-6 font-mono text-slate-600 text-xs select-none">
                {data.codeSnippet.code.split('\n').map((_, i) => <div key={i} className="h-6">{i + 1}</div>)}
              </div>
              <pre className="pl-10 font-mono leading-normal">
                <code className="text-slate-300">
                  {/* Highly simplified syntax highlighting simulation */}
                  {data.codeSnippet.code.split('\n').map((line, i) => {
                    const isKey = line.includes(':') && !line.trim().startsWith('-');
                    const parts = line.split(':');
                    return (
                      <div key={i} className="h-6 whitespace-pre">
                        {isKey ? (
                          <>
                            <span className="text-[#60a5fa]">{parts[0]}</span>:
                            <span className="text-emerald-300">{parts.slice(1).join(':')}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">{line}</span>
                        )}
                      </div>
                    );
                  })}
                </code>
              </pre>
            </div>
          </div>

          {/* RIGHT: Business Outputs (Consumer View) */}
          <div className="lg:col-span-5 flex flex-col gap-6 relative">
            {/* Visual connector lines (desktop only) */}
            <div className="hidden lg:block absolute right-[100%] top-1/2 w-16 h-[2px] bg-gradient-to-r from-[#2563eb] to-transparent -translate-y-1/2 -z-10" />

            <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl shadow-sm mb-4 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#2563eb]" />
              <div className="font-mono text-[10px] uppercase font-bold text-[#2563eb] tracking-[0.2em] mb-2 flex items-center gap-2">
                <Lock className="w-3 h-3" /> ROI & Impact
              </div>
              <p className="text-[#0B1221] font-bold text-sm leading-relaxed">
                {data.executiveOutcome}
              </p>
            </div>

            {/* Governed Cards */}
            {data.governedOutputs.map((output, idx) => (
              <div 
                key={idx}
                className="bg-white border border-slate-200 p-6 rounded-2xl shadow-[0_10px_30px_-15px_rgba(11,18,33,0.08)] flex items-center justify-between hover:border-[#2563eb]/30 transition-colors duration-300 relative"
              >
                {/* Connecting node indicator */}
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full border-2 border-slate-200 flex items-center justify-center">
                  <div className="w-2 h-2 bg-[#2563eb] rounded-full" />
                </div>

                <div className="pl-4">
                  <div className="text-slate-500 font-mono text-[10px] font-bold uppercase tracking-widest mb-1">
                    {output.label}
                  </div>
                  <div className="text-2xl font-black text-[#0B1221] tracking-tight">
                    {output.value}
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200/50 font-medium text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {output.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};


export const EmbeddableSDK = ({ data }: { data: EmbeddableSDKProps }) => {
  const [ref, vis] = useVisible(0.2);
  const [activeTab, setActiveTab] = useState(0);

  if (!data || data.snippets.length === 0) return null;

  return (
    <section className="py-32 bg-[#0B1221] text-white relative border-y border-[#1e293b] overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#2563eb]/10 blur-[120px] pointer-events-none z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className={`max-w-2xl transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 bg-[#1e293b]/50 border border-white/10 px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm">
              <Boxes className="w-4 h-4 text-[#60a5fa]" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#60a5fa]">
                EMBEDDABLE_ENGINE
              </span>
            </div>
            <h2 className="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.1] mb-4">
              {data.title}
            </h2>
            <p className="text-slate-400 text-lg font-medium leading-relaxed">
              {data.subtitle}
            </p>
          </div>

          <div className={`shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 text-right transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mb-1">Time to Value</div>
            <div className="text-2xl font-black text-white">{data.timeToValue}</div>
          </div>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`bg-[#0f172a] rounded-2xl border border-[#1e293b] shadow-2xl overflow-hidden flex flex-col transition-all duration-1000 delay-100 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* Terminal Tabs */}
          <div className="flex border-b border-[#1e293b] bg-[#0B1221]">
            {data.snippets.map((snippet, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-6 py-4 text-sm font-mono font-bold transition-colors border-r border-[#1e293b] flex items-center gap-2 ${
                  activeTab === idx 
                    ? 'bg-[#0f172a] text-white border-b-2 border-b-[#2563eb]' 
                    : 'bg-[#0B1221] text-slate-500 hover:text-slate-300 hover:bg-[#0f172a]/50 border-b-2 border-b-transparent'
                }`}
              >
                <Code2 className="w-4 h-4" />
                {snippet.language}
              </button>
            ))}
            <div className="flex-1 bg-[#0B1221]" /> {/* Fill remaining space */}
          </div>

          {/* Code Body */}
          <div className="p-8 overflow-x-auto relative min-h-[300px]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
            
            {data.snippets.map((snippet, idx) => (
              <div 
                key={idx}
                className={`transition-opacity duration-500 absolute inset-8 ${activeTab === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
              >
                <pre className="font-mono text-sm leading-relaxed text-slate-300">
                  <code>{snippet.code}</code>
                </pre>
              </div>
            ))}
          </div>

          {/* Value Props Footer */}
          <div className="bg-[#1e293b]/30 border-t border-[#1e293b] p-6">
            <div className="grid md:grid-cols-3 gap-6">
              {data.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-[#2563eb]/20 border border-[#2563eb]/30 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#60a5fa]" />
                  </div>
                  <span className="text-sm font-medium text-slate-300 leading-snug">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};