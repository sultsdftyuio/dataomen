'use client';

import React from 'react';
import { FileUp, MessageSquare, Bot, ArrowRight } from 'lucide-react';
import { C } from "@/lib/tokens";

// 1. Strict Type Definitions
// Ensures data contracts are maintained if this module's data source is later swapped (e.g., fetched from CMS).
interface WorkStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

// 2. Static Data Extraction
// Defined outside the component to maximize React rendering efficiency.
const steps: WorkStep[] = [
  {
    id: "01",
    title: "Connect Your Data",
    description: "Upload a CSV or connect your live database (Postgres, Stripe, Snowflake) in seconds. Arcli instantly maps your schema for analysis.",
    icon: <FileUp className="w-7 h-7 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  },
  {
    id: "02",
    title: "Ask in Plain English",
    description: "No SQL required. Just type your questions and Arcli’s Contextual RAG writes optimized queries, rendering interactive charts instantly.",
    icon: <MessageSquare className="w-7 h-7 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  },
  {
    id: "03",
    title: "Deploy AI Agents",
    description: "Turn your questions into autonomous watchdogs. Deploy AI agents that monitor your metrics 24/7 and alert you to anomalies in real-time.",
    icon: <Bot className="w-7 h-7 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  }
];

export function HowItWorks() {
  return (
    <section 
      className="py-24 lg:py-32 relative overflow-hidden bg-slate-50 border-t border-slate-200"
      aria-labelledby="how-it-works-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center mb-20 md:mb-24 flex flex-col items-center max-w-3xl mx-auto">
          <div 
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-6 shadow-sm"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
            Seamless Integration
          </div>
          <h2 
            id="how-it-works-heading"
            className="font-extrabold tracking-tight mb-6" 
            style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', color: C.navy, lineHeight: 1.1 }}
          >
            From Raw Data to <br className="hidden sm:block" />
            <span style={{ color: C.blue }}>Autonomous Monitoring</span>
          </h2>
          <p 
            className="text-lg md:text-xl"
            style={{ color: C.muted }}
          >
            Deploy enterprise-grade analytical infrastructure in three simple steps. No complex ETL pipelines or data engineering teams required.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16 relative">
          
          {/* Decorative Connecting Pipeline (Desktop Only) */}
          <div 
            className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-0.5 -translate-y-1/2 z-0 opacity-40"
            style={{ background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)` }}
            aria-hidden="true"
          />

          {steps.map((step, index) => (
            <div 
              key={step.id} 
              className="group relative z-10 flex flex-col items-center text-center"
            >
              {/* Icon Node */}
              <div 
                className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-2xl transition-all duration-500 mb-8 relative z-10 rotate-3 group-hover:rotate-0"
                style={{ border: `1px solid ${C.rule}` }}
              >
                {step.icon}
                
                {/* Step Number Badge */}
                <div 
                  className="absolute -bottom-4 -right-4 w-10 h-10 font-black rounded-xl flex items-center justify-center text-base shadow-sm transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
                  style={{ background: C.navy, color: C.offWhite }}
                  aria-hidden="true"
                >
                  {step.id}
                </div>
              </div>
              
              {/* Step Content */}
              <h3 
                className="text-2xl font-bold mb-4 transition-colors duration-300"
                style={{ color: C.navy }}
              >
                {step.title}
              </h3>
              <p 
                className="text-base md:text-lg leading-relaxed max-w-sm"
                style={{ color: C.muted }}
              >
                {step.description}
              </p>

              {/* Connecting arrow for mobile (Hidden on desktop) */}
              {index < steps.length - 1 && (
                <div className="md:hidden mt-8 text-slate-300">
                  <ArrowRight className="w-6 h-6 rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Background ambient glow */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-4xl opacity-30 pointer-events-none blur-3xl z-0"
        style={{ background: `radial-gradient(circle, ${C.bluePale} 0%, transparent 70%)` }}
        aria-hidden="true"
      />
    </section>
  );
}