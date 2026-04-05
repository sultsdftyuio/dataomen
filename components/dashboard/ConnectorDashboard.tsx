// components/dashboard/ConnectorDashboard.tsx

"use client";

import React, { useEffect, useState } from "react";
import { Activity, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ApiClient } from "@/lib/api-client";

interface MetricView {
  id: string;
  metric_name: string;
  description: string;
  compiled_sql: string;
}

interface ConnectorDashboardProps {
  integrationName: "stripe" | "shopify" | "salesforce" | "meta-ads" | string;
}

export const ConnectorDashboard: React.FC<ConnectorDashboardProps> = ({ integrationName }) => {
  // We temporarily retain the chart execution logic here for Phase 1.
  // In Phase 4 (Orchestration), this will migrate down into <AnalyticalGrid />
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
        console.error(`[SmartHub] Error fetching ${integrationName} metrics:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [integrationName]);

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
                message: error.message || `Failed to execute view.`,
                sql_used: metric.compiled_sql,
              }
            }));
          }
        })
      );
    };

    executeMetrics();
  }, [metrics]);

  const titleRegex = new RegExp(`vw_${integrationName.toLowerCase()}_`, 'i');

  return (
    <div className="flex flex-col space-y-8 w-full max-w-[1600px] mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. SMART HUB HEADER */}
      <header className="flex items-center justify-between pb-6 border-b border-border/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-muted/50 to-muted flex items-center justify-center border border-border shadow-sm">
            <span className="text-xl font-bold capitalize text-foreground">{integrationName[0]}</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight capitalize text-foreground">
              {integrationName} Intelligence
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Live Data Pipeline Active
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.location.reload()} 
            className="p-2.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors border border-transparent hover:border-border/50"
            title="Force refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. EXECUTIVE KPI STRIP (Slot prepared for Phase 2) */}
      <section className="w-full">
        <div className="h-28 w-full rounded-2xl border border-dashed border-border/50 bg-muted/5 flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 opacity-50" />
            &lt;ExecutiveKPIStrip /&gt; slot ready for Phase 2
          </span>
        </div>
      </section>

      {/* 3. MIDDLE TIER: ANALYTICAL GRID & INSIGHTS FEED */}
      <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* Analytical Grid */}
        <div className="xl:col-span-3 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium tracking-tight text-foreground">Analytical Grid</h2>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-muted/10 rounded-3xl border border-border/30">
              <RefreshCw className="w-5 h-5 animate-spin mb-4 text-blue-500" />
              <p className="text-sm font-medium">Compiling canonical data models...</p>
            </div>
          ) : metrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-muted/10 rounded-3xl border border-border/30">
              <AlertCircle className="w-6 h-6 mb-3 opacity-30" />
              <p className="text-sm">No semantic models mapped for <span className="capitalize">{integrationName}</span> yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {metrics.map((metric) => {
                const payload = chartPayloads[metric.id];
                const cleanTitle = metric.metric_name
                  .replace(titleRegex, '')
                  .replace(/_/g, ' ')
                  .toUpperCase();

                return (
                  <div key={metric.id} className="flex flex-col group bg-card border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="mb-4 px-1">
                      <h3 className="text-[13px] font-semibold text-foreground/90 uppercase tracking-wide">
                        {cleanTitle}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {metric.description}
                      </p>
                    </div>

                    {payload ? (
                      <div className="mt-2">
                        <DynamicChartFactory payload={payload} />
                      </div>
                    ) : (
                      <div className="h-[300px] w-full bg-muted/20 rounded-xl border border-border/50 animate-pulse flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-2 w-2 bg-blue-500/50 rounded-full animate-ping" />
                          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Executing Job...</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Insights Feed Mini */}
        <div className="xl:col-span-1 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Priority Insights
            </h2>
          </div>
          <div className="h-[500px] w-full rounded-2xl border border-dashed border-border/50 bg-muted/5 flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest text-center px-4 leading-relaxed">
              &lt;InsightsFeedMini /&gt; <br/> slot ready for Phase 2
            </span>
          </div>
        </div>
      </section>

      {/* 4. OMNISCIENT SCRATCHPAD (Slot ready for Phase 5 context injection) */}
      {/* <OmniscientScratchpad 
          context={{ 
            activeConnector: integrationName, 
            visibleMetrics: metrics.map(m => m.metric_name) 
          }} 
        /> 
      */}
    </div>
  );
};