'use client';

import Link from 'next/link';
import { ArrowUpRight, Bot, Terminal, Activity } from 'lucide-react';

export function BlueprintHero() {
  return (
    <section className="relative pt-32 pb-24 border-b-2 border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-end gap-12">
        
        {/* Left Content */}
        <div className="flex-1 w-full pb-8">
          <div className="inline-flex items-center gap-3 px-3 py-1 bg-slate-900 text-white font-mono text-xs uppercase tracking-widest mb-8 shadow-[4px_4px_0px_0px_#f97316]">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            SYS.STATUS: AGENT SWARM ONLINE
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] text-slate-900 mb-8 uppercase">
            Deploy <br />
            <span className="text-transparent [-webkit-text-stroke:2px_#0f172a]">AI Agents.</span>
          </h1>
          
          <p className="max-w-xl text-xl text-slate-700 font-medium mb-10 border-l-4 border-orange-500 pl-6">
            Stop querying manually. Deploy autonomous Python watchdogs, semantic NL2SQL routers, and vectorized anomaly detectors to monitor your DuckDB and Parquet datasets 24/7.
          </p>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0">
            <Link 
              href="/register" 
              className="group flex items-center justify-between gap-4 px-8 py-5 bg-slate-900 text-white text-lg font-bold uppercase tracking-wider hover:bg-orange-500 transition-colors border-2 border-slate-900"
            >
              Initialize Agent
              <ArrowUpRight className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Link>
            <Link 
              href="/agents" 
              className="flex items-center justify-center gap-3 px-8 py-5 bg-white text-slate-900 text-lg font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors border-2 border-l-0 border-slate-900"
            >
              <Bot className="w-5 h-5" />
              View Swarm
            </Link>
          </div>
        </div>

        {/* Right Content / Agent Telemetry Diagram */}
        <div className="hidden lg:block w-full max-w-lg border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-center">
            <span className="font-mono text-sm font-bold uppercase flex items-center gap-2 text-slate-900">
              <Terminal className="w-4 h-4"/> Live Agent Telemetry
            </span>
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
          
          <div className="space-y-4 font-mono text-sm">
            <div className="flex justify-between border-b border-slate-200 pb-2 group">
              <span className="text-slate-500 group-hover:text-slate-900 transition-colors">Semantic NL2SQL Router</span>
              <span className="font-bold text-emerald-600">IDLE (Awaiting Prompt)</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2 group">
              <span className="text-slate-500 group-hover:text-slate-900 transition-colors">NumPy Watchdog</span>
              <span className="font-bold text-orange-500 animate-pulse">EXECUTING (EMA)</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2 group">
              <span className="text-slate-500 group-hover:text-slate-900 transition-colors">Target Payload</span>
              <span className="font-bold text-slate-900 truncate max-w-[150px]" title="s3://tenant_44/metrics.parquet">
                s3://tenant_44/metrics.parquet
              </span>
            </div>
            <div className="flex justify-between pb-2 group">
              <span className="text-slate-500 group-hover:text-slate-900 transition-colors">Execution Context</span>
              <span className="font-bold text-slate-900">DuckDB (In-Process)</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t-2 border-slate-900 flex items-center justify-between bg-slate-50 px-4 py-3">
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 text-sm uppercase">Vectorized Compute</span>
              <span className="text-xs text-slate-500 font-medium tracking-wide">Outlier Detection Latency</span>
            </div>
            <span className="font-mono font-black text-orange-500 text-xl">14ms</span>
          </div>
        </div>

      </div>
    </section>
  );
}