// components/landing/features.tsx
'use client';

import React from 'react';
import { MessageSquareText, BellRing, Presentation, PlugZap } from 'lucide-react';

// Extracted static data to prevent re-allocations
const FEATURES = [
  {
    title: "Plain-English Queries.",
    description: "Drop the complex SQL and rigid pivot tables. Ask Arcli questions in plain English—like 'Why did Q3 revenue drop?'—and get instant, accurate answers.",
    icon: <MessageSquareText className="w-6 h-6 text-blue-600" />,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100"
  },
  {
    title: "Autonomous AI Watchdogs.",
    description: "Never miss a critical anomaly. Our AI agents monitor your metrics 24/7, sending instant alerts with root-cause analysis the moment revenue drops or errors spike.",
    icon: <BellRing className="w-6 h-6 text-rose-600" />,
    bgColor: "bg-rose-50",
    borderColor: "border-rose-100"
  },
  {
    title: "Instant Visualizations.",
    description: "Turn raw data into beautiful, interactive graphs instantly. Export presentation-ready charts directly to your board deck with zero manual formatting.",
    icon: <Presentation className="w-6 h-6 text-violet-600" />,
    bgColor: "bg-violet-50",
    borderColor: "border-violet-100"
  },
  {
    title: "Frictionless Integrations.",
    description: "Connect your warehouse, database, or favorite SaaS tools like Stripe and Salesforce in seconds. Zero engineering tickets or pipeline configurations required.",
    icon: <PlugZap className="w-6 h-6 text-emerald-600" />,
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-100"
  }
];

export function Features() {
  return (
    <section className="py-24 bg-white relative overflow-hidden border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        {/* Header Section */}
        <div className="text-center mb-16 md:mb-20">
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">
            Stop waiting for the data team.
          </h2>
          <p className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Deploy an AI data analyst that empowers anyone on your team to find insights, track metrics, and make decisions without writing a single line of SQL.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {FEATURES.map((feat, i) => (
            <div 
              key={i} 
              className="p-8 md:p-10 rounded-3xl bg-white border border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 transition-all duration-300 group flex flex-col h-full"
            >
              <div 
                className={`w-14 h-14 rounded-2xl ${feat.bgColor} ${feat.borderColor} border flex items-center justify-center mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-sm`}
                aria-hidden="true"
              >
                {feat.icon}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
                {feat.title}
              </h3>
              <p className="text-slate-600 leading-relaxed text-base flex-1">
                {feat.description}
              </p>
            </div>
          ))}
        </div>

        {/* Trust/No-Code Nudge */}
        <div className="mt-16 text-center">
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
            Designed for Founders, Marketers, and Operators
          </p>
        </div>
      </div>
    </section>
  );
}