// components/landing/seo-blocks-8.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  UserCheck, 
  EyeOff, 
  Fingerprint, 
  FileWarning, 
  Activity, 
  Server, 
  Zap, 
  Users, 
  Hourglass,
  ArrowRight,
  LockKeyhole,
  CheckCircle2,
  XCircle,
  BarChart4
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BLOCK DEFINITIONS (Arcli Block System Standards)
// ----------------------------------------------------------------------

export const GranularAccessControlDef = {
  id: "granular_access_control",
  purpose: "To prove to CISOs and Data Stewards that Arcli enforces strict, column-level security and data masking BEFORE execution, preventing AI from exposing PII.",
  capability: "Simulates an active policy enforcement engine. Shows the exact mechanism of how a natural language query is intercepted, evaluated against RBAC rules, and masked in real-time.",
  inputs: {
    title: "string",
    subtitle: "string",
    executiveOutcome: "string", // e.g., "Deploy AI to 10,000 employees without failing compliance audits."
    policies: "Array<{ role: string; permission: string; action: 'MASK' | 'BLOCK' | 'ALLOW'; target: string }>",
    auditSimulation: {
      userIntent: "string", // e.g., "Show me the top spenders including their emails."
      userRole: "string",
      interceptedQuery: "string",
      resolution: {
        status: "string", // e.g., "PARTIAL_REDACTION"
        message: "string",
        maskedOutput: "string"
      }
    }
  },
  ui: {
    layout: "Two-panel security dashboard. Left side lists the active cryptographic policies. Right side shows an interactive or animated audit log simulating a user query being intercepted and redacted.",
    hierarchy: "The 'Security Resolution' block is visually emphasized to show the system actively protecting data.",
    interaction: "Hovering over policy rules highlights the corresponding redaction in the audit log output."
  },
  usage: {
    whenToUse: [
      "On Enterprise, Security, and Compliance pages.",
      "To counter the objection: 'If we give our employees AI access to the database, they will see things they shouldn't.'",
      "For CISO and VP of Data Governance personas."
    ],
    whenNotToUse: [
      "On lightweight integration pages or developer-focused API documentation."
    ]
  }
};

export const ConcurrencyProofDef = {
  id: "elastic_concurrency_proof",
  purpose: "To dismantle the legacy warehouse model where high concurrency leads to query queueing, spin-up delays, and exponential cost spikes.",
  capability: "Provides a visual stress-test simulation. Contrasts traditional 'Warehouse Scaling' (slow, expensive) with Arcli's 'Edge Compute' (instant, flat).",
  inputs: {
    title: "string",
    subtitle: "string",
    legacyMetrics: {
      label: "string",
      queueTime: "string",
      costScaling: "string" // e.g., "Exponential ($45/hr per cluster)"
    },
    arcliMetrics: {
      label: "string",
      queueTime: "string", // e.g., "0ms (No Queueing)"
      costScaling: "string" // e.g., "Flat (Included)"
    },
    stressTestPhases: "Array<{ users: number; legacyStatus: string; arcliStatus: string }>"
  },
  ui: {
    layout: "A load-balancer dashboard. Top features contrasting metric cards. Bottom features a timeline/stepper showing system degradation in legacy vs. stability in Arcli.",
    hierarchy: "The 'Queue Time' and 'Cost' metrics are the primary visual anchors.",
    interaction: "A 'Run Simulation' pulse that progresses through the stressTestPhases, turning the legacy side red while Arcli stays green."
  },
  usage: {
    whenToUse: [
      "On Performance and Architecture pages.",
      "When comparing Arcli to Snowflake, Redshift, or BigQuery.",
      "To address objections about latency during peak reporting hours."
    ],
    whenNotToUse: [
      "When the narrative is focused purely on semantic modeling or AI accuracy."
    ]
  }
};

// ----------------------------------------------------------------------
// INTERFACES
// ----------------------------------------------------------------------

export interface GranularAccessControlProps {
  title: string;
  subtitle: string;
  executiveOutcome: string;
  policies: Array<{
    role: string;
    permission: string;
    action: 'MASK' | 'BLOCK' | 'ALLOW';
    target: string;
  }>;
  auditSimulation: {
    userIntent: string;
    userRole: string;
    interceptedQuery: string;
    resolution: {
      status: string;
      message: string;
      maskedOutput: string;
    };
  };
}

export interface ConcurrencyProofProps {
  title: string;
  subtitle: string;
  legacyMetrics: {
    label: string;
    queueTime: string;
    costScaling: string;
  };
  arcliMetrics: {
    label: string;
    queueTime: string;
    costScaling: string;
  };
  stressTestPhases: Array<{
    users: number;
    legacyStatus: string;
    arcliStatus: string;
  }>;
}

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

export const GranularAccessControl = ({ data }: { data: GranularAccessControlProps }) => {
  const [ref, vis] = useVisible(0.1);

  if (!data) return null;

  return (
    <section className="py-24 bg-[#0B1221] text-white relative border-y border-[#1e293b] overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 blur-[150px] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] opacity-30 z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="mb-16">
          <SectionHeading 
            monoLabel="// POLICY_ENFORCEMENT_ENGINE"
            subtitle={data.subtitle}
          >
            <span className="text-white">{data.title}</span>
          </SectionHeading>

          <div className={`max-w-3xl mx-auto mt-8 flex items-center justify-center gap-3 bg-indigo-500/10 border border-indigo-500/20 px-6 py-3 rounded-full transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <LockKeyhole className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-indigo-100">{data.executiveOutcome}</span>
          </div>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid lg:grid-cols-[400px_1fr] gap-8 transition-all duration-1000 delay-200 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEFT: Policy Matrix */}
          <div className="bg-[#0f172a] rounded-3xl border border-[#1e293b] p-6 shadow-2xl flex flex-col h-full">
            <div className="flex items-center gap-3 mb-8 border-b border-[#1e293b] pb-4">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-lg text-white">Active RBAC Policies</h3>
            </div>

            <div className="space-y-4 flex-grow">
              {data.policies.map((policy, idx) => (
                <div key={idx} className="bg-[#1e293b]/50 border border-[#334155] rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-slate-400" />
                      <span className="font-mono text-xs font-bold text-slate-300">{policy.role}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded uppercase tracking-widest ${
                      policy.action === 'MASK' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 
                      policy.action === 'BLOCK' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 
                      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {policy.action}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 font-medium">
                    {policy.permission} <strong className="text-white">{policy.target}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Audit & Execution Log */}
          <div className="bg-[#0B1221] rounded-3xl border border-[#1e293b] p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />

            <div className="flex justify-between items-center mb-8 border-b border-[#1e293b] pb-4 relative z-10">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-lg text-white">Live Interception Log</h3>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Monitoring</span>
              </div>
            </div>

            <div className="space-y-8 relative z-10 flex-grow">
              
              {/* Step 1: User Request */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-slate-600 border-[3px] border-[#0B1221] z-10" />
                <div className="absolute left-1.5 top-3 bottom-[-32px] w-[1px] bg-[#1e293b]" />
                
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <span>Input via Chat</span>
                  <span className="px-1.5 py-0.5 bg-[#1e293b] rounded text-slate-400">Role: {data.auditSimulation.userRole}</span>
                </div>
                <div className="bg-[#1e293b]/50 border border-[#334155] rounded-xl p-4 text-slate-300 font-medium italic">
                  "{data.auditSimulation.userIntent}"
                </div>
              </div>

              {/* Step 2: Policy Interception */}
              <div className="relative pl-8">
                <div className="absolute left-[-2px] top-1.5 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <div className="absolute left-1.5 top-3 bottom-[-32px] w-[1px] bg-[#1e293b]" />
                
                <div className="font-mono text-[10px] text-amber-400 uppercase tracking-widest mb-2 font-bold flex items-center gap-2">
                  <EyeOff className="w-3 h-3" /> Policy Triggered
                </div>
                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 font-mono text-xs text-slate-400">
                  <span className="text-indigo-400">SELECT</span> id, name, <span className="line-through decoration-rose-500 decoration-2 text-rose-400">email</span> <span className="text-indigo-400">FROM</span> customers...
                </div>
              </div>

              {/* Step 3: Resolution & Output */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-emerald-500 border-[3px] border-[#0B1221] z-10 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                
                <div className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest mb-2 font-bold">
                  {data.auditSimulation.resolution.status}
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-sm text-emerald-100/70 mb-3 font-medium">
                    {data.auditSimulation.resolution.message}
                  </p>
                  <pre className="font-mono text-sm text-slate-300 bg-[#0B1221] p-4 rounded-lg border border-[#1e293b] overflow-x-auto">
                    <code>{data.auditSimulation.resolution.maskedOutput}</code>
                  </pre>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};


export const ConcurrencyProof = ({ data }: { data: ConcurrencyProofProps }) => {
  const [ref, vis] = useVisible(0.2);
  const [activePhase, setActivePhase] = useState(0);

  // Auto-play the stress test animation
  useEffect(() => {
    if (vis) {
      const interval = setInterval(() => {
        setActivePhase((prev) => (prev + 1) % data.stressTestPhases.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [vis, data.stressTestPhases.length]);

  if (!data) return null;

  return (
    <section className="py-32 bg-white relative border-y border-slate-200/50 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <SectionHeading 
          monoLabel="// ELASTIC_COMPUTE_STRESS_TEST"
          subtitle={data.subtitle}
        >
          {data.title}
        </SectionHeading>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid md:grid-cols-2 gap-8 mb-12 transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* Legacy Warehouse Metrics */}
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-32 h-32 bg-slate-200/50 rounded-bl-full -z-10" />
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200">
              <Server className="w-6 h-6 text-slate-400" />
              <h3 className="text-xl font-bold text-[#0B1221]">{data.legacyMetrics.label}</h3>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Queue Time at Peak</div>
                <div className="text-3xl font-black text-[#0B1221] flex items-center gap-3">
                  {data.legacyMetrics.queueTime}
                  <Hourglass className="w-5 h-5 text-rose-500 animate-pulse" />
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Cost Scaling</div>
                <div className="text-lg font-bold text-rose-600 bg-rose-50 inline-block px-3 py-1 rounded border border-rose-100">
                  {data.legacyMetrics.costScaling}
                </div>
              </div>
            </div>
          </div>

          {/* Arcli Edge Metrics */}
          <div className="bg-[#0B1221] border border-[#1e293b] rounded-3xl p-8 relative overflow-hidden shadow-xl">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#2563eb]/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[#1e293b] relative z-10">
              <Zap className="w-6 h-6 text-[#2563eb]" />
              <h3 className="text-xl font-bold text-white">{data.arcliMetrics.label}</h3>
            </div>
            
            <div className="space-y-6 relative z-10">
              <div>
                <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Queue Time at Peak</div>
                <div className="text-3xl font-black text-white flex items-center gap-3">
                  {data.arcliMetrics.queueTime}
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Cost Scaling</div>
                <div className="text-lg font-bold text-emerald-400 bg-emerald-500/10 inline-block px-3 py-1 rounded border border-emerald-500/20">
                  {data.arcliMetrics.costScaling}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulation Stepper */}
        <div className={`bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-[0_20px_40px_-15px_rgba(11,18,33,0.05)] transition-all duration-1000 delay-300 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-[#2563eb]" />
              <h4 className="font-bold text-lg text-[#0B1221] tracking-tight">Live Concurrency Stress Test</h4>
            </div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <BarChart4 className="w-4 h-4" /> Auto-Running
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-6 left-12 right-12 h-[2px] bg-slate-100 z-0" />

            {data.stressTestPhases.map((phase, idx) => {
              const isActive = activePhase === idx;
              const isPast = activePhase > idx;
              const isLegacyFailing = phase.legacyStatus.toLowerCase().includes('queue') || phase.legacyStatus.toLowerCase().includes('timeout');

              return (
                <div key={idx} className="relative z-10 flex flex-col items-center text-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500 ${
                    isActive ? 'bg-[#2563eb] text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-110' : 
                    isPast ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-200 text-slate-300'
                  }`}>
                    <Users className="w-5 h-5" />
                  </div>
                  
                  <div className={`font-black text-xl mb-1 tracking-tight transition-colors duration-500 ${isActive ? 'text-[#0B1221]' : 'text-slate-400'}`}>
                    {phase.users.toLocaleString()}
                  </div>
                  <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Concurrent Queries</div>

                  {/* Status Indicators */}
                  <div className={`w-full p-3 rounded-xl border transition-all duration-500 text-sm font-medium mb-2 ${
                    isActive 
                      ? isLegacyFailing 
                        ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm' 
                        : 'bg-slate-50 border-slate-200 text-slate-600 shadow-sm'
                      : 'bg-transparent border-transparent text-slate-400 opacity-50'
                  }`}>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex justify-center items-center gap-1">
                      <Server className="w-3 h-3" /> Legacy
                    </div>
                    {isActive ? (
                      <span className="flex justify-center items-center gap-1.5">
                        {isLegacyFailing && <XCircle className="w-4 h-4 text-rose-500" />}
                        {phase.legacyStatus}
                      </span>
                    ) : '...'}
                  </div>

                  <div className={`w-full p-3 rounded-xl border transition-all duration-500 text-sm font-medium ${
                    isActive 
                      ? 'bg-blue-50/50 border-blue-200 text-[#0B1221] shadow-sm'
                      : 'bg-transparent border-transparent text-slate-400 opacity-50'
                  }`}>
                     <div className="text-[10px] uppercase font-bold text-[#2563eb] mb-1 flex justify-center items-center gap-1">
                      <Zap className="w-3 h-3" /> Arcli
                    </div>
                    {isActive ? (
                       <span className="flex justify-center items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#2563eb]" />
                        {phase.arcliStatus}
                      </span>
                    ) : '...'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};