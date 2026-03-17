import React from "react";
import Link from "next/link";

export function Hero() {
  return (
    <header className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center pt-20 pb-16 lg:pt-32 lg:pb-24 z-10">
      
      {/* Product Update Badge (Draws the eye, signals active development) */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out mb-8">
        <Link 
          href="/changelog" 
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
          DataOmen Engine v2.0 is Live
          <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Primary Value Proposition (SEO H1) */}
      <h1 className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 ease-out max-w-4xl text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6">
        Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500">Autonomous</span> Data Department.
      </h1>

      {/* Semantic Subtitle */}
      <p className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 ease-out max-w-2xl text-lg md:text-xl text-neutral-400 mb-10 leading-relaxed">
        Replace passive BI dashboards with an active, agentic AI system. Connect your warehouse and let DataOmen automatically plan, query, diagnose, and narrate your enterprise data in milliseconds.
      </p>

      {/* High-Velocity Conversion Actions */}
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 ease-out flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
        {/* Primary CTA: Routes directly to your Supabase Auth flow.
          Using a solid brand color with a subtle inner shadow for depth.
        */}
        <Link 
          href="/register" 
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-lg font-semibold tracking-wide transition-all shadow-[inset_0px_1px_1px_rgba(255,255,255,0.2)] hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]"
        >
          Deploy Your Agents
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </Link>

        {/* Secondary CTA: Keeps users on the page if they aren't ready to convert,
          dropping them directly into the InteractiveDemo component.
        */}
        <Link 
          href="#interactive-demo" 
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-transparent hover:bg-white/5 border border-white/10 text-white px-8 py-3.5 rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Watch the Engine
        </Link>
      </div>

      {/* Technical Trust Signals (Objection handling for the technical buyer) */}
      <div className="animate-in fade-in duration-1000 delay-500 ease-out mt-16 pt-8 border-t border-white/5 w-full max-w-3xl flex flex-wrap justify-center gap-x-8 gap-y-4 text-xs font-mono text-neutral-500 uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500/70" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Vectorized DuckDB Compute
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500/70" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Read-Only Hybrid Connectivity
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500/70" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Supabase Tenant Isolation
        </div>
      </div>

    </header>
  );
}