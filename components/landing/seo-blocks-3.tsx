// components/landing/seo-blocks-3.tsx
"use client";

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Database, 
  Server, 
  Terminal, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Code2,
  LineChart,
  Network
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// ADVANCED / ENTERPRISE SEO BLOCKS
// Focus: Security, ROI, Contrarian Views, and Strategic SQL implementation
// ----------------------------------------------------------------------

export interface SecurityItem {
  title: string;
  description: string;
}

export const SecurityGuardrails = ({ items }: { items: SecurityItem[] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!items || items.length === 0) return null;

  return (
    <section className="py-24 bg-[#0B1221] text-white relative overflow-hidden border-y border-[#1e293b]">
      {/* Background Accents */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#2563eb]/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:24px_24px] opacity-30 z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 bg-[#1e293b]/50 border border-white/10 px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm">
            <Lock size={14} className="text-[#60a5fa]" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-[#60a5fa]">
              ZERO_DATA_MOVEMENT
            </span>
          </div>
          <h2 className="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.1] mb-6">
            Architecturally impossible to mutate your production data.
          </h2>
          <p className="text-slate-400 text-lg font-medium leading-relaxed">
            Arcli operates on a strict Read-Only security model. We generate the execution logic, but your warehouse executes the compute. Your data never leaves your VPC.
          </p>
        </div>

        <div ref={ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div 
              key={i}
              style={{ transitionDelay: `${i * 150}ms` }}
              className={`bg-[#0f172a]/80 backdrop-blur-xl border border-[#1e293b] p-8 rounded-2xl hover:border-[#2563eb]/50 hover:bg-[#1e293b]/50 transition-all duration-500 group transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-[#2563eb]/20 transition-all duration-300">
                {i === 0 ? <ShieldCheck className="w-6 h-6 text-[#60a5fa]" /> : 
                 i === 1 ? <Database className="w-6 h-6 text-[#60a5fa]" /> : 
                 <Network className="w-6 h-6 text-[#60a5fa]" />}
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">{item.title}</h3>
              <p className="text-slate-400 leading-relaxed text-[15px] font-medium">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const ContrarianBanner = ({ statement, subtext }: { statement: string; subtext?: string }) => {
  const [ref, vis] = useVisible(0.2);

  if (!statement) return null;

  return (
    <section className="py-32 bg-slate-50 relative overflow-hidden">
      <div className="absolute -left-40 top-1/2 -translate-y-1/2 w-96 h-96 bg-[#2563eb]/5 rounded-full blur-[80px]" />
      <div className="absolute -right-40 top-1/2 -translate-y-1/2 w-96 h-96 bg-[#2563eb]/5 rounded-full blur-[80px]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative z-10 text-center">
        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`transition-all duration-1000 transform ${vis ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        >
          <div className="mx-auto w-16 h-16 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center mb-8">
            <AlertCircle className="w-8 h-8 text-[#2563eb]" />
          </div>
          <h2 className="text-[clamp(36px,5vw,56px)] font-black text-[#0B1221] tracking-tighter leading-[1.1] mb-8">
            "{statement}"
          </h2>
          {subtext && (
            <p className="text-slate-500 text-xl font-medium max-w-3xl mx-auto leading-relaxed">
              {subtext}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export interface StrategicScenarioProps {
  scenario: {
    title: string;
    description: string;
    dialect: string;
    sql: string;
    businessOutcome: string;
  }
}

export const StrategicQuery = ({ scenario }: StrategicScenarioProps) => {
  const [ref, vis] = useVisible(0.1);
  const [copied, setCopied] = useState(false);

  if (!scenario) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(scenario.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-24 bg-white relative border-y border-slate-200/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <SectionHeading 
          monoLabel="// STRATEGIC_SCENARIO"
          subtitle="How Arcli grounds AI in your exact schema to generate highly-optimized, dialect-specific execution logic."
        >
          Deep Data Retrieval
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid lg:grid-cols-2 gap-12 items-stretch transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* Context & ROI Side */}
          <div className="flex flex-col justify-center space-y-8">
            <div>
              <h3 className="text-3xl font-extrabold text-[#0B1221] tracking-tight mb-4">
                {scenario.title}
              </h3>
              <p className="text-slate-500 text-lg leading-relaxed font-medium">
                {scenario.description}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#2563eb]" />
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="w-5 h-5 text-[#2563eb]" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#0B1221]">
                  THE EXECUTIVE FILTER (ROI)
                </span>
              </div>
              <p className="text-[#0B1221] font-bold text-lg leading-snug">
                {scenario.businessOutcome}
              </p>
            </div>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#2563eb] shrink-0 mt-0.5" />
                <span className="text-slate-600 font-medium">Fully optimized for <strong className="text-[#0B1221]">{scenario.dialect}</strong> constraints.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#2563eb] shrink-0 mt-0.5" />
                <span className="text-slate-600 font-medium">Bypasses semantic layer hallucinations via strict schema grounding.</span>
              </li>
            </ul>
          </div>

          {/* Code Terminal Side */}
          <div className="bg-[#0B1221] rounded-2xl border border-[#1e293b] shadow-2xl flex flex-col overflow-hidden relative">
            {/* Terminal Header */}
            <div className="h-12 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between px-4">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-700" />
                <div className="w-3 h-3 rounded-full bg-slate-700" />
                <div className="w-3 h-3 rounded-full bg-slate-700" />
              </div>
              <div className="font-mono text-[10px] text-slate-400 font-bold tracking-[0.1em]">
                {scenario.dialect}_COMPILE
              </div>
              <button 
                onClick={handleCopy}
                className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
              >
                {copied ? 'COPIED!' : 'COPY'}
              </button>
            </div>
            
            {/* Terminal Body */}
            <div className="p-6 overflow-x-auto relative flex-1">
              {/* Subtle grid background for the terminal */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
              <pre className="font-mono text-sm leading-relaxed relative z-10 text-slate-300">
                <code>{scenario.sql}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const ExecutiveSummary = ({ highlights }: { highlights: { value: string; label: string }[] }) => {
  const [ref, vis] = useVisible(0.1);

  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="py-24 bg-white relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {highlights.map((stat, i) => (
            <div 
              key={i}
              style={{ transitionDelay: `${i * 100}ms` }}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center group hover:bg-white hover:border-[#2563eb]/30 hover:shadow-[0_10px_30px_-10px_rgba(37,99,235,0.15)] transition-all duration-500"
            >
              <div className="text-4xl md:text-5xl font-black text-[#0B1221] tracking-tighter mb-3 group-hover:scale-105 transition-transform duration-500">
                {stat.value}
              </div>
              <div className="font-mono text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};