'use client';

import { BrainCircuit, Activity, Server, ShieldCheck, DatabaseZap, Workflow } from 'lucide-react';

const features = [
  {
    title: "NL2SQL AI Agent",
    description: "Semantic routing translates plain English into highly optimized SQL queries specific to your schema.",
    icon: <BrainCircuit className="w-6 h-6 text-indigo-600" />,
    className: "md:col-span-2 md:row-span-2",
  },
  {
    title: "In-Process DuckDB",
    description: "Query columnar Parquet formats directly. No more massive data transfer overloads.",
    icon: <DatabaseZap className="w-6 h-6 text-emerald-600" />,
    className: "md:col-span-1",
  },
  {
    title: "Vectorized Anomaly Detection",
    description: "Pandas/NumPy powered linear algebra identifies statistical outliers in real-time.",
    icon: <Activity className="w-6 h-6 text-rose-600" />,
    className: "md:col-span-1",
  },
  {
    title: "Multi-Tenant Isolation",
    description: "Row-level security and strict tenant partitioning via Supabase auth.",
    icon: <ShieldCheck className="w-6 h-6 text-blue-600" />,
    className: "md:col-span-1",
  },
  {
    title: "Black-Box Storage",
    description: "Seamlessly swap between AWS S3, Cloudflare R2, or local without rewriting logic.",
    icon: <Server className="w-6 h-6 text-orange-600" />,
    className: "md:col-span-1",
  },
  {
    title: "Async Job Orchestration",
    description: "Heavy transformations run gracefully in the background without blocking the UI.",
    icon: <Workflow className="w-6 h-6 text-purple-600" />,
    className: "md:col-span-2",
  }
];

export function Features() {
  return (
    <section className="py-24 bg-white relative border-t border-slate-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Engineered for Excellence</h2>
          <p className="text-slate-600 max-w-2xl text-lg leading-relaxed">
            We discarded rigid boilerplate in favor of the Hybrid Performance Paradigm. 
            Heavy math runs vectorized in Python, analytics run in DuckDB, and the UI stays 100% functional React.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[200px]">
          {features.map((feat, i) => (
            <div 
              key={i} 
              className={`p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between group ${feat.className}`}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {feat.icon}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{feat.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}