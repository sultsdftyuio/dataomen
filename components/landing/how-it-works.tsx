// components/landing/how-it-works.tsx
'use client';

import React from 'react';
import { 
  Database, 
  Search, 
  Bot, 
  ArrowRight, 
  CheckCircle2, 
  Workflow, 
  AlertCircle,
  Sparkles,
  TerminalSquare,
  Activity,
  LineChart
} from 'lucide-react';

const STEPS = [
  {
    id: "01",
    title: "Connect & Harmonize",
    description: "Plug in your tools in seconds. Arcli’s semantic engine automatically maps chaotic, disjointed API fields into a unified, strictly-typed business layer. Zero rigid ETL pipelines required.",
    icon: <Database className="w-5 h-5" />,
    mockup: (
      <div className="relative rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md overflow-hidden shadow-sm group-hover:shadow-xl group-hover:shadow-blue-900/5 group-hover:border-slate-300/80 transition-all duration-500">
        {/* Subtle top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500 opacity-20" />
        
        <div className="bg-slate-50/50 border-b border-slate-100/80 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TerminalSquare className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Semantic Router</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50/80 border border-emerald-100/50 px-2 py-1 rounded uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3" /> Synced
          </span>
        </div>
        
        <div className="p-6 space-y-5 relative">
          {/* Ambient background glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10 group/item">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50/50 border border-indigo-100/50 flex items-center justify-center text-xs font-bold text-indigo-600 shadow-sm transition-transform group-hover/item:scale-105">St</div>
              <div>
                <div className="text-sm font-bold text-slate-900 tracking-tight">Stripe MRR</div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">api.amount</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 px-3 py-1.5 rounded-lg shadow-sm">
              Global Revenue
            </div>
          </div>
          
          <div className="flex items-center justify-between relative z-10 group/item">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50/50 border border-emerald-100/50 flex items-center justify-center text-xs font-bold text-emerald-600 shadow-sm transition-transform group-hover/item:scale-105">Sh</div>
              <div>
                <div className="text-sm font-bold text-slate-900 tracking-tight">Shopify Sales</div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">api.total_price</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 px-3 py-1.5 rounded-lg shadow-sm">
              Global Revenue
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "02",
    title: "Explore & Ask",
    description: "Bypass the SQL editor entirely. Invoke the omniscient command palette to ask plain-English questions, or click any anomalous dashboard chart to instantly spawn a root-cause investigation.",
    icon: <Search className="w-5 h-5" />,
    mockup: (
      <div className="relative rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md overflow-hidden shadow-sm group-hover:shadow-xl group-hover:shadow-blue-900/5 group-hover:border-slate-300/80 transition-all duration-500">
        <div className="bg-slate-50/50 border-b border-slate-100/80 px-5 py-3.5 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Omniscient Chat</span>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200/60 flex-shrink-0" />
            <div className="bg-white border border-slate-200/60 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-600 shadow-sm leading-relaxed">
              Why did <span className="font-semibold text-slate-900">European revenue</span> dip last week?
            </div>
          </div>
          <div className="flex gap-3 items-start relative">
            <div className="absolute -left-2 top-4 w-px h-12 bg-gradient-to-b from-blue-200 to-transparent" />
            <div className="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center shadow-md shadow-blue-600/20 z-10">
              <Search className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#F8FAFC] border border-blue-100/60 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-700 shadow-sm leading-relaxed relative overflow-hidden flex-1">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <div className="flex items-center gap-2 mb-2">
                <LineChart className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-blue-900 tracking-tight">Insight Generated</span>
              </div>
              I found a <span className="font-semibold text-rose-600">14% drop</span> in EU conversions. This correlates exactly with a spike in Zendesk payment-failure tickets.
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "03",
    title: "Automate & Guard",
    description: "Deploy autonomous AI watchdogs. When Arcli detects a statistically significant variance, it immediately routes a high-signal, deduplicated alert directly to your team—before you even log in.",
    icon: <Bot className="w-5 h-5" />,
    mockup: (
      <div className="relative rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md overflow-hidden shadow-sm group-hover:shadow-xl group-hover:shadow-blue-900/5 group-hover:border-slate-300/80 transition-all duration-500">
        <div className="bg-slate-50/50 border-b border-slate-100/80 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Pulse Monitor</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50/80 border border-rose-100/50 px-2 py-1 rounded uppercase tracking-widest">
            <AlertCircle className="w-3 h-3" /> Live
          </span>
        </div>
        <div className="p-6">
          <div className="border-l-2 border-rose-500 pl-4 py-1 mb-5">
            <h4 className="text-sm font-bold text-slate-900 mb-1 tracking-tight">Cart Abandonment Spike</h4>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">85% CONFIDENCE • 15K EVENT SAMPLE</p>
          </div>
          <div className="bg-[#0B1120] rounded-xl p-4 text-[13px] font-mono shadow-inner border border-slate-800">
            <span className="text-slate-500">{"{"}</span>
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"variance"</span>: <span className="text-rose-400">"+40%"</span>,
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"baseline"</span>: <span className="text-emerald-300">"7-day avg"</span>,
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"action"</span>: <span className="text-slate-300">"Slack routed"</span>
            <br />
            <span className="text-slate-500">{"}"}</span>
          </div>
        </div>
      </div>
    )
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-white relative overflow-hidden">
      {/* Engineered Background Grid (Consistent with Features) */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          {/* Left Column: Sticky Header */}
          <div className="lg:w-[40%] flex-shrink-0">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50/80 border border-blue-100/80 mb-6 backdrop-blur-sm">
                <Workflow className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900 tracking-tight">The Pipeline</span>
              </div>
              {/* Elegant Two-Tone Heading mapping to Features */}
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight leading-[1.1]">
                How Arcli thinks.<br />
                <span className="text-slate-400 font-medium">From chaos to clarity.</span>
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-md">
                A seamless transition from raw, disjointed data to proactive business intelligence. Built for velocity, engineered for absolute precision.
              </p>
            </div>
          </div>

          {/* Right Column: Engineered Steps */}
          <div className="lg:w-[60%]">
            <div className="relative border-l border-slate-200/60 pl-8 md:pl-14 space-y-24 md:space-y-32">
              
              {STEPS.map((step, index) => (
                <div key={index} className="relative group">
                  {/* Timeline Node - Refined and structural */}
                  <div className="absolute -left-[49px] md:-left-[81px] top-0 w-10 h-10 md:w-12 md:h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center group-hover:border-blue-300 group-hover:bg-blue-50/50 transition-all duration-500 z-10 shadow-sm group-hover:shadow-blue-500/10">
                    <span className="text-slate-400 group-hover:text-blue-600 transition-colors duration-500">
                      {step.icon}
                    </span>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-8 xl:gap-12 items-start">
                    {/* Text Content */}
                    <div className="flex-1 pt-1">
                      <div className="text-[11px] font-bold text-blue-600 mb-3 tracking-widest uppercase">Phase {step.id}</div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">{step.title}</h3>
                      <p className="text-slate-600 leading-relaxed text-base">
                        {step.description}
                      </p>
                    </div>

                    {/* UI Mockup Panel */}
                    <div className="w-full xl:w-[400px] flex-shrink-0">
                      <div className="transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-700 ease-out">
                        {step.mockup}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Glowing active state indicator line */}
              <div className="absolute left-[-1px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}