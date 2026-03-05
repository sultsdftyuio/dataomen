'use client';

import { BarChart3, Brain, Zap, Bot } from 'lucide-react';

const features = [
  {
    title: "Ask anything, instantly.",
    description: "Our semantic NL2SQL router translates plain English into highly optimized queries. No SQL required.",
    icon: <Brain className="w-6 h-6 text-purple-400" />
  },
  {
    title: "Autonomous AI Agents.",
    description: "Deploy background watchdogs. Vectorized anomaly detectors use Linear Algebra (EMA, variance) to flag statistical outliers automatically while you sleep.",
    icon: <Bot className="w-6 h-6 text-emerald-400" />
  },
  {
    title: "Beautiful, dynamic charts.",
    description: "Automatically generate interactive visualizations based on your prompts using our functional UI rendering.",
    icon: <BarChart3 className="w-6 h-6 text-blue-400" />
  },
  {
    title: "Lightning-fast execution.",
    description: "We use an in-process DuckDB engine to query Parquet files directly. Analyze millions of rows without loading screens.",
    icon: <Zap className="w-6 h-6 text-yellow-400" />
  }
];

export function Features() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Subtle background glow for depth */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-900/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">An entire data team in your browser.</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            From semantic natural language routing to swappable logic modules, we handle the complex math so you can focus on the insights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feat, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 group relative overflow-hidden">
              {/* Hover gradient effect inside the card */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 border border-white/10 shadow-lg">
                  {feat.icon}
                </div>
                <h3 className="text-2xl font-semibold text-white mb-3">{feat.title}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {feat.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}