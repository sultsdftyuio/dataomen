'use client';

import React from 'react';
import { Database, Bot, Sparkles } from 'lucide-react';
import { useVisible } from "@/hooks/useVisible";

/**
 * ModularPipeline Component
 * * Demonstrates the technical architecture of Arcli using a modular, 
 * performance-first approach. Prioritizes vectorized compute and 
 * in-process analytics (DuckDB) for high-velocity data exploration.
 */
export function ModularPipeline() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section className="py-24 bg-white border-b-2 border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Title sidebar with brand anchor */}
        <div 
          className={`mb-16 transition-all duration-700 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} 
          ref={ref as React.RefObject<HTMLDivElement>}
        >
          <h2 className="text-4xl font-black uppercase tracking-tight text-slate-900 mb-4">The Arcli Architecture</h2>
          <div className="w-24 h-2 bg-orange-500"></div>
          <p className="mt-4 text-slate-600 font-medium max-w-xl">
            A high-velocity analytical engine designed for modular logic, vectorized speed, and autonomous intelligence.
          </p>
        </div>

        {/* Structural Bento Grid */}
        <div className={`flex flex-col lg:flex-row items-stretch border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] bg-slate-50 transition-all duration-700 delay-200 ${vis ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          
          {/* Step 1: Data Ingestion & Sanitization */}
          <div className="flex-1 p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-slate-900 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">01</span>
            <div className="mb-6 text-slate-900 transition-transform group-hover:scale-110 group-hover:-rotate-3">
              <Database className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Ingest & Sanitize</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10 leading-relaxed">
              Arcli auto-maps your schema across disparate sources. Our Sanitizer cleanses raw datasets and normalizes them into high-performance columnar storage (Parquet) for zero-latency retrieval and cross-tenant isolation.
            </p>
          </div>

          {/* Step 2: AI Logic & Vectorized Compute */}
          <div className="flex-1 p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-slate-900 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">02</span>
            <div className="mb-6 text-slate-900 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <Bot className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Compute & Detect</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10 leading-relaxed">
              Autonomous AI Agents execute vectorized operations to monitor your business metrics 24/7. They utilize linear algebra (EMA and variance modeling) to identify anomalies and revenue risks with mathematical precision.
            </p>
          </div>

          {/* Step 3: Natural Language Interaction */}
          <div className="flex-1 p-8 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">03</span>
            <div className="mb-6 text-slate-900 transition-transform group-hover:scale-110 group-hover:-rotate-3">
              <Sparkles className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Ask & Visualize</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10 leading-relaxed">
              Query your data in plain English. Arcli translates natural language into optimized analytical SQL via a semantic RAG pipeline, rendering interactive charts instantly through an in-process DuckDB engine.
            </p>
          </div>

        </div>

      </div>
    </section>
  );
}