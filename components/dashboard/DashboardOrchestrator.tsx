"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Search, Database, LayoutTemplate } from "lucide-react";

// Functional UI Components
import { DataPreview } from "./DataPreview";
import { DynamicChartFactory } from "./DynamicChartFactory";

// Shadcn UI (Ensure these match your project structure)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function DashboardOrchestrator() {
  // Authentication State
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Analytical Pipeline State
  const [datasetId, setDatasetId] = useState("");
  const [nlQuery, setNlQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  
  // Data State (Trickled down to stateless child components)
  const [analyticalData, setAnalyticalData] = useState<Record<string, any>[]>([]);
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'area' | 'bar' | 'line'>('area');

  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    const enforceAuth = async () => {
      try {
        // Instant, local-first session check
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          console.warn("[Auth Warning] No active tenant session found. Redirecting...");
          window.location.replace('/login');
          return;
        }

        if (isMounted) {
          // Security by Design: Explicit tenant isolation map
          const activeTenantId = session.user.user_metadata?.tenant_id || session.user.id;
          setTenantId(activeTenantId);
        }
      } catch (err) {
        console.error("[Auth] Session validation failed:", err);
        window.location.replace('/login');
      } finally {
        if (isMounted) setIsAuthLoading(false);
      }
    };

    enforceAuth();

    // Listen for session expiry or logouts triggered in other browser tabs
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Execution Layer: The Contextual RAG Network Call
  const executeQuery = async () => {
    if (!datasetId.trim() || !nlQuery.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a Dataset ID and a natural language query.",
        variant: "destructive"
      });
      return;
    }

    setIsQuerying(true);
    setGeneratedSql(null);

    try {
      // Fetch fresh token to pass to FastAPI for dependency injection (Depends(get_tenant))
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error("Authentication token expired.");

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${backendUrl}/query/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          natural_language_query: nlQuery
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to execute analytical query.");
      }

      const result = await response.json();
      
      // Update state to trigger Recharts and Data Table rendering
      setAnalyticalData(result.data);
      setGeneratedSql(result.generated_sql);
      
      toast({
        title: "Query Successful",
        description: `Processed ${result.data.length} records natively via DuckDB.`,
      });

    } catch (error: any) {
      console.error("[Analytical Execution] Failed:", error);
      toast({
        title: "Query Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsQuerying(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-7xl mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4 border-border">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytical Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tenant Boundary: <span className="font-mono bg-muted px-2 py-0.5 rounded">{tenantId}</span>
          </p>
        </div>
        
        {/* Dynamic Chart Type Toggle */}
        <div className="flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
          <Select value={chartType} onValueChange={(val: any) => setChartType(val)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Chart Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="area">Area Chart</SelectItem>
              <SelectItem value="bar">Bar Chart</SelectItem>
              <SelectItem value="line">Line Chart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Control Panel (Query Input) */}
      <Card className="bg-card border-border shadow-sm">
        <CardContent className="p-4 sm:p-6 flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="w-full md:w-1/4 space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Dataset ID
            </label>
            <Input 
              placeholder="e.g. 123e4567-e89b-12d3..." 
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="w-full md:w-2/4 space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" /> Natural Language Query
            </label>
            <Input 
              placeholder="e.g. Show me total revenue grouped by month..." 
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeQuery()}
            />
          </div>
          <div className="w-full md:w-1/4">
            <Button 
              className="w-full h-10" 
              onClick={executeQuery} 
              disabled={isQuerying}
            >
              {isQuerying ? "Processing Analytics..." : "Execute Query"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Display Generated SQL if available */}
      {generatedSql && (
        <div className="bg-muted/30 border border-border rounded-lg p-4 text-sm font-mono overflow-x-auto text-muted-foreground">
          <span className="text-primary font-semibold mr-2">DuckDB SQL:</span>
          {generatedSql}
        </div>
      )}

      {/* Visualization Grid: Rendering the pure stateless components */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-h-[450px]">
          <DynamicChartFactory 
            data={analyticalData} 
            isLoading={isQuerying}
            tenantId={tenantId}
            preferredType={chartType}
            title={nlQuery ? `Results: ${nlQuery}` : "Analytical Trajectory"}
          />
        </div>
        <div className="min-h-[450px]">
          <DataPreview 
            data={analyticalData} 
            isLoading={isQuerying}
            tenantId={tenantId}
            title="Raw Data Preview"
          />
        </div>
      </main>
    </div>
  );
}