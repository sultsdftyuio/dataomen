'use client';

import { Sparkles, ArrowRight, Paperclip } from 'lucide-react';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden flex flex-col items-center justify-center min-h-[85vh] bg-white">
      {/* Soft light background meshes */}
      <div className="absolute top-0 w-full h-[500px] bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none"></div>
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-purple-100/50 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl">
        
        {/* Agent Swarm Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold mb-8 shadow-sm">
          <span className="relative flex h-2.5 w-2.5 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Agent Swarm Online & Ready
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-slate-900 leading-[1.1]">
          Chat with your data. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            Deploy AI Agents.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed">
          Ask questions in plain English to generate instant insights, or deploy autonomous Python watchdogs to monitor your datasets for anomalies 24/7.
        </p>
        
        {/* Mock Chat Input */}
        <div className="relative max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-2 shadow-xl shadow-slate-200/50 transition-all hover:border-indigo-300 group">
          <div className="flex items-center gap-3 px-4 py-3">
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 rounded-xl border border-slate-100">
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              placeholder="e.g. Deploy an agent to watch for MRR drops..." 
              className="flex-1 bg-transparent border-none text-slate-900 text-lg placeholder:text-slate-400 focus:outline-none"
              readOnly
            />
            <Link href="/register" className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all flex items-center justify-center shadow-md hover:shadow-lg hover:-translate-y-0.5">
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        <p className="mt-8 text-sm text-slate-500 font-medium flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          Powered by DuckDB Analytics • In-Process Execution
        </p>
      </div>
    </section>
  );
}