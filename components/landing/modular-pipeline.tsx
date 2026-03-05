'use client';

import { ArrowRight } from 'lucide-react';

export function ModularPipeline() {
  return (
    <section className="py-24 bg-white border-b-2 border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="mb-16">
          <h2 className="text-4xl font-black uppercase tracking-tight text-slate-900 mb-4">Pipeline Architecture</h2>
          <div className="w-24 h-2 bg-orange-500"></div>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] bg-slate-50">
          
          {/* Step 1 */}
          <div className="flex-1 p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-slate-900 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">01</span>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Ingest & Sanitize</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10">
              Raw data enters the system. The Sanitizer cleanses schemas and normalizes into swappable black-box storage (S3/R2) as optimized Parquet.
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex-1 p-8 lg:border-r-2 border-b-2 lg:border-b-0 border-slate-900 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">02</span>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Compute & Detect</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10">
              Async Python Watchdogs wake up. Vectorized operations scan for statistical outliers using Linear Algebra before going back to sleep.
            </p>
          </div>

          {/* Step 3 */}
          <div className="flex-1 p-8 relative group hover:bg-white transition-colors">
            <span className="absolute top-4 right-4 font-mono text-4xl font-black text-slate-200 group-hover:text-orange-100 transition-colors">03</span>
            <h3 className="text-xl font-bold uppercase mb-4 text-slate-900 relative z-10">Interact & Render</h3>
            <p className="text-slate-600 font-medium text-sm relative z-10">
              100% Functional React components fetch data securely. DuckDB executes in-process analytics instantly for the end user.
            </p>
          </div>

        </div>

      </div>
    </section>
  );
}