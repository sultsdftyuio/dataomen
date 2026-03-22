'use client';

import React from 'react';
import { Database, Sparkles, Cpu, ArrowRight } from 'lucide-react';
import { C } from "@/lib/tokens";

interface WorkStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: WorkStep[] = [
  {
    id: "01",
    title: "Connect Your Data",
    description: "Upload a CSV or connect your live database (Postgres, Stripe, Snowflake) in seconds. Arcli instantly maps your schema for analysis.",
    icon: <Database className="w-8 h-8 transition-transform duration-500 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  },
  {
    id: "02",
    title: "Ask in Plain English",
    description: "No SQL required. Just type your questions and Arcli’s Contextual RAG writes optimized queries, rendering interactive charts instantly.",
    icon: <Sparkles className="w-8 h-8 transition-transform duration-500 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  },
  {
    id: "03",
    title: "Deploy AI Agents",
    description: "Turn your questions into autonomous watchdogs. Deploy AI agents that monitor your metrics 24/7 and alert you to anomalies in real-time.",
    icon: <Cpu className="w-8 h-8 transition-transform duration-500 group-hover:scale-110" style={{ color: C.blue }} aria-hidden="true" />
  }
];

export function HowItWorks() {
  return (
    <section 
      className="py-24 lg:py-32 relative overflow-hidden bg-white border-t"
      style={{ borderColor: C.rule }}
      aria-labelledby="how-it-works-heading"
    >
      {/* Background Ambient Glow */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] max-w-5xl opacity-40 pointer-events-none blur-[100px] z-0"
        style={{ background: `radial-gradient(ellipse at top, ${C.bluePale} 0%, transparent 70%)` }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center mb-24 flex flex-col items-center max-w-3xl mx-auto">
          <div 
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-8 shadow-sm border"
            style={{ 
              backgroundColor: C.offWhite, 
              color: C.blue,
              borderColor: C.rule
            }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: C.blueLight }}></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: C.blue }}></span>
            </span>
            Seamless Integration
          </div>
          <h2 
            id="how-it-works-heading"
            className="font-extrabold tracking-tight mb-6" 
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', color: C.navy, lineHeight: 1.05 }}
          >
            From Raw Data to <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">
              Autonomous Monitoring
            </span>
          </h2>
          <p 
            className="text-lg md:text-xl leading-relaxed mt-4"
            style={{ color: C.muted }}
          >
            Deploy enterprise-grade analytical infrastructure in three simple steps. No complex ETL pipelines or data engineering teams required.
          </p>
        </div>

        {/* Steps Container */}
        <div className="relative">
          
          {/* Decorative Connecting Line (Desktop Only) */}
          <div className="hidden lg:block absolute top-[60px] left-[15%] right-[15%] z-0" aria-hidden="true">
            <div className="h-[2px] w-full relative overflow-hidden rounded-full" style={{ backgroundColor: C.rule }}>
              {/* Animated pulse on the line */}
              <div className="absolute top-0 left-0 h-full w-1/3 animate-[slide_3s_ease-in-out_infinite]" style={{ background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 relative z-10">
            {steps.map((step, index) => (
              <div key={step.id} className="relative group">
                
                {/* Connecting arrow for mobile */}
                {index > 0 && (
                  <div className="lg:hidden flex justify-center mb-8">
                    <ArrowRight className="w-6 h-6 rotate-90" style={{ color: C.faint }} />
                  </div>
                )}

                {/* Card Wrapper for gradient border effect */}
                <div 
                  className="relative rounded-3xl p-[1px] transition-colors duration-500 h-full"
                  style={{ backgroundColor: C.rule }}
                >
                  {/* Hover Gradient Border */}
                  <div className="absolute inset-0 bg-gradient-to-b from-blue-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
                  
                  {/* Card Content */}
                  <div className="relative h-full bg-white rounded-[23px] p-8 sm:p-10 flex flex-col items-center text-center shadow-sm group-hover:shadow-xl transition-shadow duration-500 overflow-hidden">
                    
                    {/* Subtle inner hover glow */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                      style={{ background: `radial-gradient(circle at 50% 0%, ${C.bluePale} 0%, transparent 70%)` }}
                    />

                    {/* Icon Node */}
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-sm mb-8 relative z-10 transition-transform duration-500 group-hover:-translate-y-2"
                      style={{ backgroundColor: C.offWhite, border: `1px solid ${C.rule}` }}
                    >
                      {step.icon}
                      
                      {/* Step Number Badge */}
                      <div 
                        className="absolute -top-3 -right-3 w-8 h-8 font-bold rounded-full flex items-center justify-center text-sm shadow-md transition-colors duration-300"
                        style={{ background: C.navy, color: C.white }}
                      >
                        {step.id}
                      </div>
                    </div>
                    
                    <h3 
                      className="text-2xl font-bold mb-4 relative z-10"
                      style={{ color: C.navy }}
                    >
                      {step.title}
                    </h3>
                    
                    <p 
                      className="text-base leading-relaxed relative z-10"
                      style={{ color: C.muted }}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tailwind Custom Keyframes for the line animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}} />
    </section>
  );
}