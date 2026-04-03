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
  TerminalSquare
} from 'lucide-react';

const STEPS = [
  {
    id: "01",
    title: "Connect & Harmonize",
    description: "Plug in your tools in seconds. Arcli’s semantic engine automatically resolves messy API data (like Shopify 'total' vs. Stripe 'amount') into clean, trustworthy business metrics. Zero ETL pipelines required.",
    icon: <Database className="w-5 h-5" />,
    mockup: (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:shadow-[0_8px_30px_rgb(37,99,235,0.08)] transition-all duration-500">
        <div className="bg-[#F8FAFC] border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Semantic Sync</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md uppercase tracking-wide">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        </div>
        <div className="p-5 space-y-4 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full opacity-50 pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">St</div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">Stripe MRR</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-[#F8FAFC] border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              Canonical Revenue
            </div>
          </div>
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">Sh</div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">Shopify Sales</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-xs font-semibold text-slate-700 bg-[#F8FAFC] border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              Canonical Revenue
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "02",
    title: "Explore & Ask",
    description: "Drop the SQL editor. Press Cmd+K to ask complex questions in plain English, or click directly on any anomalous data point in your dashboard to instantly launch a root-cause investigation.",
    icon: <Search className="w-5 h-5" />,
    mockup: (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:shadow-[0_8px_30px_rgb(37,99,235,0.08)] transition-all duration-500">
        <div className="bg-[#F8FAFC] border-b border-slate-100 px-4 py-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Omniscient Chat</span>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex-shrink-0" />
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl rounded-tl-none px-4 py-2.5 text-sm text-slate-700 shadow-sm leading-relaxed">
              Why did European revenue dip last week?
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center shadow-sm">
              <Search className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl rounded-tl-none px-4 py-3 text-sm text-blue-900 shadow-sm leading-relaxed relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <span className="font-bold block mb-1 tracking-tight">Scanning Omni-Graph...</span>
              I found a 14% drop in EU conversions. This correlates directly with a spike in Zendesk payment failure tickets.
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "03",
    title: "Automate & Guard",
    description: "Deploy autonomous AI agents to watch your metrics 24/7. When Pulse detects a statistically significant variance, it sends a high-signal, deduplicated alert directly to Slack.",
    icon: <Bot className="w-5 h-5" />,
    mockup: (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:shadow-[0_8px_30px_rgb(37,99,235,0.08)] transition-all duration-500">
        <div className="bg-[#F8FAFC] border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pulse Monitor</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-1 rounded-md uppercase tracking-wide">
            <AlertCircle className="w-3 h-3" /> Live
          </span>
        </div>
        <div className="p-5">
          <div className="border-l-2 border-rose-500 pl-4 py-1 mb-5">
            <h4 className="text-base font-bold text-slate-900 mb-1 tracking-tight">Cart Abandonment Spike</h4>
            <p className="text-xs text-slate-500 font-medium">85% confidence score • 15k event sample</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 text-[13px] text-emerald-400 font-mono shadow-inner">
            <span className="text-slate-500">{"{"}</span>
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"variance"</span>: <span className="text-rose-400">"+40%"</span>,
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"baseline"</span>: <span className="text-amber-300">"7-day avg"</span>,
            <br />
            &nbsp;&nbsp;<span className="text-blue-300">"action"</span>: <span className="text-amber-300">"Slack routed"</span>
            <br />
            <span className="text-slate-500">{"}"}</span>
          </div>
        </div>
      </div>
    )
  }
];

// Helper Icon for the Pulse Monitor mockup
function Activity(props: React.SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-white relative overflow-hidden">
      {/* Engineered Background Grid to match Features */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          {/* Left Column: Sticky Header */}
          <div className="lg:w-1/3 flex-shrink-0">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-6">
                <Workflow className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900 tracking-tight">The Pipeline</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight leading-[1.1]">
                How Arcli thinks.
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed mb-8">
                A seamless transition from raw, chaotic data to proactive business intelligence. Built for velocity, engineered for absolute precision.
              </p>
            </div>
          </div>

          {/* Right Column: Steps */}
          <div className="lg:w-2/3">
            <div className="relative border-l border-slate-200 pl-8 md:pl-12 space-y-20 md:space-y-32">
              
              {STEPS.map((step, index) => (
                <div key={index} className="relative group">
                  {/* Timeline Node */}
                  <div className="absolute -left-[49px] md:-left-[65px] top-0 w-10 h-10 md:w-12 md:h-12 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-center group-hover:border-blue-300 group-hover:bg-blue-50 transition-colors duration-300 z-10 shadow-sm">
                    <span className="text-slate-400 group-hover:text-blue-600 transition-colors duration-300">
                      {step.icon}
                    </span>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-8 items-start">
                    {/* Text Content */}
                    <div className="flex-1">
                      <div className="text-xs font-bold text-blue-600 mb-3 tracking-widest uppercase">Step {step.id}</div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">{step.title}</h3>
                      <p className="text-slate-600 leading-relaxed text-base">
                        {step.description}
                      </p>
                    </div>

                    {/* UI Mockup */}
                    <div className="w-full xl:w-[380px] flex-shrink-0">
                      <div className="transform translate-y-2 opacity-95 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out">
                        {step.mockup}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Faint connecting line overlay for active state logic */}
              <div className="absolute left-[-1px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}