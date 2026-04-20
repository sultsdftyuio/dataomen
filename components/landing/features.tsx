// components/landing/features.tsx
'use client';

import React from 'react';
import { 
  Network, 
  Activity, 
  MessageSquare, 
  ShieldCheck, 
  FileText,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export function Features() {
  return (
    <section className="py-24 bg-[#FAFAFA] relative overflow-hidden border-t border-black/10" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      {/* Subtle Engineering Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '28px 28px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        {/* Header Section */}
        <div className="max-w-3xl mb-14">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-black/10 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-slate-700" />
            <span className="text-xs font-semibold text-slate-700 tracking-[0.04em] uppercase">The Arcli Engine</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-5 tracking-tight leading-[1.12]">
            Enterprise intelligence.<br />
            <span className="text-slate-500 font-medium">Zero engineering required.</span>
          </h2>
          <p className="text-slate-600 text-base leading-relaxed max-w-2xl">
            We’ve hidden the complexity of data pipelines, metric governance, and AI orchestration so your team can focus entirely on making decisions.
          </p>
        </div>

        {/* Engineered Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 auto-rows-[minmax(220px,auto)]">
          
          {/* Phase 1: Omni-Graph (Large Feature) */}
          <div className="group relative overflow-hidden rounded-lg bg-white border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-200 md:col-span-2 lg:col-span-2 p-6 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-bl from-slate-100 to-transparent opacity-70 rounded-bl-[80px] pointer-events-none" />
            
            <div className="mb-6">
              <div className="w-9 h-9 rounded-md bg-slate-50 border border-black/10 flex items-center justify-center mb-4 text-slate-700">
                <Network className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
                Cross-Platform Insights
              </h3>
              <p className="text-slate-600 leading-relaxed text-sm max-w-md">
                Arcli automatically connects the dots across your tools. See how Stripe revenue churn correlates with active Zendesk tickets—instantly, without writing a single pipeline or waiting for data engineers.
              </p>
            </div>

            {/* Simulated UI component inside the bento box */}
            <div className="mt-auto p-3 rounded-md border border-black/10 bg-[#FAFAFA] flex items-center justify-between">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-700">St</div>
                <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center text-[10px] font-semibold text-slate-700">Zd</div>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">Omni-Graph Active</span>
            </div>
          </div>

          {/* Phase 5: Pulse Mode (Tall Feature) */}
          <div className="group relative overflow-hidden rounded-lg bg-white border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-200 md:col-span-1 lg:col-span-1 lg:row-span-2 p-6 flex flex-col">
            <div className="w-9 h-9 rounded-md bg-slate-50 border border-black/10 flex items-center justify-center mb-4 text-slate-700">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
              Proactive Pulse Alerts
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm mb-6 flex-1">
              Arcli watches your metrics 24/7. If cart abandonments spike, you receive an instant, intelligent alert complete with root-cause analysis—before you even log in to check.
            </p>
            
            {/* Simulated Alert */}
            <div className="p-3 rounded-md border border-black/10 bg-[#FAFAFA] relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400" />
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-800">Spike Detected</span>
              </div>
              <p className="text-xs text-slate-700 font-medium">Cart abandonment up 40% vs. 7-day baseline.</p>
            </div>
          </div>

          {/* Phase 4: Click-to-Converse (Medium Feature) */}
          <div className="group rounded-lg bg-white border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-200 md:col-span-1 lg:col-span-1 p-6">
            <div className="w-9 h-9 rounded-md bg-slate-50 border border-black/10 flex items-center justify-center mb-4 text-slate-700">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
              Click to Ask "Why?"
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              See a strange dip in a chart? Don't guess. Just click the anomaly to open a chat instantly scoped to that exact data point. Arcli investigates the underlying cause in seconds.
            </p>
          </div>

          {/* Phase 0: Provenance & Trust (Medium Feature) */}
          <div className="group rounded-lg bg-white border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-200 md:col-span-1 lg:col-span-1 p-6">
            <div className="w-9 h-9 rounded-md bg-slate-100 border border-black/10 flex items-center justify-center mb-4 text-slate-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
              1-Click Metric Trust
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              Never second-guess a number in the boardroom. Click "View Lineage" on any widget to see the exact formula, data source, and logic used to calculate it.
            </p>
          </div>

          {/* Phase 2: Narrative Synthesis (Wide Feature) */}
          <div className="group relative overflow-hidden rounded-lg bg-white border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:col-span-2 lg:col-span-2 p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
            <div className="flex-1">
              <div className="w-9 h-9 rounded-md bg-slate-50 border border-black/10 flex items-center justify-center mb-4 text-slate-700">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
                Executive Synthesis & Time-Travel
              </h3>
              <p className="text-slate-600 leading-relaxed text-sm max-w-sm">
                Generate a 3-paragraph executive narrative with one click. Share a "Time-Travel" link so your colleagues see the dashboard exactly as it was when the summary was written.
              </p>
            </div>
            
            <button className="flex-shrink-0 inline-flex h-10 items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 rounded-md font-medium transition-colors text-sm border border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              Generate Brief <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </section>
  );
}