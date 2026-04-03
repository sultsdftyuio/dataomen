// components/landing/how-it-works.tsx
'use client';

import React from 'react';
import { 
  Database, 
  Terminal, 
  Activity, 
  ArrowRight, 
  CheckCircle2, 
  Workflow, 
  Sparkles,
  TerminalSquare,
  BellRing
} from 'lucide-react';

const STEPS = [
  {
    id: "01",
    title: "Connect & Harmonize",
    description: "Plug in your tools in seconds. DataOmen’s semantic engine automatically maps chaotic, disjointed API fields into a unified, strictly-typed business layer. Zero rigid ETL pipelines required.",
    icon: <Database className="w-5 h-5" />,
    mockup: (
      <div className="relative rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-500 overflow-hidden">
        <div className="bg-[#F8FAFC] border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TerminalSquare className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Semantic Sync</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3" /> Synced
          </span>
        </div>
        <div className="p-6 space-y-5 relative">
          <div className="flex items-center justify-between relative z-10 group/item">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shadow-sm transition-transform group-hover/item:scale-105">St</div>
              <div>
                <div className="text-sm font-bold text-slate-900 tracking-tight">Stripe MRR</div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">api.amount</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              Canonical Revenue
            </div>
          </div>
          <div className="flex items-center justify-between relative z-10 group/item">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-600 shadow-sm transition-transform group-hover/item:scale-105">Sh</div>
              <div>
                <div className="text-sm font-bold text-slate-900 tracking-tight">Shopify Sales</div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">api.total_price</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              Canonical Revenue
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "02",
    title: "AI Data Analyst",
    description: "Stop waiting on data tickets. Ask it yourself. DataOmen's AI understands your unique business context. Simply type your question in plain English, and it instantly translates it into perfectly optimized SQL.",
    icon: <Sparkles className="w-5 h-5" />,
    mockup: (
      <div className="bg-[#0B1121] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col group-hover:shadow-[0_8px_30px_rgb(37,99,235,0.15)] transition-all duration-500">
        {/* Mockup Header: NL Input */}
        <div className="bg-slate-900/80 border-b border-slate-800 p-4 sm:p-5 flex gap-3 items-start">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-blue-600/20">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="text-slate-200 text-sm font-medium leading-relaxed">
            "Show me total revenue by month for captured transactions."
          </div>
        </div>
        
        {/* Mockup Body: SQL Output */}
        <div className="p-4 sm:p-6 font-mono text-[12px] leading-loose overflow-x-auto">
          <div className="text-slate-500 mb-4 flex items-center gap-2 border-b border-slate-800/50 pb-2">
            <Terminal className="w-3.5 h-3.5" /> 
            <span className="text-[10px] uppercase tracking-widest font-semibold">Generated SQL</span>
          </div>
          <div>
            <span className="text-pink-400 font-semibold">SELECT</span>{' '}
            <span className="text-emerald-300">date_trunc</span>(<span className="text-amber-300">'month'</span>, created_at),<br />
            &nbsp;&nbsp;<span className="text-pink-400 font-semibold">SUM</span>(amount){' '}
            <span className="text-pink-400 font-semibold">AS</span> total_revenue<br />
            <span className="text-pink-400 font-semibold">FROM</span>{' '}
            <span className="text-blue-300">core_transactions</span><br />
            <span className="text-pink-400 font-semibold">WHERE</span> status ={' '}
            <span className="text-amber-300">'captured'</span><br />
            <span className="text-pink-400 font-semibold">GROUP BY</span>{' '}
            <span className="text-purple-300">1</span>{' '}
            <span className="text-pink-400 font-semibold">ORDER BY</span>{' '}
            <span className="text-purple-300">1</span>{' '}
            <span className="text-blue-400 font-semibold">DESC</span>;
          </div>
        </div>
      </div>
    )
  },
  {
    id: "03",
    title: "Proactive Monitoring",
    description: "Know before your customers do. Don't stare at dashboards waiting for lines to drop. DataOmen watches your metrics 24/7. If conversion rates dip or API errors spike, you get an immediate alert with the root cause diagnosed.",
    icon: <BellRing className="w-5 h-5" />,
    mockup: (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-6 relative overflow-hidden group-hover:border-rose-300 transition-all duration-500">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
        
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </div>
            <span className="text-[11px] font-bold text-slate-900 tracking-widest uppercase">Critical Variance</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Just now</span>
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">Checkout Conversion Drop</h3>
        <p className="text-slate-600 text-sm mb-5 leading-relaxed">
          Conversion rates dipped <span className="font-semibold text-rose-600">18%</span> in the last hour compared to the 7-day rolling baseline.
        </p>

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Root Cause Diagnosis</div>
          <div className="flex items-start gap-3">
            <Activity className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-700 font-medium leading-relaxed">
              Detected an isolated spike in <code className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-[11px] font-bold">503 API Errors</code> from the Stripe checkout gateway.
            </p>
          </div>
        </div>
      </div>
    )
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-[#F8FAFC] relative overflow-hidden border-t border-slate-200">
      {/* Engineered Background Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          {/* Left Column: Sticky Header */}
          <div className="lg:w-[40%] flex-shrink-0">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/50 border border-blue-200/60 mb-6 backdrop-blur-sm">
                <Workflow className="w-4 h-4 text-blue-700" />
                <span className="text-xs font-bold text-blue-900 tracking-widest uppercase">The Pipeline</span>
              </div>
              
              {/* Elegant Two-Tone Heading */}
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight leading-[1.1]">
                How DataOmen thinks.<br />
                <span className="text-slate-400 font-medium">From chaos to clarity.</span>
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-md">
                A seamless transition from raw, disjointed data to proactive business intelligence. Built for velocity, engineered for absolute precision.
              </p>
            </div>
          </div>

          {/* Right Column: Engineered Steps */}
          <div className="lg:w-[60%]">
            <div className="relative border-l border-slate-200/80 pl-8 md:pl-14 space-y-24 md:space-y-32">
              
              {STEPS.map((step, index) => (
                <div key={index} className="relative group">
                  {/* Timeline Node */}
                  <div className="absolute -left-[49px] md:-left-[81px] top-0 w-10 h-10 md:w-12 md:h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center group-hover:border-blue-400 group-hover:bg-blue-50 transition-all duration-500 z-10 shadow-sm group-hover:shadow-blue-500/10">
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
                    <div className="w-full xl:w-[420px] flex-shrink-0">
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