// components/dashboard/DashboardOrchestrator.tsx
"use client";

import React, { useState } from "react";
import { Search, Database, LayoutTemplate, AlertTriangle, ShieldCheck, Activity, Sparkles, XCircle } from "lucide-react";

// Strict Named Imports: Prevents Turbopack build failures in Next.js
import { DataPreview } from "./DataPreview";
import { DynamicChartFactory } from "./DynamicChartFactory";
import FileUploadZone, { UploadSuccessData } from "@/components/ingestion/FileUploadZone";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Strict typing for parent injection (Fixes the IntrinsicAttributes error)
export interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
}

// Strict typing for our analytical response payload
export interface AnalyticalResult {
  status: string;
  columns?: string[];
  data?: Record<string, any>[]; // Explicitly typing the data payload array
  visualization_hint?: 'bar' | 'line' | 'scatter' | 'table';
  metrics?: Record<string, any>;
  error?: string;
  sql_executed?: string;       // Telemetry from backend
  execution_time_ms?: number;  // Telemetry from backend
}

export default function DashboardOrchestrator({ token, tenantId }: DashboardOrchestratorProps) {
  // Application State
  const [activeDataset, setActiveDataset] = useState<UploadSuccessData | null>(null);
  
  // Execution State
  const [query, setQuery] = useState<string>("");
  const [resultData, setResultData] = useState<AnalyticalResult | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecuteQuery = async () => {
    if (!activeDataset || !query.trim()) return;
    setIsQuerying(true);
    setError(null);
    setResultData(null);
    
    try {
      // Intelligently route based on the dataset type (Memory vs Persistent R2/Supabase)
      const isEphemeral = !!activeDataset.ephemeralPath;
      const endpoint = isEphemeral ? '/api/query/ephemeral' : '/api/query/persistent';
      
      const payload = isEphemeral 
        ? { ephemeral_path: activeDataset.ephemeralPath, natural_query: query }
        : { dataset_id: activeDataset.datasetId, natural_query: query };

      // Vectorized Execution routing (Next.js API -> FastAPI -> DuckDB)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Enforce strict JWT security
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Execution engine failed to process query.");
      
      // Pass the fully materialized payload to state
      setResultData({
        status: "Success",
        columns: data.columns || [],
        data: data.data || [],
        sql_executed: data.sql_executed,
        execution_time_ms: data.execution_time_ms
      });
      
    } catch (err: any) {
      console.error("Orchestration Error:", err);
      setError(err.message || "An unexpected error occurred during execution.");
    } finally {
      setIsQuerying(false);
    }
  };

  const handleCloseDataset = () => {
    setActiveDataset(null);
    setResultData(null);
    setQuery("");
    setError(null);
  };

  // ============================================================================
  // VIEW 1: INGESTION ZONE (Shown when no dataset is selected)
  // ============================================================================
  if (!activeDataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto h-full w-full">
        <div className="max-w-2xl w-full text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4 tracking-tight">
            Instantiate Workspace.
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            Drop a dataset below. It will be seamlessly converted to compressed Parquet format and mounted securely.
          </p>
        </div>
        
        {/* Set isEphemeral=false if you want them saved to Supabase/R2 by default for logged-in users */}
        <FileUploadZone 
          isEphemeral={false} 
          token={token}
          onUploadSuccess={(data) => setActiveDataset(data)} 
        />
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: ANALYTICAL WORKSPACE (Your original 12-col grid)
  // ============================================================================
  return (
    <div className="flex-1 p-6 overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full font-sans max-w-7xl mx-auto">
        
        {/* Configuration & Contextual RAG Input Column */}
        <div className="xl:col-span-4 space-y-6 flex flex-col h-full">
          <Card className="shadow-sm border-neutral-200 dark:border-neutral-800 flex flex-col min-h-[400px]">
            <CardHeader className="bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-500" />
                NL2SQL Execution Engine
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Contextual RAG dynamically translates natural language into optimized DuckDB queries.
              </CardDescription>
              
              {/* Security Boundary Indicator */}
              <div className="flex flex-col gap-2 mt-3">
                <Badge variant="outline" className="text-[10px] w-fit font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 flex gap-1.5 items-center px-2 py-0.5">
                  <ShieldCheck className="w-3 h-3" />
                  Tenant Boundary: {tenantId.split('-')[0]}***
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="pt-6 space-y-5 flex-1 flex flex-col">
              {/* Active Dataset Display (Replaces manual ID input) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center justify-between">
                  <span>Mounted Dataset</span>
                  <button onClick={handleCloseDataset} className="text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                    <XCircle className="w-3 h-3" /> Unmount
                  </button>
                </label>
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-md">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300 truncate">
                    {activeDataset.datasetName}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2 flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  Analytical Query
                </label>
                <Input 
                  placeholder="e.g., Show total revenue by category..." 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExecuteQuery()}
                  className="text-sm focus-visible:ring-blue-500"
                  disabled={isQuerying}
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  Tip: Ask for "anomalies", "variance", or "trends" to engage the Vectorized Mathematical Engine.
                </p>
              </div>

              <Button 
                className="w-full font-semibold shadow-sm bg-blue-600 hover:bg-blue-700 text-white transition-all h-10 mt-auto" 
                onClick={handleExecuteQuery}
                disabled={isQuerying || !query.trim()}
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
            <CardHeader className="border-b border-neutral-100 dark:border-neutral-800 pb-3 py-4 bg-white dark:bg-black rounded-t-xl flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Dynamic Visualizations
              </CardTitle>
              {resultData?.execution_time_ms && (
                <Badge variant="secondary" className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800">
                  {resultData.execution_time_ms}ms execution
                </Badge>
              )}
            </CardHeader>
            <CardContent className="flex-1 p-1 flex flex-col relative bg-neutral-50/50 dark:bg-neutral-900/30 rounded-b-xl overflow-hidden">
              {/* Array check injection: Only passing down the raw array to strict-typed sub-components */}
              {resultData && resultData.data && resultData.data.length > 0 ? (
                 <div className="absolute inset-0 p-4 overflow-auto">
                   <DynamicChartFactory data={resultData.data} />
                 </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-400 p-6">
                   <div className="h-12 w-12 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center mb-4 transition-transform hover:scale-105">
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
          <Card className="shadow-sm border-neutral-200 dark:border-neutral-800 flex flex-col h-[350px]">
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
            <CardContent className="p-0 overflow-auto flex-1 bg-white dark:bg-black rounded-b-xl flex flex-col relative">
              {/* Optional: Display generated SQL to build user trust */}
              {resultData?.sql_executed && (
                 <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
                   <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider mb-1">Generated SQL</p>
                   <code className="text-xs text-emerald-600 dark:text-emerald-400 break-words whitespace-pre-wrap">
                     {resultData.sql_executed}
                   </code>
                 </div>
              )}

              <div className="flex-1 relative">
                {resultData && resultData.data && resultData.data.length > 0 ? (
                  <div className="absolute inset-0">
                    <DataPreview data={resultData.data} />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[11px] text-neutral-400 font-mono bg-neutral-50/30 dark:bg-neutral-900/20">
                      &lt; No Vectorized Payload Extracted /&gt;
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}