'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Sparkles, 
  Cpu, 
  Terminal, 
  CheckCircle2, 
  Code2, 
  LineChart,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

interface WorkStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  activeBorder: string;
  activeBg: string;
}

const steps: WorkStep[] = [
  {
    id: "01",
    title: "Connect Infrastructure",
    description: "Connect your live database or warehouse in seconds. Arcli instantly maps your schema, types, and relationships for analysis.",
    icon: <Database className="w-6 h-6 text-blue-600" />,
    iconBg: "bg-blue-50",
    iconBorder: "border-blue-100",
    activeBorder: "border-blue-600",
    activeBg: "bg-blue-50/50"
  },
  {
    id: "02",
    title: "Contextual RAG Querying",
    description: "Ask business questions in plain English. The engine synthesizes your schema to write perfectly optimized SQL instantly.",
    icon: <Sparkles className="w-6 h-6 text-orange-600" />,
    iconBg: "bg-orange-50",
    iconBorder: "border-orange-100",
    activeBorder: "border-orange-500",
    activeBg: "bg-orange-50/50"
  },
  {
    id: "03",
    title: "Deploy Autonomous Agents",
    description: "Turn queries into proactive watchdogs. AI agents monitor metrics 24/7, detecting hidden anomalies before they hit the bottom line.",
    icon: <Cpu className="w-6 h-6 text-rose-600" />,
    iconBg: "bg-rose-50",
    iconBorder: "border-rose-100",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-50/50"
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
          <div className="w-full h-full bg-slate-950 rounded-2xl p-6 font-mono text-sm flex flex-col animate-in fade-in slide-in-from-right-8 duration-500 shadow-xl border border-slate-800">
            <div className="flex gap-2 mb-6 border-b border-slate-800 pb-4">
              <div className="w-3 h-3 rounded-full bg-rose-500"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            </div>
            
            <div className="space-y-4 text-slate-300 overflow-hidden flex-1">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-blue-500" />
                <p><span className="text-blue-400 font-semibold">arcli</span> connect --source postgresql_prod</p>
              </div>
              <p className="text-slate-500 pl-6">Initiating secure read-only tunnel...</p>
              <p className="flex items-center gap-2 text-emerald-400 pl-6">
                <CheckCircle2 className="w-4 h-4" /> Connection established.
              </p>
              <p className="text-slate-500 pl-6">Extracting schema topologies...</p>
              <div className="pl-6 border-l border-slate-800 ml-8 space-y-2 py-2">
                <p>Found table: <span className="text-blue-300 font-medium">core_transactions</span> <span className="text-slate-500">(1.2M rows)</span></p>
                <p>Found table: <span className="text-blue-300 font-medium">users</span> <span className="text-slate-500">(84K rows)</span></p>
                <p>Found table: <span className="text-blue-300 font-medium">subscriptions</span> <span className="text-slate-500">(12K rows)</span></p>
              </div>
              <p className="flex items-center gap-2 text-blue-400 font-semibold mt-6 pl-6">
                <Sparkles className="w-4 h-4" /> Vector mapping complete. Ready for analysis.
              </p>
            </div>
          </div>
        );
      case 1: // Query
        return (
          <div className="w-full h-full bg-slate-50 rounded-2xl border border-slate-200 flex flex-col animate-in fade-in slide-in-from-right-8 duration-500 relative z-10 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-200 bg-white flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm border border-orange-200">
                <span className="font-bold text-sm">US</span>
              </div>
              <p className="font-medium text-slate-700 text-sm">"Show me MRR growth over the last 4 months grouped by tier."</p>
            </div>
            <div className="p-5 flex-1 flex flex-col gap-4 bg-slate-50/50">
              <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-slate-300 border border-slate-800 overflow-x-auto shadow-inner">
                <span className="text-orange-400">SELECT</span> date_trunc(<span className="text-emerald-400">'month'</span>, created_at), tier, <span className="text-orange-400">SUM</span>(amount)<br/>
                <span className="text-orange-400">FROM</span> subscriptions <span className="text-orange-400">WHERE</span> status = <span className="text-emerald-400">'active'</span><br/>
                <span className="text-orange-400">GROUP BY</span> 1, 2 <span className="text-orange-400">ORDER BY</span> 1 <span className="text-orange-400">DESC</span>;
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 flex items-end gap-3 justify-center relative shadow-sm">
                <div className="absolute top-4 left-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <LineChart className="w-4 h-4" /> MRR Growth
                </div>
                {[30, 45, 60, 85].map((h, i) => (
                  <div key={i} className="w-12 md:w-16 bg-slate-100 rounded-t-md relative group transition-all" style={{ height: `${h}%` }}>
                    <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-md opacity-90 transition-opacity hover:opacity-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 2: // Agents
        return (
          <div className="w-full h-full bg-slate-950 rounded-2xl border border-slate-800 p-6 shadow-xl animate-in fade-in slide-in-from-right-8 duration-500 text-white flex flex-col">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </div>
                  <span className="font-semibold text-sm text-slate-200">Watchdog Active</span>
                </div>
                <div className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-xs font-medium border border-emerald-500/20">
                  SYSTEM NOMINAL
                </div>
             </div>
             
             <div className="space-y-4 flex-1">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex gap-4 transition-opacity hover:bg-slate-900">
                  <Code2 className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-slate-300">Routine Check: Daily Active Users</h4>
                    <p className="text-xs font-mono text-slate-500 mt-1">Variance: +1.2% (Within normal thresholds)</p>
                  </div>
                </div>

                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 flex gap-4 relative overflow-hidden shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h4 className="font-semibold text-sm text-rose-400 mb-1">Anomaly Detected: API Error Rate</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Gateway 502 errors spiked by 400% in the last 5 minutes. Highly correlated with recent deployment <code className="bg-rose-950 px-1 rounded text-rose-300">v2.4.1</code>.
                    </p>
                    <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 font-semibold text-xs border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all">
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
      className="bg-white py-24 lg:py-32 relative overflow-hidden border-t border-slate-200"
      aria-labelledby="how-it-works-heading"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-40 z-0">
        <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-100 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-50 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        <div className="mb-16 md:mb-20 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-semibold text-xs uppercase tracking-wider mb-6">
            <Terminal className="w-4 h-4" />
            Pipeline Architecture
          </div>
          <h2 
            id="how-it-works-heading"
            className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight max-w-2xl"
          >
            From Raw Data to <span className="text-blue-600">Autonomous Action.</span>
          </h2>
        </div>

        <div 
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="lg:col-span-5 flex flex-col gap-4">
            {steps.map((step, index) => {
              const isActive = activeStep === index;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`text-left p-6 rounded-3xl border transition-all duration-300 relative group ${
                    isActive 
                      ? `${step.activeBorder} ${step.activeBg} shadow-sm ring-1 ring-black/5` 
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50'
                  }`}
                >
                  <div className="flex items-start gap-5 relative z-10">
                    <div 
                      className={`mt-1 flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-300 ${
                        isActive ? `${step.iconBg} ${step.iconBorder} border shadow-sm` : 'bg-slate-50 border border-slate-100 text-slate-400 group-hover:bg-slate-100'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold tracking-tight mb-2 ${isActive ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                        {step.title}
                      </h3>
                      <p className={`text-sm md:text-base leading-relaxed ${isActive ? 'text-slate-700' : 'text-slate-500'}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 h-[500px] w-full relative">
             <div className="absolute inset-0 bg-white rounded-3xl border border-slate-200 p-2 md:p-3 shadow-xl shadow-slate-200/50 flex flex-col transition-all duration-500">
                <div className="flex justify-between items-center pb-3 pt-2 px-4 border-b border-slate-100 mb-3">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-400">
                    System Viewport
                  </span>
                  <span className="font-semibold text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                    Step {activeStep + 1} of 3
                  </span>
                </div>
                
                <div className="flex-1 relative overflow-hidden rounded-2xl">
                  {renderVisualizer()}
                </div>
             </div>
          </div>
        </div>

      </div>
    </section>
  );
}