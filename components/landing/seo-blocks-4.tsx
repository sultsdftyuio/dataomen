/**
 * FILE: components/landing/seo-blocks-4.tsx
 * ═══════════════════════════════════════════════════════════════════
 * BUG FIXES (Bulletproofing)
 * ═══════════════════════════════════════════════════════════════════
 * - Added deep null checks for complex nested objects (!data || !data.scenario)
 * - Added optional chaining (?.) to all nested array.map() calls.
 * - Safely guarded tablesUtilized, semanticTokens, and processes.
 */

"use client";

import React from 'react';
import { 
  Shield, 
  Database, 
  Cloud, 
  ArrowRightLeft, 
  LockKeyhole, 
  Cpu, 
  Code2, 
  GitMerge, 
  FileTerminal,
  Server,
  Activity,
  CheckCircle2,
  Workflow
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// ADVANCED ARCHITECTURE & TRUST BLOCKS
// Focus: Spatial Proofs, Deterministic Mapping, Deep Compliance
// ----------------------------------------------------------------------

export interface ZeroDataProofProps {
  title: string;
  subtitle?: string;
  customerZone: {
    title: string;
    description: string;
    dataSources: string[];
    securityGuarantee: string;
  };
  arcliZone: {
    title: string;
    description: string;
    processes: string[];
    retentionPolicy: string;
  };
  networkBoundary: {
    protocol: string;
    inboundPayload: string;
    outboundPayload: string;
  };
}

export const ZeroDataProof = ({ data }: { data: ZeroDataProofProps }) => {
  const [ref, vis] = useVisible(0.1);

  if (!data || !data.customerZone || !data.arcliZone || !data.networkBoundary) return null;

  return (
    <section className="py-24 bg-slate-50 relative border-y border-slate-200/50 overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-[0.02] bg-[radial-gradient(#0B1221_1px,transparent_1px)] [background-size:24px_24px]" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        <SectionHeading 
          monoLabel="// TOPOLOGY_PROOF"
          subtitle={data.subtitle || "Visual guarantee of absolute data isolation. We ship the compute logic to your data, not the other way around."}
        >
          {data.title}
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-8 items-center transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* Customer Zone (Heavy, Secure) */}
          <div className="bg-white rounded-3xl border-2 border-slate-200 p-8 md:p-10 shadow-[0_20px_40px_-15px_rgba(11,18,33,0.05)] h-full flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-bl-full -z-10 opacity-50" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                <Database className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0B1221] tracking-tight">{data.customerZone.title}</h3>
                <span className="font-mono text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em]">Your Infrastructure</span>
              </div>
            </div>

            <p className="text-slate-500 font-medium mb-8 flex-grow">
              {data.customerZone.description}
            </p>

            <div className="space-y-4 mb-8">
              {data.customerZone.dataSources?.map((source, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <Server className="w-4 h-4 text-slate-400" />
                  <span className="font-bold text-sm text-[#0B1221]">{source}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-800 text-white p-4 rounded-xl flex items-start gap-3 mt-auto">
              <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-[10px] uppercase font-bold text-emerald-400/80 mb-1 tracking-[0.1em]">Guarantee</div>
                <div className="text-sm font-bold">{data.customerZone.securityGuarantee}</div>
              </div>
            </div>
          </div>

          {/* Network Boundary (The Divide) */}
          <div className="flex flex-col items-center justify-center py-8 lg:py-0 relative z-20">
            <div className="hidden lg:block w-[2px] h-32 bg-gradient-to-b from-transparent via-blue-300 to-transparent" />
            
            <div className="bg-white border-2 border-[#2563eb]/20 shadow-xl rounded-2xl p-4 w-64 text-center relative my-4">
              <div className="absolute inset-0 bg-[#2563eb]/5 rounded-2xl animate-pulse" />
              <LockKeyhole className="w-6 h-6 text-[#2563eb] mx-auto mb-2 relative z-10" />
              <div className="font-mono text-[10px] uppercase font-bold text-[#2563eb] tracking-[0.1em] relative z-10">
                {data.networkBoundary.protocol}
              </div>
              
              <div className="mt-4 space-y-3 relative z-10">
                <div className="text-xs bg-slate-50 p-2 rounded border border-slate-100 flex justify-between items-center">
                  <span className="text-slate-400 font-bold font-mono">IN:</span>
                  <span className="text-[#0B1221] font-medium">{data.networkBoundary.inboundPayload}</span>
                </div>
                <div className="text-xs bg-blue-50/50 p-2 rounded border border-blue-100 flex justify-between items-center">
                  <span className="text-blue-500 font-bold font-mono">OUT:</span>
                  <span className="text-[#0B1221] font-medium">{data.networkBoundary.outboundPayload}</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:block w-[2px] h-32 bg-gradient-to-b from-transparent via-blue-300 to-transparent" />
          </div>

          {/* Arcli Zone (Light, Ephemeral) */}
          <div className="bg-white rounded-3xl border border-blue-100 p-8 md:p-10 shadow-[0_20px_40px_-15px_rgba(37,99,235,0.08)] h-full flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-700" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                <Cloud className="w-6 h-6 text-[#2563eb]" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0B1221] tracking-tight">{data.arcliZone.title}</h3>
                <span className="font-mono text-[10px] uppercase font-bold text-[#2563eb] tracking-[0.2em]">Compute Engine</span>
              </div>
            </div>

            <p className="text-slate-500 font-medium mb-8 flex-grow">
              {data.arcliZone.description}
            </p>

            <div className="space-y-4 mb-8">
              {data.arcliZone.processes?.map((process, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-blue-50 shadow-sm">
                  <Cpu className="w-4 h-4 text-[#2563eb]" />
                  <span className="font-bold text-sm text-[#0B1221]">{process}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3 mt-auto">
              <Activity className="w-5 h-5 text-[#2563eb] shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-[10px] uppercase font-bold text-blue-600/80 mb-1 tracking-[0.1em]">State Policy</div>
                <div className="text-sm font-bold text-[#0B1221]">{data.arcliZone.retentionPolicy}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export interface SemanticTranslationProps {
  title: string;
  description?: string;
  dialect: string;
  scenario: {
    businessQuestion: string;
    semanticTokens: Array<{ word: string; mappedTo: string; isMetric: boolean }>;
    schemaContext: { tablesUtilized: string[]; joinCondition: string; };
    compiledSQL: string;
  };
}

export const SemanticTranslation = ({ data }: { data: SemanticTranslationProps }) => {
  const [ref, vis] = useVisible(0.2);

  if (!data || !data.scenario) return null;

  return (
    <section className="py-32 bg-[#0B1221] text-white relative border-y border-[#1e293b]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <SectionHeading 
            monoLabel="// DETERMINISTIC_TRANSLATION"
            subtitle={data.description || "Eliminate hallucination. See exactly how ambiguous business terms map to governed definitions before compiling to dialect-specific SQL."}
          >
            <span className="text-white">{data.title}</span>
          </SectionHeading>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`bg-[#0f172a] rounded-3xl border border-[#1e293b] shadow-2xl overflow-hidden flex flex-col md:flex-row transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
        >
          {/* Left Side: Natural Language Input & Mapping */}
          <div className="md:w-5/12 border-b md:border-b-0 md:border-r border-[#1e293b] p-8 md:p-10 flex flex-col bg-[#0B1221]/50">
            <div className="flex items-center gap-2 mb-8">
              <FileTerminal className="w-5 h-5 text-[#60a5fa]" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#60a5fa]">
                SEMANTIC_PARSER
              </span>
            </div>

            <div className="mb-10">
              <div className="text-sm font-mono text-slate-500 mb-3 uppercase tracking-widest">Raw Input</div>
              <div className="text-2xl font-bold leading-relaxed text-white">
                "{data.scenario.businessQuestion}"
              </div>
            </div>

            <div className="space-y-4 mt-auto">
              <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Token Resolution</div>
              {data.scenario.semanticTokens?.map((token, i) => (
                <div key={i} className="flex items-center gap-4 bg-[#1e293b]/50 border border-[#1e293b] p-3 rounded-xl">
                  <div className={`px-2 py-1 rounded text-xs font-bold font-mono ${token.isMetric ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    "{token.word}"
                  </div>
                  <ArrowRightLeft className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="text-sm font-mono text-slate-300 truncate">
                    {token.mappedTo}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side: Execution & SQL */}
          <div className="md:w-7/12 p-8 md:p-10 bg-[#0B1221] flex flex-col relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#2563eb]/10 blur-[100px] pointer-events-none" />
            
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-white" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  COMPILED_OUTPUT
                </span>
              </div>
              <div className="px-3 py-1 bg-white/10 border border-white/20 rounded-md font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">
                {data.dialect}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#0f172a] p-4 rounded-xl border border-[#1e293b]">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Tables Utilized</div>
                <div className="text-sm font-mono text-blue-400 flex flex-col gap-1">
                  {data.scenario.schemaContext?.tablesUtilized?.map(t => <span key={t}>{t}</span>)}
                </div>
              </div>
              <div className="bg-[#0f172a] p-4 rounded-xl border border-[#1e293b]">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Join Strategy</div>
                <div className="text-sm font-mono text-emerald-400 break-all">
                  {data.scenario.schemaContext?.joinCondition}
                </div>
              </div>
            </div>

            <div className="flex-1 bg-[#0f172a] rounded-xl border border-[#1e293b] p-6 overflow-x-auto relative">
              <div className="absolute left-4 top-0 bottom-0 w-[1px] bg-[#1e293b]" />
              <pre className="font-mono text-sm text-slate-300 leading-relaxed">
                <code>{data.scenario.compiledSQL}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export interface TrustAndComplianceProps {
  title: string;
  subtitle?: string;
  certifications: Array<{ name: string; description: string; verified: boolean }>;
  compliancePoints: string[];
}

export const TrustAndCompliance = ({ data }: { data: TrustAndComplianceProps }) => {
  const [ref, vis] = useVisible(0.1);

  if (!data || !data.certifications || data.certifications.length === 0) return null;

  return (
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`bg-slate-50 rounded-[2.5rem] border border-slate-200 p-8 md:p-16 relative overflow-hidden transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-100 rounded-full blur-[80px] pointer-events-none" />

          <div className="text-center max-w-2xl mx-auto mb-16 relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-[#0B1221] tracking-tight mb-6">
              {data.title}
            </h2>
            <p className="text-slate-500 text-lg font-medium">
              {data.subtitle || "Enterprise-grade security and compliance built into the core engine."}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 relative z-10">
            {/* Certifications */}
            <div className="space-y-6">
              <div className="font-mono text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-6">
                Active Certifications
              </div>
              {data.certifications?.map((cert, i) => (
                <div key={i} className="flex gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-12 h-12 shrink-0 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
                    <Shield className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-[#0B1221] text-lg">{cert.name}</h4>
                      {cert.verified && <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />}
                    </div>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed">
                      {cert.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Platform Constraints */}
            <div className="space-y-6">
              <div className="font-mono text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-6">
                Platform Security Guardrails
              </div>
              <div className="bg-[#0B1221] rounded-2xl p-6 md:p-8 border border-[#1e293b] shadow-xl">
                <ul className="space-y-5">
                  {data.compliancePoints?.map((point, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-[#1e293b] flex items-center justify-center border border-slate-700">
                        <LockKeyhole className="w-3 h-3 text-[#60a5fa]" />
                      </div>
                      <span className="text-slate-300 font-medium text-[15px] leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};