'use client';

import { Sparkles, ArrowRight, Paperclip } from 'lucide-react';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden flex flex-col items-center justify-center min-h-[85vh]">
      {/* Soft glowing background effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-purple-300 text-sm font-medium mb-8 border border-white/10 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
          Agent Swarm Online & Ready
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white leading-tight">
          Chat with your data. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
            Deploy AI Agents.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Ask questions in plain English to generate instant insights, or deploy autonomous Python watchdogs to monitor your datasets for anomalies 24/7.
        </p>
        
        {/* Mock Chat Input (Julius Style) */}
        <div className="relative max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-2 backdrop-blur-xl shadow-2xl transition-all hover:border-purple-500/50 group">
          <div className="flex items-center gap-3 px-4 py-3">
            <button className="p-2 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-xl">
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              placeholder="e.g. Deploy an agent to watch for MRR drops..." 
              className="flex-1 bg-transparent border-none text-white text-lg placeholder:text-slate-500 focus:outline-none group-hover:placeholder:text-slate-400 transition-colors"
              readOnly
            />
            <Link href="/register" className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors flex items-center justify-center shadow-lg shadow-purple-500/25">
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-500 font-medium">
          Powered by DuckDB Analytics • In-Process Execution
        </p>
      </div>
    </section>
  );
}