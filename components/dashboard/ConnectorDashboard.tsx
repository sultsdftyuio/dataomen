// components/dashboard/ConnectorDashboard.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Activity, AlertCircle, RefreshCw, Sparkles, Database } from "lucide-react";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ApiClient } from "@/lib/api-client";

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
// Core Layout Contract (Phase 1 Foundation)
// -----------------------------------------------------------------------------
export const ConnectorDashboard: React.FC<ConnectorDashboardProps> = ({ integrationName }) => {
  // State lifted to the Hub level. In Phase 4, this orchestrates via chart-orchestrator.ts
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  const [chartPayloads, setChartPayloads] = useState<Record<string, ExecutionPayload>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/insights/metrics?integration=${integrationName}`);
        if (!res.ok) throw new Error("Failed to fetch metrics");
        
        const data = await res.json();
        setMetrics(data.metrics || []);
      } catch (error) {
        console.error(`[SmartHub] Error fetching ${integrationName} semantic models:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [integrationName]);

  // Phase 4 Orchestration stub: Executes charts based on loaded metrics
  useEffect(() => {
    if (metrics.length === 0) return;

    const executeMetrics = async () => {
      await Promise.all(
        metrics.map(async (metric) => {
          try {
            const result = await ApiClient.post<{ data: any[] }>('query/execute', { 
              sql: metric.compiled_sql 
            });
            
            setChartPayloads((prev) => ({
              ...prev,
              [metric.id]: {
                type: "chart",
                data: result.data,
                sql_used: metric.compiled_sql,
              }
            }));
          } catch (error: any) {
            setChartPayloads((prev) => ({
              ...prev,
              [metric.id]: {
                type: "error",
                message: error.message || `Failed to execute canonical view.`,
                sql_used: metric.compiled_sql,
              }
            }));
          }
        })
      );
    };

    executeMetrics();
  }, [metrics]);

  return (
    <div className="flex flex-col space-y-8 w-full max-w-[1600px] mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. SMART HUB HEADER */}
      <SmartHubHeader integrationName={integrationName} />

      {/* 2. EXECUTIVE KPI STRIP */}
      <ExecutiveKPIStrip />

      {/* 3. MIDDLE TIER: ANALYTICAL GRID & INSIGHTS FEED */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-3 space-y-6">
          <AnalyticalGrid 
            integrationName={integrationName} 
            metrics={metrics} 
            chartPayloads={chartPayloads} 
            isLoading={isLoading} 
          />
        </div>
        
        <div className="xl:col-span-1 space-y-6">
          <InsightsFeedMini />
        </div>
      </section>

      {/* 4. OMNISCIENT SCRATCHPAD SLOT */}
      <OmniscientScratchpadSlot 
        context={{ activeConnector: integrationName, visibleMetrics: metrics.map(m => m.metric_name) }} 
      />
    </div>
  );
};

// -----------------------------------------------------------------------------
// Sub-Components (Strict Structural Adherence)
// -----------------------------------------------------------------------------

const SmartHubHeader = ({ integrationName }: { integrationName: string }) => (
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
            Live Data Pipeline Active
          </span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <button 
        onClick={() => window.location.reload()} 
        className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-500 transition-colors border border-slate-200 shadow-sm"
        title="Force refresh pipeline"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  </header>
);

const ExecutiveKPIStrip = () => (
  <section className="w-full">
    <div className="h-32 w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center relative overflow-hidden group hover:border-blue-300 transition-colors">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
      <Activity className="w-5 h-5 text-slate-400 mb-2" />
      <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">
        &lt;ExecutiveKPIStrip /&gt; 
      </span>
      <span className="text-xs text-slate-400 mt-1">Reserved for Phase 2 KPI Engine</span>
    </div>
  </section>
);

const InsightsFeedMini = () => (
  <>
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
          <Sparkles className="w-4 h-4" />
        </div>
        Priority Insights
      </h2>
    </div>
    <div className="h-[500px] w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center relative overflow-hidden group hover:border-blue-300 transition-colors">
      <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest text-center px-4 leading-relaxed">
        &lt;InsightsFeedMini /&gt; <br/> 
      </span>
      <span className="text-xs text-slate-400 mt-1">Reserved for Phase 3 Insight Engine</span>
    </div>
  </>
);

const AnalyticalGrid = ({ integrationName, metrics, chartPayloads, isLoading }: any) => {
  const titleRegex = new RegExp(`vw_${integrationName.toLowerCase()}_`, 'i');

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Analytical Grid</h2>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <RefreshCw className="w-5 h-5 animate-spin mb-4 text-blue-500" />
          <p className="text-sm font-bold">Compiling canonical data models...</p>
        </div>
      ) : metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50/50 rounded-3xl border border-dashed border-slate-300">
          <AlertCircle className="w-6 h-6 mb-3 opacity-30" />
          <p className="text-sm font-medium">No semantic models mapped for <span className="capitalize text-slate-900">{integrationName}</span> yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metrics.map((metric: any) => {
            const payload = chartPayloads[metric.id];
            const cleanTitle = metric.metric_name
              .replace(titleRegex, '')
              .replace(/_/g, ' ')
              .toUpperCase();

            return (
              <div key={metric.id} className="flex flex-col group bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                <div className="mb-4">
                  <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                    {cleanTitle}
                  </h3>
                  <p className="text-sm text-slate-900 font-medium mt-1.5 line-clamp-1">
                    {metric.description}
                  </p>
                </div>

                {payload ? (
                  <div className="mt-2 flex-1">
                    <DynamicChartFactory payload={payload} />
                  </div>
                ) : (
                  <div className="h-[250px] w-full bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-2 w-2 bg-blue-500/50 rounded-full animate-ping" />
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-widest">Scheduling Query...</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

const OmniscientScratchpadSlot = ({ context }: any) => (
  <div className="fixed bottom-6 right-6 w-14 h-14 rounded-full border border-dashed border-slate-400 bg-white shadow-xl flex items-center justify-center group hover:w-56 hover:rounded-2xl transition-all duration-300 overflow-hidden cursor-pointer z-50">
    <Sparkles className="w-5 h-5 text-blue-500 group-hover:mr-3 flex-shrink-0" />
    <span className="text-[10px] font-bold font-mono text-slate-600 uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
      Omniscient Scratchpad
    </span>
  </div>
);