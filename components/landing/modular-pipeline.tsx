'use client';

import React, { useState, useEffect } from 'react';
import { Database, Bot, Sparkles, Terminal, ChevronRight } from 'lucide-react';
import { useVisible } from "@/hooks/useVisible";

// --- Types & Interfaces ---

interface PipelineStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "connect",
    title: "Connect Infrastructure",
    description: "Connect your live database or warehouse in seconds. Arcli instantly maps your schema, types, and relationships for analysis.",
    icon: Database,
  },
  {
    id: "query",
    title: "Contextual RAG Querying",
    description: "Ask business questions in plain English. The engine synthesizes your schema to write perfectly optimized SQL instantly.",
    icon: Sparkles,
  },
  {
    id: "agents",
    title: "Deploy Autonomous Agents",
    description: "Turn queries into proactive watchdogs. AI agents monitor metrics 24/7, detecting hidden anomalies before they hit the bottom line.",
    icon: Bot,
  }
];

// --- Sub-Components ---

/**
 * Animated System Viewport Terminal
 * Styled with neo-brutalism to match the app's aesthetic.
 */
const SystemViewport = () => {
  const [lines, setLines] = useState<number>(0);

  // Simulate terminal typing sequence
  useEffect(() => {
    const sequence = [
      setTimeout(() => setLines(1), 500),
      setTimeout(() => setLines(2), 1500),
      setTimeout(() => setLines(3), 2200),
      setTimeout(() => setLines(4), 2700),
      setTimeout(() => setLines(5), 3100),
      setTimeout(() => setLines(6), 3400),
      setTimeout(() => setLines(7), 4200),
    ];
    return () => sequence.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full h-full bg-slate-900 border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden font-mono text-sm flex flex-col relative z-10">
      {/* Terminal Header (Brutalist style) */}
      <div className="flex items-center px-4 py-3 bg-white border-b-2 border-slate-900">
        <div className="flex space-x-2">
          <div className="w-3 h-3 border-2 border-slate-900 bg-red-400"></div>
          <div className="w-3 h-3 border-2 border-slate-900 bg-yellow-400"></div>
          <div className="w-3 h-3 border-2 border-slate-900 bg-green-400"></div>
        </div>
        <div className="mx-auto flex items-center text-slate-900 text-xs font-black uppercase tracking-wider">
          <Terminal className="w-4 h-4 mr-2" />
          System Viewport
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-6 text-slate-300 flex-1 overflow-hidden flex flex-col space-y-2 bg-slate-900">
        {lines >= 1 && (
          <div className="flex text-orange-400">
            <span className="text-slate-500 mr-2">$</span> 
            <span className="font-semibold text-slate-100">arcli connect --source postgresql_prod</span>
          </div>
        )}
        {lines >= 2 && <div className="text-slate-400 animate-pulse">Initiating secure read-only tunnel...</div>}
        {lines >= 3 && <div className="text-green-400 font-bold">✓ Connection established.</div>}
        {lines >= 4 && <div className="text-slate-400">Extracting schema topologies...</div>}
        {lines >= 5 && <div className="text-slate-300 ml-4 border-l-2 border-orange-500 pl-3 py-1">Found table: <span className="text-blue-400 font-bold">core_transactions</span> (1.2M rows)</div>}
        {lines >= 6 && <div className="text-slate-300 ml-4 border-l-2 border-orange-500 pl-3 py-1">Found table: <span className="text-blue-400 font-bold">users</span> (84K rows)</div>}
        {lines >= 7 && <div className="text-slate-300 ml-4 border-l-2 border-orange-500 pl-3 py-1 mb-2">Found table: <span className="text-blue-400 font-bold">subscriptions</span> (12K rows)</div>}
        {lines >= 7 && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center text-orange-400 font-bold">
            <ChevronRight className="w-4 h-4 mr-1 stroke-[3]" />
            Vector mapping complete. Ready for analysis.
          </div>
        )}
      </div>
    </div>
  );
};


// --- Main Component ---

/**
 * ModularPipeline Component
 * Matches the brutalist design system (heavy borders, sharp shadows).
 */
export default function ModularPipeline() {
  const [ref, vis] = useVisible(0.1);
  const [activeStep, setActiveStep] = useState<number>(0);

  // Auto-rotate steps for interactive feel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-24 bg-white border-b-2 border-slate-900 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header - Brutalist typography */}
        <div 
          className={`mb-16 max-w-3xl transition-all duration-700 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`} 
          ref={ref as React.RefObject<HTMLDivElement>}
        >
          <h2 className="text-sm font-black text-orange-500 uppercase tracking-widest mb-3">Pipeline Architecture</h2>
          <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-slate-900 mb-6">
            From Raw Data to <br className="hidden md:block" />
            Autonomous Action.
          </h3>
          <div className="w-24 h-2 bg-orange-500"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Column: Interactive Steps */}
          <div className={`space-y-6 transition-all duration-700 delay-200 ${vis ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            {PIPELINE_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;
              
              return (
                <div 
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`relative p-6 cursor-pointer border-2 transition-all duration-300 ${
                    isActive 
                      ? "border-slate-900 bg-orange-50 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] -translate-y-1" 
                      : "border-slate-900 bg-white hover:bg-slate-50 hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:-translate-y-0.5"
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`flex-shrink-0 p-3 border-2 border-slate-900 ${isActive ? "bg-orange-500 text-white" : "bg-white text-slate-900"}`}>
                      <Icon className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">
                        {step.title}
                      </h4>
                      <p className="text-sm font-medium leading-relaxed text-slate-700">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Step Indicator */}
                  <div className="absolute top-6 right-6 font-mono text-2xl font-black text-slate-200 pointer-events-none">
                    0{index + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Visualizer (System Viewport) */}
          <div className={`relative h-[450px] transition-all duration-700 delay-400 ${vis ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            {/* Neo-brutalist decorative backdrop */}
            <div className="absolute inset-0 bg-orange-500 border-2 border-slate-900 transform translate-x-4 translate-y-4"></div>
            <div className="absolute inset-0 bg-slate-100 border-2 border-slate-900 transform translate-x-2 translate-y-2"></div>
            
            {/* Terminal Window */}
            <SystemViewport />
          </div>

        </div>
      </div>
    </section>
  );
}