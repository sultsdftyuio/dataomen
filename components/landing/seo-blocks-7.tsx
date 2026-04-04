// components/landing/seo-blocks-7.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  TrendingDown, 
  Coins, 
  Server, 
  Database, 
  Zap, 
  ArrowRight, 
  Wand2, 
  Braces, 
  CheckCircle2, 
  Network,
  Cpu,
  Layers
} from 'lucide-react';

import { useVisible } from "@/hooks/useVisible";
import { SectionHeading } from './seo-blocks-1';

// ----------------------------------------------------------------------
// BLOCK DEFINITIONS (Arcli Block System Standards)
// ----------------------------------------------------------------------

export const DataGravityCostDef = {
  id: "data_gravity_cost_calculator",
  purpose: "To financially quantify the architectural advantage of Zero-Data Movement. Exposes the 'hidden taxes' of legacy ETL stacks.",
  capability: "Introduces a comparative financial breakdown. Shifts the conversation from 'features' to 'Total Cost of Ownership (TCO)' and engineering overhead.",
  inputs: {
    title: "string",
    subtitle: "string",
    executiveSummary: "string",
    legacyStack: {
      name: "string",
      lineItems: "Array<{ tool: string; cost: string; iconType: string }>",
      totalMonthly: "string"
    },
    arcliStack: {
      name: "string",
      lineItems: "Array<{ benefit: string; cost: string }>",
      totalMonthly: "string"
    },
    savingsHighlight: "string"
  },
  ui: {
    layout: "Two side-by-side receipt/invoice style cards. Legacy on the left (red/warning accents), Arcli on the right (emerald/success accents).",
    hierarchy: "The 'Total Savings' metric acts as a floating badge or footer that ties the two columns together.",
    interaction: "Staggered reveal of line items, simulating a receipt printing or calculating."
  },
  usage: {
    whenToUse: [
      "On pricing pages to justify Arcli's value.",
      "On 'vs Snowflake' or 'vs Fivetran' competitor comparison pages.",
      "For CFO / VP Finance buyer personas."
    ],
    whenNotToUse: [
      "On highly technical API documentation pages where developers don't care about the billing breakdown."
    ]
  }
};

export const DynamicSchemaMappingDef = {
  id: "dynamic_schema_mapping",
  purpose: "Proves that Arcli doesn't require months of dbt modeling to be useful. Visually demonstrates instant inference of messy raw data into queryable semantic models.",
  capability: "Provides a structural transformation proof. Shows the 'Before & After' of data modeling happening in real-time without user intervention.",
  inputs: {
    title: "string",
    description: "string",
    rawSource: {
      systemName: "string", // e.g., "Stripe API (Raw)"
      messyObjects: "string[]" // e.g., ["obj_charge_x7", "metadata_jsonb"]
    },
    arcliEngine: {
      timeToMap: "string", // e.g., "420ms"
      actions: "string[]" // e.g., ["Flatten JSON", "Infer Types", "Resolve Joins"]
    },
    semanticOutput: {
      modelName: "string", // e.g., "dim_customers"
      cleanFields: "Array<{ name: string; type: string }>"
    }
  },
  ui: {
    layout: "A 3-stage horizontal pipeline (Raw -> Engine -> Semantic).",
    hierarchy: "Raw data is chaotic/monospaced. The Engine is a pulsing, glowing core. The Semantic output is clean, enterprise-grade UI.",
    interaction: "Flow animation (particles or lines) moving from left to right, triggering the resolution of the clean fields."
  },
  usage: {
    whenToUse: [
      "On integration-specific pages (e.g., Salesforce, Shopify) to show how we handle their notoriously bad schemas.",
      "To counter objections about setup time and data engineering prerequisites."
    ],
    whenNotToUse: [
      "If the user is bringing a perfectly modeled database (e.g., they already use dbt and just want to query it)."
    ]
  }
};

// ----------------------------------------------------------------------
// INTERFACES
// ----------------------------------------------------------------------

export interface DataGravityCostProps {
  title: string;
  subtitle: string;
  executiveSummary: string;
  legacyStack: {
    name: string;
    lineItems: Array<{ tool: string; cost: string }>;
    totalMonthly: string;
  };
  arcliStack: {
    name: string;
    lineItems: Array<{ benefit: string; cost: string }>;
    totalMonthly: string;
  };
  savingsHighlight: string;
}

export interface DynamicSchemaMappingProps {
  title: string;
  description: string;
  rawSource: {
    systemName: string;
    messyObjects: string[];
  };
  arcliEngine: {
    timeToMap: string;
    actions: string[];
  };
  semanticOutput: {
    modelName: string;
    cleanFields: Array<{ name: string; type: string }>;
  };
}

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

export const DataGravityCost = ({ data }: { data: DataGravityCostProps }) => {
  const [ref, vis] = useVisible(0.1);

  if (!data) return null;

  return (
    <section className="py-24 bg-slate-50 relative border-y border-slate-200/50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40 z-0" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <SectionHeading 
          monoLabel="// TOTAL_COST_OF_OWNERSHIP"
          subtitle={data.subtitle}
        >
          {data.title}
        </SectionHeading>

        <div className="max-w-3xl mx-auto mb-16 text-center relative z-10">
          <div className="inline-flex items-center gap-3 bg-white border border-slate-200 shadow-sm px-6 py-3 rounded-2xl">
            <TrendingDown className="w-5 h-5 text-emerald-500" />
            <p className="text-[#0B1221] font-bold text-lg">
              {data.executiveSummary}
            </p>
          </div>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`grid md:grid-cols-2 gap-8 max-w-5xl mx-auto transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* LEGACY STACK (The Tax) */}
          <div className="bg-white rounded-3xl border border-rose-100 shadow-[0_20px_40px_-15px_rgba(225,29,72,0.05)] p-8 relative overflow-hidden flex flex-col group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-full -z-10" />
            
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center border border-rose-100">
                <Database className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-[#0B1221] tracking-tight">{data.legacyStack.name}</h3>
                <span className="font-mono text-[10px] uppercase font-bold text-rose-500 tracking-widest">Data Movement Tax</span>
              </div>
            </div>

            <div className="space-y-4 mb-10 flex-grow">
              {data.legacyStack.lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 rounded-xl border border-slate-100 bg-slate-50 group-hover:border-rose-100 transition-colors duration-300">
                  <span className="text-slate-600 font-medium">{item.tool}</span>
                  <span className="font-mono font-bold text-[#0B1221]">{item.cost}</span>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-rose-100 flex justify-between items-end">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Estimated Monthly</span>
              <span className="text-4xl font-black text-[#0B1221] tracking-tighter">{data.legacyStack.totalMonthly}</span>
            </div>
          </div>

          {/* ARCLI STACK (The Solution) */}
          <div className="bg-[#0B1221] rounded-3xl border border-[#1e293b] shadow-2xl p-8 relative overflow-hidden flex flex-col group">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#2563eb]/10 rounded-full blur-[80px] pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-[#2563eb]/20 flex items-center justify-center border border-[#2563eb]/30">
                <Zap className="w-6 h-6 text-[#60a5fa]" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">{data.arcliStack.name}</h3>
                <span className="font-mono text-[10px] uppercase font-bold text-[#60a5fa] tracking-widest">Zero-Movement Engine</span>
              </div>
            </div>

            <div className="space-y-4 mb-10 flex-grow relative z-10">
              {data.arcliStack.lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 rounded-xl border border-[#1e293b] bg-[#0f172a]/50 group-hover:border-[#2563eb]/30 transition-colors duration-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-300 font-medium">{item.benefit}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">{item.cost}</span>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-[#1e293b] flex justify-between items-end relative z-10">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Flat Platform Fee</span>
              <span className="text-4xl font-black text-white tracking-tighter">{data.arcliStack.totalMonthly}</span>
            </div>
          </div>
        </div>

        {/* Floating Savings Badge */}
        <div className={`mt-12 flex justify-center transition-all duration-1000 delay-500 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="bg-emerald-50 border border-emerald-200 shadow-lg px-8 py-4 rounded-full flex items-center gap-4">
            <Coins className="w-6 h-6 text-emerald-600" />
            <span className="text-[#0B1221] font-bold text-xl">
              {data.savingsHighlight}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};


export const DynamicSchemaMapping = ({ data }: { data: DynamicSchemaMappingProps }) => {
  const [ref, vis] = useVisible(0.2);

  if (!data) return null;

  return (
    <section className="py-32 bg-white relative border-y border-slate-200/50 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-20">
          <SectionHeading 
            monoLabel="// DYNAMIC_SCHEMA_INFERENCE"
            subtitle={data.description}
          >
            {data.title}
          </SectionHeading>
        </div>

        <div 
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`relative grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center transition-all duration-1000 transform ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}
        >
          
          {/* LEFT: Raw Messy Source */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl relative flex flex-col h-full">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-slate-500" />
                <span className="font-mono text-sm font-bold text-slate-300 tracking-widest uppercase">{data.rawSource.systemName}</span>
              </div>
              <span className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded text-[10px] font-mono text-rose-400 uppercase font-bold">Unoptimized</span>
            </div>

            <div className="space-y-3 font-mono text-xs flex-grow">
              {data.rawSource.messyObjects.map((obj, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-400 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <Braces className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <span className="break-all">{obj}</span>
                </div>
              ))}
              <div className="text-slate-600 italic mt-4 pl-2">... + 142 nested tables</div>
            </div>
          </div>

          {/* MIDDLE: Arcli Inference Engine */}
          <div className="flex flex-col items-center justify-center py-8 relative">
            {/* Animated Connector Lines */}
            <div className="hidden lg:block absolute right-1/2 top-1/2 w-[200%] h-[2px] bg-gradient-to-r from-slate-200 via-[#2563eb] to-emerald-200 -translate-y-1/2 -z-10" />
            
            <div className="bg-white border-4 border-[#2563eb]/20 shadow-[0_0_40px_rgba(37,99,235,0.2)] rounded-3xl p-6 w-64 text-center relative z-10 group">
              <div className="absolute inset-0 bg-[#2563eb]/5 rounded-3xl group-hover:bg-[#2563eb]/10 transition-colors" />
              
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#2563eb] to-blue-400 rounded-2xl flex items-center justify-center shadow-lg mb-4 relative">
                <div className="absolute inset-0 bg-white/20 rounded-2xl animate-ping" />
                <Cpu className="w-8 h-8 text-white relative z-10" />
              </div>
              
              <h4 className="font-black text-[#0B1221] text-lg mb-1 tracking-tight">Auto-Inference</h4>
              <div className="font-mono text-[10px] text-[#2563eb] font-bold uppercase tracking-widest mb-6">
                Latency: {data.arcliEngine.timeToMap}
              </div>

              <div className="space-y-2 text-left">
                {data.arcliEngine.actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-100 p-2 rounded shadow-sm">
                    <Wand2 className="w-3 h-3 text-[#2563eb]" />
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Clean Semantic Model */}
          <div className="bg-white rounded-3xl border border-emerald-100 p-8 shadow-[0_20px_40px_-15px_rgba(16,185,129,0.1)] relative flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-10" />

            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-[#0B1221] text-lg tracking-tight">{data.semanticOutput.modelName}</span>
              </div>
              <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-mono text-emerald-600 uppercase font-bold">Query Ready</span>
            </div>

            <div className="space-y-3 flex-grow">
              <div className="grid grid-cols-[1fr_auto] gap-4 mb-2 px-2">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-widest">Resolved Field</span>
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-widest">Type</span>
              </div>
              
              {data.semanticOutput.cleanFields.map((field, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors group">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="font-bold text-[#0B1221] text-sm">{field.name}</span>
                  </div>
                  <span className="font-mono text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 font-bold group-hover:bg-emerald-100 transition-colors">
                    {field.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};