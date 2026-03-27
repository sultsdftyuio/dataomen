// components/dashboard/ConnectorDashboard.tsx

"use client";

import React, { useEffect, useState } from "react";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
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
  integrationName: "stripe" | "shopify" | "salesforce" | string; // Scalable for future integrations
}

export const ConnectorDashboard: React.FC<ConnectorDashboardProps> = ({ integrationName }) => {
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  const [chartPayloads, setChartPayloads] = useState<Record<string, ExecutionPayload>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch the Auto-Seeded Semantic Metrics from the Next.js API
  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        // Calls the Next.js internal route which enforces RLS and returns the seeded views
        const res = await fetch(`/api/insights/metrics?integration=${integrationName}`);
        if (!res.ok) throw new Error("Failed to fetch metrics");
        
        const data = await res.json();
        setMetrics(data.metrics || []);
      } catch (error) {
        console.error(`[Dashboard] Error fetching ${integrationName} metrics:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [integrationName]);

  // 2. Execute the SQL for each metric via the fast-path backend route
  useEffect(() => {
    if (metrics.length === 0) return;

    const executeMetrics = async () => {
      // Execute in parallel, but update state progressively so charts pop in 
      // instantly as soon as their specific DuckDB query finishes.
      await Promise.all(
        metrics.map(async (metric) => {
          try {
            // Uses your custom ApiClient to securely inject the Supabase JWT Bearer token
            // and route directly to the FastAPI /api/v1/query/execute endpoint
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
            console.error(`[Dashboard] Execution failed for ${metric.metric_name}:`, error);
            setChartPayloads((prev) => ({
              ...prev,
              [metric.id]: {
                type: "error",
                message: error.message || `Failed to execute ${metric.metric_name} view.`,
                sql_used: metric.compiled_sql,
              }
            }));
          }
        })
      );
    };

    executeMetrics();
  }, [metrics]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border/50">
        <RefreshCw className="w-6 h-6 animate-spin mb-4 text-primary" />
        <p className="text-sm font-medium">Compiling {integrationName} analytics...</p>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border/50">
        <Activity className="w-8 h-8 mb-3 opacity-20" />
        <p className="text-sm">No dashboard views found for <span className="capitalize">{integrationName}</span>.</p>
        <p className="text-xs opacity-70 mt-1">Try triggering a historical sync first.</p>
      </div>
    );
  }

  // Dynamic regex to dynamically strip 'vw_stripe_', 'vw_shopify_', etc., from the titles
  const titleRegex = new RegExp(`vw_${integrationName.toLowerCase()}_`, 'i');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight capitalize">
          {integrationName} Performance
        </h2>
      </div>

      {/* Masonry/Grid Layout for Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metrics.map((metric) => {
          const payload = chartPayloads[metric.id];
          const cleanTitle = metric.metric_name
            .replace(titleRegex, '')
            .replace(/_/g, ' ')
            .toUpperCase();

          return (
            <div key={metric.id} className="flex flex-col group">
              {/* Chart Header */}
              <div className="mb-3 px-1">
                <h3 className="text-base font-semibold text-foreground flex items-center">
                  {cleanTitle}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {metric.description}
                </p>
              </div>

              {/* Chart Body using your existing Recharts Factory */}
              {payload ? (
                <DynamicChartFactory payload={payload} />
              ) : (
                <div className="h-[400px] w-full bg-muted/10 rounded-2xl border border-border animate-pulse flex items-center justify-center shadow-sm">
                   <div className="flex flex-col items-center gap-3">
                     <div className="h-3 w-3 bg-primary/40 rounded-full animate-ping" />
                     <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Executing SQL...</span>
                   </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};