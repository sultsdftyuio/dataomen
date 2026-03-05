'use client';

import { ArrowRight, Database, Zap } from 'lucide-react';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32 bg-slate-50">
      {/* Light Abstract Background */}
      <div className="absolute inset-0 z-0 opacity-[0.4]" 
           style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-indigo-100/50 to-transparent z-0"></div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-indigo-700 text-sm font-semibold mb-8 border border-indigo-200 shadow-sm">
          <Zap className="w-4 h-4 text-indigo-500" />
          <span>DuckDB Powered Analytics Engine Live</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-slate-900">
          Analyze Millions of Rows. <br className="hidden md:block" />
          <span className="text-indigo-600">In Milliseconds.</span>
        </h1>
        
        <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
          The high-performance, multi-tenant analytical SaaS built for modern teams. 
          Ask questions in plain English, detect anomalies instantly, and query Parquet files with zero overhead.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            href="/register" 
            className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-all transform hover:scale-[1.02] shadow-md hover:shadow-lg"
          >
            Start Analyzing Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link 
            href="/login" 
            className="flex items-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold border border-slate-200 transition-all shadow-sm hover:shadow"
          >
            <Database className="w-5 h-5 text-slate-400" />
            View Demo Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}