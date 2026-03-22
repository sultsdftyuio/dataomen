'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Sparkles, 
  Cpu, 
  Terminal, 
  ArrowRight, 
  Activity, 
  CheckCircle2, 
  Code2, 
  LineChart,
  AlertTriangle
} from 'lucide-react';

interface WorkStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  colorTheme: string;
  shadowColor: string;
}

const steps: WorkStep[] = [
  {
    id: "01",
    title: "Connect Infrastructure",
    description: "Connect your live database or warehouse in seconds. Arcli instantly maps your schema, types, and relationships for analysis.",
    icon: <Database className="w-6 h-6" />,
    colorTheme: "text-blue-500",
    shadowColor: "#3b82f6"
  },
  {
    id: "02",
    title: "Contextual RAG Querying",
    description: "Ask business questions in plain English. The engine synthesizes your schema to write perfectly optimized SQL instantly.",
    icon: <Sparkles className="w-6 h-6" />,
    colorTheme: "text-orange-500",
    shadowColor: "#f97316"
  },
  {
    id: "03",
    title: "Deploy Autonomous Agents",
    description: "Turn queries into proactive watchdogs. AI agents monitor metrics 24/7, detecting hidden anomalies before they hit the bottom line.",
    icon: <Cpu className="w-6 h-6" />,
    colorTheme: "text-red-500",
    shadowColor: "#ef4444"
  }
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-play mechanism
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const renderVisualizer = () => {
    switch (activeStep) {
      case 0: // Connect
        return (
          <div className="w-full h-full bg-slate-900 border-2 border-slate-900 p-4 font-mono text-sm shadow-[8px_8px_0px_0px_#3b82f6] flex flex-col animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="flex gap-2 mb-4 border-b-2 border-slate-700 pb-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            </div>
            <div className="space-y-3 text-slate-300 overflow-hidden flex-1">
              <p><span className="text-blue-400">arcli</span> connect --source postgresql_prod</p>
              <p className="text-slate-500">Initiating secure read-only tunnel...</p>
              <p className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Connection established.
              </p>
              <p className="text-slate-500">Extracting schema topologies...</p>
              <div className="pl-4 border-l-2 border-slate-700 space-y-1">
                <p>Found table: <span className="text-orange-300">core_transactions</span> (1.2M rows)</p>
                <p>Found table: <span className="text-orange-300">users</span> (84K rows)</p>
                <p>Found table: <span className="text-orange-300">subscriptions</span> (12K rows)</p>
              </div>
              <p className="flex items-center gap-2 text-emerald-400 font-bold mt-4">
                <Sparkles className="w-4 h-4" /> Vector mapping complete. Ready for analysis.
              </p>
            </div>
          </div>
        );
      case 1: // Query
        return (
          <div className="w-full h-full bg-slate-50 border-2 border-slate-900 flex flex-col shadow-[8px_8px_0px_0px_#f97316] animate-in fade-in slide-in-from-right-8 duration-500 relative z-10">
            {/* User Input Mock */}
            <div className="p-4 border-b-2 border-slate-900 bg-white flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 text-orange-500 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-sm">US</span>
              </div>
              <p className="font-bold text-slate-900">"Show me MRR growth over the last 4 months grouped by tier."</p>
            </div>
            {/* AI Output Mock */}
            <div className="p-4 flex-1 flex flex-col gap-4 bg-slate-100">
              <div className="bg-slate-900 p-3 text-xs md:text-sm font-mono text-slate-300 border-2 border-slate-900 overflow-x-auto">
                <span className="text-orange-400">SELECT</span> date_trunc(<span className="text-emerald-400">'month'</span>, created_at), tier, <span className="text-orange-400">SUM</span>(amount)<br/>
                <span className="text-orange-400">FROM</span> subscriptions <span className="text-orange-400">WHERE</span> status = <span className="text-emerald-400">'active'</span><br/>
                <span className="text-orange-400">GROUP BY</span> 1, 2 <span className="text-orange-400">ORDER BY</span> 1 <span className="text-orange-400">DESC</span>;
              </div>
              {/* Fake Chart Area */}
              <div className="flex-1 border-2 border-slate-900 bg-white p-4 flex items-end gap-2 justify-center pb-0 relative">
                <div className="absolute top-2 left-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <LineChart className="w-4 h-4" /> MRR Growth
                </div>
                {[30, 45, 60, 85].map((h, i) => (
                  <div key={i} className="w-12 md:w-16 bg-slate-900 border-2 border-b-0 border-slate-900 relative group transition-all" style={{ height: `${h}%` }}>
                    <div className="absolute top-0 left-0 w-full h-1/3 bg-orange-500 border-b-2 border-slate-900" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 2: // Agents
        return (
          <div className="w-full h-full bg-slate-900 border-2 border-slate-900 p-6 shadow-[8px_8px_0px_0px_#ef4444] animate-in fade-in slide-in-from-right-8 duration-500 text-white flex flex-col">
             <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-slate-700">
                <div className="flex items-center gap-3">
                  <Activity className="w-6 h-6 text-red-500 animate-pulse" />
                  <span className="font-mono font-bold uppercase tracking-widest text-sm">Watchdog Active</span>
                </div>
                <div className="px-2 py-1 bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/50">
                  SYSTEM NOMINAL
                </div>
             </div>
             
             <div className="space-y-4 flex-1">
                {/* Log Entry 1 */}
                <div className="border-2 border-slate-700 bg-slate-800 p-4 flex gap-4 opacity-50">
                  <Code2 className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm uppercase tracking-wide text-slate-300">Routine Check: Daily Active Users</h4>
                    <p className="text-xs font-mono text-slate-500 mt-1">Variance: +1.2% (Within normal thresholds)</p>
                  </div>
                </div>

                {/* Log Entry 2 - Anomaly */}
                <div className="border-2 border-red-500 bg-red-950/30 p-4 flex gap-4 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm uppercase tracking-wide text-red-400 mb-1">Anomaly Detected: API Error Rate</h4>
                    <p className="text-xs font-mono text-slate-300 leading-relaxed mb-3">
                      Gateway 502 errors spiked by 400% in the last 5 minutes. Highly correlated with recent deployment `v2.4.1`.
                    </p>
                    <button className="px-3 py-1.5 bg-red-500 text-white font-bold text-xs uppercase tracking-wider hover:bg-red-600 transition-colors">
                      View Diagnosis
                    </button>
                  </div>
                </div>
             </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section 
      className="bg-white border-b-2 border-slate-900 py-24 lg:py-32 relative overflow-hidden"
      aria-labelledby="how-it-works-heading"
    >
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] opacity-50 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-3 px-3 py-1 bg-slate-900 text-white font-mono text-xs uppercase tracking-widest mb-6 shadow-[4px_4px_0px_0px_#3b82f6]">
            <Terminal className="w-4 h-4 text-blue-500" />
            PIPELINE ARCHITECTURE
          </div>
          <h2 
            id="how-it-works-heading"
            className="text-5xl md:text-7xl font-black text-slate-900 uppercase tracking-tighter leading-[0.95] max-w-3xl"
          >
            From Raw Data to <span className="text-transparent [-webkit-text-stroke:2px_#0f172a]">Autonomous Action.</span>
          </h2>
        </div>

        {/* Interactive Main Area */}
        <div 
          className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Left Column: Steps Selector */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {steps.map((step, index) => {
              const isActive = activeStep === index;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`text-left p-6 border-2 transition-all duration-300 relative overflow-hidden group ${
                    isActive 
                      ? `border-slate-900 bg-slate-900 text-white shadow-[8px_8px_0px_0px_${step.shadowColor}] translate-x-2 -translate-y-2` 
                      : 'border-slate-300 bg-white hover:border-slate-900 text-slate-900 hover:shadow-[4px_4px_0px_0px_#0f172a]'
                  }`}
                >
                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`mt-1 flex-shrink-0 ${isActive ? step.colorTheme : 'text-slate-400 group-hover:text-slate-900'}`}>
                      {step.icon}
                    </div>
                    <div>
                      <h3 className={`text-xl font-black uppercase tracking-tight mb-2 ${isActive ? 'text-white' : 'text-slate-900'}`}>
                        {step.title}
                      </h3>
                      <p className={`text-sm md:text-base font-medium leading-relaxed ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Dynamic Stage */}
          <div className="lg:col-span-7 h-[500px] w-full relative">
             {/* Stage Container */}
             <div className="absolute inset-0 bg-white border-2 border-slate-900 p-2 md:p-4 shadow-xl flex flex-col">
                <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2 mb-4 px-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">
                    System Viewport
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-400">
                    Step {activeStep + 1} / 3
                  </span>
                </div>
                
                <div className="flex-1 relative overflow-hidden">
                  {renderVisualizer()}
                </div>
             </div>
          </div>
        </div>

      </div>
    </section>
  );
}