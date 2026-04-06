// components/dashboard/ConnectorDashboard.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Activity, AlertCircle, RefreshCw, Database } from "lucide-react";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutiveKPICard } from "@/components/dashboard/ExecutiveKPICard";
import { InsightsFeed } from "@/components/dashboard/InsightsFeed";
import { ApiClient } from "@/lib/api-client";
import { KPIEngine, KPI } from "@/lib/intelligence/kpi-engine";
import { ChartOrchestrator, ChartJob } from "@/lib/intelligence/chart-orchestrator";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface MetricView {
  id: string;
  metric_name: string;
  description: string;
  compiled_sql: string;
}

interface ConnectorDashboardProps {
  integrationName: string;
}

// -----------------------------------------------------------------------------
// Core Smart Hub Orchestrator (Phase 4 Finalization)
// -----------------------------------------------------------------------------
export const ConnectorDashboard: React.FC<ConnectorDashboardProps> = ({ integrationName }) => {
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  const [kpis, setKpis] = useState<Record<string, KPI>>({});
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // 1. Initialize the Execution Orchestrator (Singleton per hub instance)
  const orchestrator = useMemo(() => new ChartOrchestrator(
    async (query, params, signal) => {
      // In a real app, ensure ApiClient supports passing the AbortSignal
      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: query }),
        signal 
      });
      
      if (!response.ok) throw new Error("Failed to execute canonical view");
      const result = await response.json();
      return result.data;
    },
    { maxConcurrency: 3, maxRetries: 2 }
  ), []);

  // 2. Fetch Semantic Models (Phase 1 Foundation)
  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoadingMetadata(true);
      try {
        const res = await fetch(`/api/insights/metrics?integration=${integrationName}`);
        if (!res.ok) throw new Error("Failed to fetch metrics");
        
        const data = await res.json();
        setMetrics(data.metrics || []);
      } catch (error) {
        console.error(`[SmartHub] Error fetching ${integrationName} semantic models:`, error);
      } finally {
        setIsLoadingMetadata(false);
      }
    };

    fetchMetrics();

    // Cleanup: Flush queue if user unmounts/switches connectors
    return () => orchestrator.flush();
  }, [integrationName, orchestrator]);

  // 3. Queue Jobs & Extract Intelligence
  useEffect(() => {
    if (metrics.length === 0) return;

    metrics.forEach((metric) => {
      const isRevenue = metric.metric_name.toLowerCase().includes("revenue") || metric.metric_name.toLowerCase().includes("mrr");
      
      // Queue the job with calculated priority
      orchestrator.addJob({
        id: metric.id,
        query: metric.compiled_sql,
        priority: isRevenue ? 100 : 50, // Prioritize financial data
        group: isRevenue ? "financials" : "engagement"
      });

      // Synchronously subscribe to the orchestrator to extract KPIs as soon as data arrives
      const unsubscribe = orchestrator.subscribe(metric.id, (job) => {
        if (job.status === "ready" && job.result) {
          const extractedKpi = KPIEngine.extract(job.result, {
            id: metric.id,
            label: metric.metric_name.replace(/^vw_[^_]+_/i, '').replace(/_/g, ' ').toUpperCase(),
            timeColumn: "created_at",
            valueColumn: "value",      
            formatType: isRevenue ? "currency" : "number",
            polarity: metric.metric_name.toLowerCase().includes("churn") ? "positive_down" : "positive_up",
            source: integrationName
          });

          if (extractedKpi) {
            setKpis((prev) => ({ ...prev, [metric.id]: extractedKpi }));
          }
        }
      });

      return () => unsubscribe();
    });
  }, [metrics, integrationName, orchestrator]);

  return (
    <div className="flex flex-col space-y-8 w-full max-w-[1600px] mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. SMART HUB HEADER */}
      <SmartHubHeader integrationName={integrationName} orchestrator={orchestrator} />

      {/* 2. EXECUTIVE KPI STRIP (Progressive Rendering) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoadingMetadata ? (
           Array(4).fill(0).map((_, i) => <ExecutiveKPICard key={i} kpi={{} as any} isLoading />)
        ) : (
           metrics.slice(0, 4).map((metric) => (
             <ProgressiveKPICard key={metric.id} metricId={metric.id} kpis={kpis} />
           ))
        )}
      </section>

      {/* 3. MIDDLE TIER: ANALYTICAL GRID & INSIGHTS FEED */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-3">
          <AnalyticalGrid 
            integrationName={integrationName} 
            metrics={metrics} 
            orchestrator={orchestrator}
            isLoadingMetadata={isLoadingMetadata} 
          />
        </div>
        
        <div className="xl:col-span-1">
          <InsightsFeed />
        </div>
      </section>

      {/* 4. OMNISCIENT SCRATCHPAD SLOT */}
      <div className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-slate-900 shadow-xl flex items-center justify-center group hover:w-56 hover:rounded-2xl transition-all duration-300 cursor-pointer z-50">
        <Activity className="w-5 h-5 text-blue-400 group-hover:mr-3" />
        <span className="text-[10px] font-bold font-mono text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Omniscient Scratchpad
        </span>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Sub-Components (Orchestrator Pub/Sub Bindings)
// -----------------------------------------------------------------------------

const SmartHubHeader = ({ integrationName, orchestrator }: { integrationName: string, orchestrator: ChartOrchestrator }) => (
  <header className="flex items-center justify-between pb-6 border-b border-slate-200/80">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center border border-slate-200 shadow-sm">
        <Database className="w-5 h-5 text-slate-700" />
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight capitalize text-slate-900">
          {integrationName} Intelligence
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            Queue Orchestrator Active
          </span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <button 
        onClick={() => window.location.reload()} 
        className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-500 transition-colors border border-slate-200 shadow-sm"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  </header>
);

const ProgressiveKPICard = ({ metricId, kpis }: { metricId: string, kpis: Record<string, KPI> }) => {
  const kpi = kpis[metricId];
  if (!kpi) return <ExecutiveKPICard kpi={{} as any} isLoading />;
  return <ExecutiveKPICard kpi={kpi} />;
};

const AnalyticalGrid = ({ integrationName, metrics, orchestrator, isLoadingMetadata }: any) => {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Analytical Grid</h2>
      {isLoadingMetadata ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <RefreshCw className="w-5 h-5 animate-spin mb-4 text-blue-500" />
          <p className="text-sm font-bold text-slate-500">Compiling canonical data models...</p>
        </div>
      ) : metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50/50 rounded-3xl border border-dashed border-slate-300">
          <AlertCircle className="w-6 h-6 mb-3 opacity-30" />
          <p className="text-sm font-medium">No semantic models mapped for <span className="capitalize text-slate-900">{integrationName}</span>.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metrics.map((metric: any) => (
            <ProgressiveChartCard 
              key={metric.id} 
              metric={metric} 
              orchestrator={orchestrator} 
              integrationName={integrationName}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Isolated Component that subscribes solely to its own chart execution job
const ProgressiveChartCard = ({ metric, orchestrator, integrationName }: { metric: any, orchestrator: ChartOrchestrator, integrationName: string }) => {
  const [jobState, setJobState] = useState<ChartJob | null>(null);
  const titleRegex = new RegExp(`vw_${integrationName.toLowerCase()}_`, 'i');
  const cleanTitle = metric.metric_name.replace(titleRegex, '').replace(/_/g, ' ').toUpperCase();

  useEffect(() => {
    // Native pub/sub subscription for React rendering
    const unsubscribe = orchestrator.subscribe(metric.id, (state) => {
      setJobState(state);
    });
    return () => unsubscribe();
  }, [metric.id, orchestrator]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-blue-200 transition-all flex flex-col group h-[380px]">
      <div className="mb-4 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">{cleanTitle}</h3>
            <p className="text-sm text-slate-900 font-medium mt-1.5 line-clamp-1">{metric.description}</p>
          </div>
          {/* Status Indicators */}
          {jobState?.status === "idle" && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">Queued</span>}
          {jobState?.status === "loading" && <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-md animate-pulse">Computing</span>}
        </div>
      </div>
      
      <div className="flex-1 mt-2 relative flex flex-col justify-center">
        {!jobState || jobState.status === "idle" || jobState.status === "loading" ? (
          <div className="absolute inset-0 animate-pulse bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
            <Activity className="w-6 h-6 text-slate-300" />
          </div>
        ) : jobState.status === "error" ? (
          <div className="flex flex-col items-center text-center px-4">
            <AlertCircle className="w-5 h-5 text-rose-400 mb-2" />
            <span className="text-xs text-rose-600 font-medium">{jobState.error}</span>
          </div>
        ) : (
          <DynamicChartFactory payload={{ type: "chart", data: jobState.result, sql_used: metric.compiled_sql }} />
        )}
      </div>
    </div>
  );
};