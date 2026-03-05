'use client';

import { Terminal, Braces, Database, Shield } from 'lucide-react';

const specs = [
  {
    id: "01",
    module: "Semantic NL2SQL Router",
    tech: "Contextual RAG + LLM",
    description: "Transforms plain English into highly optimized SQL. Prevents hallucination by semantically routing only necessary schema fragments to the context window.",
    icon: <Terminal className="w-6 h-6" />
  },
  {
    id: "02",
    module: "Anomaly Detection Watchdogs",
    tech: "Pandas / NumPy / Polars",
    description: "Vectorized operations utilizing linear algebra (EMA, variance matrices) replace slow loops. Seasonality-aware outlier detection running entirely statelessly.",
    icon: <Braces className="w-6 h-6" />
  },
  {
    id: "03",
    module: "In-Process Analytics",
    tech: "DuckDB + Parquet",
    description: "Queries execute directly against columnar Parquet formats. Zero data transfer overhead. Computation is moved directly to the data layer.",
    icon: <Database className="w-6 h-6" />
  },
  {
    id: "04",
    module: "Strict Multi-Tenancy",
    tech: "Supabase Auth + RLS",
    description: "Object-oriented service managers enforce tenant isolation at the query level. Read-only analytical connections ensure complete data security by design.",
    icon: <Shield className="w-6 h-6" />
  }
];

export function EngineSpecs() {
  return (
    <section className="bg-slate-50 border-b-2 border-slate-900">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row">
        
        {/* Title sidebar */}
        <div className="md:w-1/3 border-b-2 md:border-b-0 md:border-r-2 border-slate-900 p-8 md:p-12 flex flex-col justify-between bg-white">
          <div>
            <h2 className="text-4xl font-black uppercase text-slate-900 mb-4 tracking-tight">System<br/>Specs</h2>
            <p className="text-slate-600 font-medium">The Hybrid Performance Paradigm in action. Swappable modules, raw power.</p>
          </div>
        </div>

        {/* Specs Table */}
        <div className="md:w-2/3 flex flex-col">
          {specs.map((spec, index) => (
            <div key={spec.id} className={`p-8 md:p-10 flex flex-col sm:flex-row gap-6 sm:gap-12 hover:bg-white transition-colors ${index !== specs.length - 1 ? 'border-b-2 border-slate-900' : ''}`}>
              <div className="flex-shrink-0 text-orange-500 font-mono text-xl font-bold">
                {spec.id}.
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {spec.icon}
                  <h3 className="text-2xl font-bold text-slate-900">{spec.module}</h3>
                </div>
                <div className="inline-block px-2 py-1 bg-slate-200 text-slate-700 font-mono text-xs uppercase tracking-wide mb-4 font-bold border border-slate-300">
                  {spec.tech}
                </div>
                <p className="text-slate-600 leading-relaxed max-w-xl">
                  {spec.description}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}