'use client';

import { FileUp, MessageSquare, Bot } from 'lucide-react';

const steps = [
  {
    id: "01",
    title: "Connect & Sanitize",
    description: "Upload a CSV or connect your DB. We automatically sanitize the schema and convert it to ultra-fast Parquet formats.",
    icon: <FileUp className="w-6 h-6 text-indigo-600" />
  },
  {
    id: "02",
    title: "Chat in Plain English",
    description: "Our Semantic Router translates your questions into optimized DuckDB queries, rendering charts instantly.",
    icon: <MessageSquare className="w-6 h-6 text-indigo-600" />
  },
  {
    id: "03",
    title: "Deploy Agents",
    description: "Set up background watchdogs that use NumPy and linear algebra to automatically flag statistical outliers.",
    icon: <Bot className="w-6 h-6 text-indigo-600" />
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How it works</h2>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">From raw data to autonomous monitoring in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-slate-200 z-0"></div>

          {steps.map((step, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-white rounded-full border-4 border-slate-50 flex items-center justify-center shadow-lg mb-6 relative">
                {step.icon}
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center text-sm border-2 border-white">
                  {step.id}
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
              <p className="text-slate-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}