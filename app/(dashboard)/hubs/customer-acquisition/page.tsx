// app/(dashboard)/hubs/customer-acquisition/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Network, 
  RefreshCw, 
  Target, 
  Activity, 
  AlertCircle 
} from "lucide-react";

import { ExecutiveKPICard } from "@/components/dashboard/ExecutiveKPICard";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { OmniscientScratchpad } from "@/components/dashboard/OmniscientScratchpad";
import { InsightsFeed } from "@/components/dashboard/InsightsFeed";

import { KPI } from "@/lib/intelligence/kpi-engine";
import { OmniGraphEngineV3 } from "@/lib/intelligence/omni-graph";
import { ChartOrchestrator, ChartJob } from "@/lib/intelligence/chart-orchestrator";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface BlendedMetricsState {
  roas: KPI | null;
  cac: KPI | null;
  totalSpend: KPI | null;
  newLogos: KPI | null;
}

// -----------------------------------------------------------------------------
// Phase 6: Omni-Graph Hub (Customer Acquisition)
// -----------------------------------------------------------------------------
export default function CustomerAcquisitionHub() {
  const [kpis, setKpis] = useState<BlendedMetricsState>({
    roas: null,
    cac: null,
    totalSpend: null,
    newLogos: null,
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // 1. Initialize the Execution Orchestrator for Cross-Warehouse Queries
  const orchestrator = useMemo(() => new ChartOrchestrator(
    async (query, params, signal) => {
      // In a real implementation, this hits a dedicated Omni-Graph API endpoint
      // that can route queries to Meta, Stripe, and Google Ads concurrently.
      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: query }),
        signal 
      });
      if (!response.ok) throw new Error("Omni-Graph query failed");
      const result = await response.json();
      return result.data;
    },
    { maxConcurrency: 5, maxRetries: 2 } // Higher concurrency for multi-source hubs
  ), []);

  // 2. Synthesize Omni-Graph Data
  useEffect(() => {
    const synthesizeHubData = async () => {
      setIsLoading(true);

      try {
        // Step A: Queue the raw canonical queries needed for the math
        orchestrator.addJob({ id: "stripe_revenue", query: "SELECT created_at, amount as value FROM stripe_charges", priority: 100, group: "finance" });
        orchestrator.addJob({ id: "stripe_customers", query: "SELECT created_at, 1 as value FROM stripe_customers", priority: 100, group: "growth" });
        orchestrator.addJob({ id: "meta_spend", query: "SELECT date as created_at, spend as value FROM meta_ads_insights", priority: 90, group: "marketing" });
        orchestrator.addJob({ id: "google_spend", query: "SELECT date as created_at, cost as value FROM google_ads_campaigns", priority: 90, group: "marketing" });

        // Step B: Wait for the orchestrator to resolve the high-priority raw data
        // (In a production React environment, you'd use the pub/sub .subscribe() model, 
        // but for mathematical blending, Promise.all on the cache is cleaner)
        const fetchJobResult = (id: string) => new Promise<any[]>((resolve) => {
          const unsubscribe = orchestrator.subscribe(id, (job) => {
            if (job.status === "ready") {
              unsubscribe();
              resolve(job.result || []);
            } else if (job.status === "error") {
              unsubscribe();
              resolve([]); // Fallback to empty array on failure to prevent entire hub crash
            }
          });
        });

        const [revenueData, customerData, metaSpendData, googleSpendData] = await Promise.all([
          fetchJobResult("stripe_revenue"),
          fetchJobResult("stripe_customers"),
          fetchJobResult("meta_spend"),
          fetchJobResult("google_spend")
        ]);

        // Step C: Route through the Deterministic Omni-Graph Engine
        const computedKpis = OmniGraphEngineV3.compute({
          revenue: revenueData,
          customers: customerData,
          spend: [...metaSpendData, ...googleSpendData],
        });
        const blendedROAS = computedKpis.find((kpi): kpi is KPI => kpi?.id === "blended_roas") ?? null;
        const blendedCAC = computedKpis.find((kpi): kpi is KPI => kpi?.id === "blended_cac") ?? null;

        setKpis({
          roas: blendedROAS,
          cac: blendedCAC,
          totalSpend: null, // Compute similar to above
          newLogos: null    // Compute similar to above
        });

      } catch (error) {
        console.error("[OmniGraph] Synthesis Engine Failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    synthesizeHubData();

    return () => orchestrator.flush();
  }, [orchestrator]);

  return (
    <main className="flex-1 w-full h-full bg-[#fafafa] min-h-screen px-4 md:px-8 pt-6 pb-24">
      <div className="flex flex-col space-y-8 w-full max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* 1. OMNI-GRAPH HEADER */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-200/80">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 shadow-md">
              <Network className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight capitalize text-slate-900">
                Customer Acquisition Hub
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Omni-Graph Synthesizer Active (Stripe + Meta + Google)
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-500 transition-colors border border-slate-200 shadow-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 2. EXECUTIVE BLENDED KPI STRIP */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
             Array(4).fill(0).map((_, i) => <ExecutiveKPICard key={i} kpi={{} as any} isLoading />)
          ) : (
            <>
              {kpis.roas ? <ExecutiveKPICard kpi={kpis.roas} /> : <MissingDataCard label="Blended ROAS" />}
              {kpis.cac ? <ExecutiveKPICard kpi={kpis.cac} /> : <MissingDataCard label="Blended CAC" />}
              <MissingDataCard label="Total Ad Spend" /> {/* Placeholders for the complete implementation */}
              <MissingDataCard label="New Logos" />
            </>
          )}
        </section>

        {/* 3. MIDDLE TIER: SYNTHESIZED ANALYTICS & INSIGHTS */}
        <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 space-y-6">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-slate-400" /> Vectorized Analytics
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Example of a cross-warehouse chart that would be fed by the orchestrator */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-blue-200 transition-all flex flex-col h-[380px]">
                <div className="mb-4 shrink-0">
                  <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">Ad Spend vs Revenue Convergence</h3>
                  <p className="text-sm text-slate-900 font-medium mt-1.5">Correlation mapping across all marketing channels vs recognized revenue.</p>
                </div>
                <div className="flex-1 mt-2 relative flex flex-col justify-center items-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <Activity className="w-6 h-6 text-slate-300 mb-2" />
                  <span className="text-xs font-bold text-slate-400">Waiting for Data Streams</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-blue-200 transition-all flex flex-col h-[380px]">
                <div className="mb-4 shrink-0">
                  <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">CAC by Channel</h3>
                  <p className="text-sm text-slate-900 font-medium mt-1.5">Isolated customer acquisition costs split by platform.</p>
                </div>
                <div className="flex-1 mt-2 relative flex flex-col justify-center items-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                   <Activity className="w-6 h-6 text-slate-300 mb-2" />
                   <span className="text-xs font-bold text-slate-400">Waiting for Data Streams</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="xl:col-span-1">
            {/* The Insights Feed will automatically pick up the Blended CAC anomalies */}
            <InsightsFeed />
          </div>
        </section>

      </div>

      {/* 4. CONVERSATIONAL AI CANVAS */}
      <OmniscientScratchpad 
        context={{ 
          activeConnector: "Omni-Graph: Customer Acquisition", 
          kpiStates: [kpis.roas, kpis.cac].filter(Boolean)
        }} 
      />
    </main>
  );
}

// -----------------------------------------------------------------------------
// Micro-Components
// -----------------------------------------------------------------------------
const MissingDataCard = ({ label }: { label: string }) => (
  <div className="flex flex-col items-start justify-center h-[160px] bg-white border border-slate-200/80 shadow-sm rounded-3xl p-6">
    <div className="flex items-center gap-2 mb-2">
      <AlertCircle className="w-4 h-4 text-slate-400" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
    <span className="text-sm font-medium text-slate-500">Awaiting semantic mapping</span>
  </div>
);