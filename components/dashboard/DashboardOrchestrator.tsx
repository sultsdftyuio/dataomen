"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Database, LayoutTemplate, AlertTriangle, ShieldCheck, Activity } from "lucide-react";

// Strict Named Imports: Prevents Turbopack build failures in Next.js
import { DataPreview } from "./DataPreview";
import { DynamicChartFactory } from "./DynamicChartFactory";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Strict typing for our analytical response payload
export interface AnalyticalResult {
  status: string;
  columns?: string[];
  data?: Record<string, any>[]; // Explicitly typing the data payload array
  visualization_hint?: 'bar' | 'line' | 'scatter' | 'table';
  metrics?: Record<string, any>;
  error?: string;
}

export default function DashboardOrchestrator() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [resultData, setResultData] = useState<AnalyticalResult | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const initTenantContext = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Security by Design: Lock orchestrator to specific tenant boundary
        setTenantId(session.user.id);
      }
    };
    initTenantContext();
  }, [supabase]);

  const handleExecuteQuery = async () => {
    if (!datasetId.trim() || !query.trim()) return;
    setIsQuerying(true);
    setError(null);
    setResultData(null);
    
    try {
      // Vectorized Execution routing (Next.js API -> FastAPI -> DuckDB)
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          dataset_id: datasetId, 
          query: query,
          tenant_id: tenantId // Enforce multi-tenant security
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution engine failed to process query.");
      
      // Pass the fully materialized payload to state
      setResultData(data.results || { status: "Success", data: [], columns: [] });
      
    } catch (err: any) {
      console.error("Orchestration Error:", err);
      setError(err.message || "An unexpected error occurred during execution.");
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full font-sans">
      
      {/* Configuration & Contextual RAG Input Column */}
      <div className="xl:col-span-4 space-y-6 flex flex-col">
        <Card className="shadow-sm border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col">
          <CardHeader className="bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800 pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-500" />
              NL2SQL Execution Engine
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Contextual RAG dynamically translates natural language into optimized DuckDB queries.
            </CardDescription>
            
            {/* Security Boundary Indicator */}
            {tenantId && (
              <Badge variant="outline" className="mt-3 text-[10px] w-fit font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 flex gap-1.5 items-center px-2 py-0.5">
                <ShieldCheck className="w-3 h-3" />
                Tenant Boundary: {tenantId.split('-')[0]}***
              </Badge>
            )}
          </CardHeader>
          
          <CardContent className="pt-6 space-y-5 flex-1 flex flex-col">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                Target Dataset ID
              </label>
              <Input 
                placeholder="e.g., ds_a1b2c3d4" 
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="font-mono text-sm bg-neutral-50 dark:bg-neutral-900/50 focus-visible:ring-blue-500"
              />
            </div>
            
            <div className="space-y-2 flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                Analytical Query
              </label>
              <Input 
                placeholder="e.g., Show 30-day moving average of revenue..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExecuteQuery()}
                className="text-sm focus-visible:ring-blue-500"
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Tip: Ask for "anomalies", "variance", or "trends" to engage the Vectorized Mathematical Engine.
              </p>
            </div>

            <Button 
              className="w-full font-semibold shadow-sm bg-blue-600 hover:bg-blue-700 text-white transition-all h-10 mt-auto" 
              onClick={handleExecuteQuery}
              disabled={isQuerying || !datasetId.trim() || !query.trim()}
            >
              {isQuerying ? (
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 animate-pulse" /> Executing via DuckDB...
                </span>
              ) : "Run Vectorized Query"}
            </Button>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 rounded-md text-xs flex items-start gap-2 border border-red-200 dark:border-red-900/50">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Output Engine / Visualization Layer */}
      <div className="xl:col-span-8 flex flex-col gap-6 h-full">
        
        {/* Dynamic Visualization Canvas */}
        <Card className="flex-1 shadow-sm border-neutral-200 dark:border-neutral-800 flex flex-col min-h-[350px]">
          <CardHeader className="border-b border-neutral-100 dark:border-neutral-800 pb-3 py-4 bg-white dark:bg-black rounded-t-xl">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Dynamic Visualizations
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-1 flex flex-col relative bg-neutral-50/50 dark:bg-neutral-900/30 rounded-b-xl overflow-hidden">
            {/* Array check injection: Only passing down the raw array to strict-typed sub-components */}
            {resultData && resultData.data && resultData.data.length > 0 ? (
               <div className="absolute inset-0 p-4 overflow-auto">
                 <DynamicChartFactory data={resultData.data} />
               </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-400 p-6">
                 <div className="h-12 w-12 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center mb-4">
                    <Search className="w-5 h-5 opacity-60 text-neutral-500" />
                 </div>
                 <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Awaiting Execution</p>
                 <p className="text-xs opacity-75 max-w-[250px] mt-1.5 leading-relaxed">
                    Run a natural language query on the left. The engine will dynamically map results to the optimal charting format.
                 </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stateless Tabular Data Validation Block */}
        <Card className="shadow-sm border-neutral-200 dark:border-neutral-800 flex flex-col h-fit max-h-[350px]">
          <CardHeader className="bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800 pb-3 py-3 rounded-t-xl">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              Raw Data Validation
              {resultData && resultData.data && (
                <span className="text-[10px] font-normal text-neutral-500 font-mono bg-white dark:bg-black px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">
                  {resultData.data.length} row(s) returned
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1 min-h-[150px] bg-white dark:bg-black rounded-b-xl">
            {/* Array check injection */}
            {resultData && resultData.data && resultData.data.length > 0 ? (
               <DataPreview data={resultData.data} />
            ) : (
               <div className="h-full w-full flex items-center justify-center p-6 text-center text-[11px] text-neutral-400 font-mono">
                  &lt; No Vectorized Payload Extracted /&gt;
               </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}