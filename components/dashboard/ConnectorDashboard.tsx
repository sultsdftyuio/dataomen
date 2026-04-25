"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Activity, AlertCircle, RefreshCw, Database } from "lucide-react";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutiveKPICard } from "@/components/dashboard/ExecutiveKPICard";
import { InsightsFeed } from "@/components/dashboard/InsightsFeed";
import { KPIEngine, KPI } from "@/lib/intelligence/kpi-engine";
import { ChartOrchestrator, ChartJob } from "@/lib/intelligence/chart-orchestrator";

// -----------------------------------------------------------------------------
// Type Definitions & Error Boundary
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

// Extending ChartJob locally to enforce session tracking type safety
type SessionChartJob = ChartJob & { runId?: number };

class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ChartErrorBoundary] Render crash protected:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white border border-rose-200/80 rounded-2xl p-5 shadow-sm h-[380px] flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
          <h3 className="text-sm font-extrabold text-slate-900">Visualization Crashed</h3>
          <p className="text-xs text-slate-500 mt-1">An unexpected error occurred while rendering this metric.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Helper to prevent regex recompilation on every execution
const getIntegrationTitleRegex = (integrationName: string) => 
  new RegExp(`^vw_${integrationName.toLowerCase()}_`, "i");

const normalizeMetricName = (name: string, regex: RegExp) => {
  return name.replace(regex, "").replace(/_/g, " ").trim().toUpperCase();
};

// -----------------------------------------------------------------------------
// Core Smart Hub Orchestrator (Phase 7 - Hardened Session Architecture)
// -----------------------------------------------------------------------------
export const ConnectorDashboard: React.FC<ConnectorDashboardProps> = ({ integrationName }) => {
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  const [kpis, setKpis] = useState<Record<string, KPI>>({});
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // 1. Core State Refs for Deterministic Execution Tracking
  const sessionRunId = useRef(0);
  const metricHashes = useRef<Map<string, string>>(new Map());
  const metricSubscriptions = useRef<Map<string, () => void>>(new Map());

  // 2. Initialize Execution Orchestrator with Execution-Level Session Guard
  const orchestrator = useMemo(() => {
    return new ChartOrchestrator(
      async (query, params, signal) => {
        // Capture exact run ID at the absolute start of execution attempt
        const executionRunId = sessionRunId.current;
        
        const response = await fetch("/api/query/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: query }),
          signal,
        });

        // HARD CANCEL BOUNDARY: If session advanced while waiting for network, throw instantly
        if (sessionRunId.current !== executionRunId) {
          throw new Error("Execution aborted: Session advanced during flight");
        }

        if (!response.ok) throw new Error("Failed to execute canonical view");
        const result = await response.json();
        return result.data;
      },
      { maxConcurrency: 3, maxRetries: 2 }
    );
  }, []); 

  const titleRegex = useMemo(() => getIntegrationTitleRegex(integrationName), [integrationName]);

  // ---------------------------------------------------------------------------
  // EFFECT 1: Strict Session Reset Boundary
  // ---------------------------------------------------------------------------
  useEffect(() => {
    sessionRunId.current += 1;
    
    orchestrator.flush();
    setKpis({});
    setMetrics([]);
    setIsLoadingMetadata(true);
    
    metricHashes.current.clear();
    metricSubscriptions.current.forEach((unsub) => unsub());
    metricSubscriptions.current.clear();

    return () => {
      orchestrator.flush();
      metricSubscriptions.current.forEach((unsub) => unsub());
      metricSubscriptions.current.clear();
    };
  }, [integrationName, orchestrator]);

  // ---------------------------------------------------------------------------
  // EFFECT 2: Semantic Model Data Fetching
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const currentRunId = sessionRunId.current;
    const controller = new AbortController();

    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/insights/metrics?integration=${integrationName}`, {
          signal: controller.signal,
        });
        
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const data = await res.json();
        
        if (sessionRunId.current === currentRunId) {
          setMetrics(data.metrics || []);
        }
      } catch (error: any) {
        if (error.name !== "AbortError" && sessionRunId.current === currentRunId) {
          console.error(`[SmartHub] Error fetching ${integrationName} semantic models:`, error);
        }
      } finally {
        if (sessionRunId.current === currentRunId) {
          setIsLoadingMetadata(false);
        }
      }
    };

    fetchMetrics();
    return () => controller.abort();
  }, [integrationName]);

  // ---------------------------------------------------------------------------
  // EFFECT 3: Job Queueing & Incremental Diffing Engine
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (metrics.length === 0) return;
    const currentRunId = sessionRunId.current;
    const activeMetricIds = new Set<string>();

    metrics.forEach((metric) => {
      activeMetricIds.add(metric.id);
      
      // Strict Fingerprint: Hash includes structural components, not just ID
      const fingerprint = `${metric.id}|${metric.compiled_sql}|${metric.metric_name}|${metric.description}`;
      if (metricHashes.current.get(metric.id) === fingerprint) return;
      
      // Pre-cleanup if we are recalculating an existing metric ID with a new fingerprint
      if (metricSubscriptions.current.has(metric.id)) {
        metricSubscriptions.current.get(metric.id)?.();
        metricSubscriptions.current.delete(metric.id);
      }

      metricHashes.current.set(metric.id, fingerprint);

      const isRevenue =
        metric.metric_name.toLowerCase().includes("revenue") ||
        metric.metric_name.toLowerCase().includes("mrr");

      // Inject deterministic run ID into the job packet
      orchestrator.addJob({
        id: metric.id,
        query: metric.compiled_sql,
        priority: isRevenue ? 100 : 50,
        group: isRevenue ? "financials" : "engagement",
        runId: currentRunId,
      } as any);

      const unsubscribe = orchestrator.subscribe(metric.id, (job: SessionChartJob) => {
        // Subscription-Level Hard Boundary Check
        if (job.runId !== undefined && job.runId !== sessionRunId.current) return;

        if (job.status === "ready" && job.result) {
          const extractedKpi = KPIEngine.extract(job.result, {
            id: metric.id,
            label: normalizeMetricName(metric.metric_name, titleRegex),
            timeColumn: "created_at",
            valueColumn: "value",
            formatType: isRevenue ? "currency" : "number",
            polarity: metric.metric_name.toLowerCase().includes("churn") ? "positive_down" : "positive_up",
            source: integrationName,
          });

          if (extractedKpi) {
            setKpis((prev) => ({ ...prev, [metric.id]: extractedKpi }));
          }
        }
      });

      metricSubscriptions.current.set(metric.id, unsubscribe);
    });

    // Post-computation sweep: Remove deleted metrics from memory pools
    for (const id of metricHashes.current.keys()) {
      if (!activeMetricIds.has(id)) {
        metricSubscriptions.current.get(id)?.();
        metricSubscriptions.current.delete(id);
        metricHashes.current.delete(id);
      }
    }

  }, [metrics, integrationName, orchestrator, titleRegex]);

  const topMetrics = useMemo(() => metrics.slice(0, 4), [metrics]);

  return (
    <div className="flex flex-col space-y-8 w-full max-w-[1600px] mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <SmartHubHeader integrationName={integrationName} orchestrator={orchestrator} />

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoadingMetadata ? (
           Array.from({ length: 4 }).map((_, i) => <ExecutiveKPICard key={`skeleton-${i}`} kpi={{} as any} isLoading />)
        ) : (
           topMetrics.map((metric) => (
             <ProgressiveKPICard key={metric.id} metricId={metric.id} kpis={kpis} />
           ))
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-3">
          <AnalyticalGrid 
            integrationName={integrationName} 
            metrics={metrics} 
            titleRegex={titleRegex}
            orchestrator={orchestrator}
            isLoadingMetadata={isLoadingMetadata} 
            sessionRunIdRef={sessionRunId}
          />
        </div>
        <div className="xl:col-span-1">
          <InsightsFeed />
        </div>
      </section>

      <div className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-slate-900 shadow-xl flex items-center justify-center group hover:w-56 hover:rounded-2xl transition-all duration-300 cursor-pointer z-50">
        <Activity className="w-5 h-5 text-blue-400 group-hover:mr-3 shrink-0" />
        <span className="text-[10px] font-bold font-mono text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[180px]">
          Omniscient Scratchpad
        </span>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------

const SmartHubHeader = ({ integrationName, orchestrator }: { integrationName: string; orchestrator: ChartOrchestrator }) => (
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
        onClick={() => {
          orchestrator.flush();
          window.location.reload();
        }} 
        className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-500 transition-colors border border-slate-200 shadow-sm"
        title="Force Refresh Data"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  </header>
);

const ProgressiveKPICard = React.memo(({ metricId, kpis }: { metricId: string; kpis: Record<string, KPI> }) => {
  const kpi = kpis[metricId];
  if (!kpi) return <ExecutiveKPICard kpi={{} as any} isLoading />;
  return <ExecutiveKPICard kpi={kpi} />;
});
ProgressiveKPICard.displayName = "ProgressiveKPICard";

const AnalyticalGrid = ({ integrationName, metrics, titleRegex, orchestrator, isLoadingMetadata, sessionRunIdRef }: {
  integrationName: string;
  metrics: MetricView[];
  titleRegex: RegExp;
  orchestrator: ChartOrchestrator;
  isLoadingMetadata: boolean;
  sessionRunIdRef: React.MutableRefObject<number>;
}) => {
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
          {metrics.map((metric) => (
            <ChartErrorBoundary key={metric.id}>
              <ProgressiveChartCard 
                metric={metric} 
                titleRegex={titleRegex}
                orchestrator={orchestrator} 
                sessionRunIdRef={sessionRunIdRef}
              />
            </ChartErrorBoundary>
          ))}
        </div>
      )}
    </div>
  );
};

const ProgressiveChartCard = React.memo(({ metric, titleRegex, orchestrator, sessionRunIdRef }: { 
  metric: MetricView; 
  titleRegex: RegExp;
  orchestrator: ChartOrchestrator; 
  sessionRunIdRef: React.MutableRefObject<number>;
}) => {
  const [jobState, setJobState] = useState<ChartJob | null>(null);
  const cleanTitle = useMemo(() => normalizeMetricName(metric.metric_name, titleRegex), [metric.metric_name, titleRegex]);

  useEffect(() => {
    if (!metric?.id) return;

    const unsubscribe = orchestrator.subscribe(metric.id, (state: SessionChartJob) => {
      // ⚠️ Real-Time Execution Guard: Using mutable ref guarantees absolute freshness
      if (state.runId !== undefined && state.runId !== sessionRunIdRef.current) return;
      setJobState(state);
    });
    
    return () => unsubscribe();
  }, [metric?.id, orchestrator, sessionRunIdRef]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-blue-200 transition-all flex flex-col group h-[380px]">
      <div className="mb-4 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">{cleanTitle}</h3>
            <p className="text-sm text-slate-900 font-medium mt-1.5 line-clamp-1">{metric.description}</p>
          </div>
          {jobState?.status === "idle" && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md shrink-0">Queued</span>}
          {jobState?.status === "loading" && <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-md animate-pulse shrink-0">Computing</span>}
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
});
ProgressiveChartCard.displayName = "ProgressiveChartCard";