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
    <section className="py-24 bg-[#F8FAFC] relative overflow-hidden border-t border-slate-200">
      {/* Subtle Engineering Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        {/* Header Section */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-6">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900 tracking-tight">The Arcli Engine</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight leading-[1.1]">
            Enterprise intelligence.<br />
            <span className="text-slate-400 font-medium">Zero engineering required.</span>
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
            We’ve hidden the complexity of data pipelines, metric governance, and AI orchestration so your team can focus entirely on making decisions.
          </p>
        </div>

        {/* Engineered Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(240px,auto)]">
          
          {/* Phase 1: Omni-Graph (Large Feature) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-2 lg:col-span-2 p-8 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent opacity-50 rounded-bl-full pointer-events-none" />
            
            <div className="mb-8">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-6 text-blue-600">
                <Network className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">
                Cross-Platform Insights
              </h3>
              <p className="text-slate-600 leading-relaxed text-sm md:text-base max-w-md">
                Arcli automatically connects the dots across your tools. See how Stripe revenue churn correlates with active Zendesk tickets—instantly, without writing a single pipeline or waiting for data engineers.
              </p>
            </div>

            {/* Simulated UI component inside the bento box */}
            <div className="mt-auto p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">St</div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">Zd</div>
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Omni-Graph Active</span>
            </div>
          </div>

          {/* Phase 5: Pulse Mode (Tall Feature) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-1 lg:col-span-1 lg:row-span-2 p-8 flex flex-col">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-6 text-rose-600">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">
              Proactive Pulse Alerts
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm mb-8 flex-1">
              Arcli watches your metrics 24/7. If cart abandonments spike, you receive an instant, intelligent alert complete with root-cause analysis—before you even log in to check.
            </p>
            
            {/* Simulated Alert */}
            <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/50 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold text-rose-900">Spike Detected</span>
              </div>
              <p className="text-xs text-rose-800 font-medium">Cart abandonment up 40% vs. 7-day baseline.</p>
            </div>
          </div>

          {/* Phase 4: Click-to-Converse (Medium Feature) */}
          <div className="group rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-1 lg:col-span-1 p-8">
            <div className="w-12 h-12 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6 text-violet-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">
              Click to Ask "Why?"
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              See a strange dip in a chart? Don't guess. Just click the anomaly to open a chat instantly scoped to that exact data point. Arcli investigates the underlying cause in seconds.
            </p>
          </div>

          {/* Phase 0: Provenance & Trust (Medium Feature) */}
          <div className="group rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-1 lg:col-span-1 p-8">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-6 text-slate-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">
              1-Click Metric Trust
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              Never second-guess a number in the boardroom. Click "View Lineage" on any widget to see the exact formula, data source, and logic used to calculate it.
            </p>
          </div>

          {/* Phase 2: Narrative Synthesis (Wide Feature) */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 shadow-lg md:col-span-2 lg:col-span-2 p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
            <div className="flex-1">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 text-white">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-tight">
                Executive Synthesis & Time-Travel
              </h3>
              <p className="text-slate-300 leading-relaxed text-sm max-w-sm">
                Generate a 3-paragraph executive narrative with one click. Share a "Time-Travel" link so your colleagues see the dashboard exactly as it was when the summary was written.
              </p>
            </div>
            
            <button className="flex-shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-lg font-medium transition-colors text-sm shadow-sm group-hover:shadow-blue-500/25">
              Generate Brief <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </section>
  );
}