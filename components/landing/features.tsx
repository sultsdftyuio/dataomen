'use client';

import { BarChart3, Brain, Zap, Bot } from 'lucide-react';

const features = [
  {
    title: "Ask anything, instantly.",
    description: "Our semantic NL2SQL router translates plain English into highly optimized queries. No SQL required.",
    icon: <Brain className="w-6 h-6 text-purple-600" />,
    bgColor: "bg-purple-50",
    borderColor: "border-purple-100"
  },
  {
    title: "Autonomous AI Agents.",
    description: "Deploy background watchdogs. Vectorized anomaly detectors use Linear Algebra (EMA, variance) to flag statistical outliers automatically.",
    icon: <Bot className="w-6 h-6 text-emerald-600" />,
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-100"
  },
  {
    title: "Beautiful, dynamic charts.",
    description: "Automatically generate interactive visualizations based on your prompts using our fully functional UI rendering engine.",
    icon: <BarChart3 className="w-6 h-6 text-blue-600" />,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100"
  },
  {
    title: "Lightning-fast execution.",
    description: "We use an in-process DuckDB engine to query Parquet files directly. Analyze millions of rows without loading screens.",
    icon: <Zap className="w-6 h-6 text-orange-600" />,
    bgColor: "bg-orange-50",
    borderColor: "border-orange-100"
  }
];

export function Features() {
  return (
    <section className="py-24 bg-white relative overflow-hidden border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">An entire data team in your browser.</h2>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            From semantic natural language routing to swappable logic modules, we handle the complex math so you can focus on the insights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feat, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 group">
              <div className={`w-14 h-14 rounded-2xl ${feat.bgColor} ${feat.borderColor} border flex items-center justify-center mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300`}>
                {feat.icon}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">{feat.title}</h3>
              <p className="text-slate-600 leading-relaxed">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}