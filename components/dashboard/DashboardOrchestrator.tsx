"use client";

import React, { useState, useEffect } from 'react';
import { DataPreview } from './DataPreview';
import { DynamicChartFactory } from './DynamicChartFactory';
import { FileUploadZone } from '../ingestion/FileUploadZone';
import { Bot, Send, Settings, TerminalSquare, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/utils';
import axios from 'axios';
import { toast } from 'sonner';

// Import the Modular Deep Link Hook
import { useAnomalyDeepLink } from '@/hooks/useAnomalyDeepLink';

export const DashboardOrchestrator = () => {
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [insightString, setInsightString] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'scatter' | 'area' | 'pie'>('bar');
  const [columns, setColumns] = useState<{ x: string, y: string | string[] }>({ x: '', y: '' });

  // 1. New State for Analytical Efficiency: DuckDB Global Filters
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  // 2. Interaction Paradigm: Hydrate the Deep Link State
  const { anomalyContext, isHydrating, clearAnomalyContext } = useAnomalyDeepLink();

  // 3. Synchronize AI Context with UI
  useEffect(() => {
    if (anomalyContext) {
      // Auto-mount the dataset if the anomaly specifies it
      if (anomalyContext.agent_id) { // Assuming agent maps to a dataset
        setDatasetId(anomalyContext.agent_id); 
      }

      // Pre-fill the AI's diagnostic summary into the chat UI natively
      setInsightString(anomalyContext.diagnostic_summary);

      // Convert the array of top variance drivers into an active key-value filter dict
      // E.g. { "Region": "EU", "Product": "Enterprise" }
      if (anomalyContext.filters) {
        const newFilters = anomalyContext.filters.reduce((acc: any, driver: any) => {
          acc[driver.dimension] = driver.category_name;
          return acc;
        }, {});
        setActiveFilters(newFilters);
      }
    }
  }, [anomalyContext]);

  const handleClearInvestigation = () => {
    clearAnomalyContext();
    setActiveFilters({});
    setInsightString(null);
    setChartData([]); // Reset to clean exploratory state
  };

  const handleDatasetUploaded = (id: string) => {
    setDatasetId(id);
  };

  const executeAnalysis = async () => {
    if (!datasetId || !prompt) return;

    setIsProcessing(true);
    setInsightString(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Defensive URL formatting
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

      // Step 1: Query Execution
      const queryRes = await axios.post(`${API_URL}/api/query/execute`, {
        dataset_id: datasetId,
        prompt: prompt,
        // Security & Accuracy: Pass active filters to backend so LLM SQL is strictly bound to context
        context_filters: activeFilters 
      }, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const { data, columns: resultColumns, sql_query } = queryRes.data;

      // Smart Chart Type Selection based on data shape (heuristic)
      let selectedChartType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' = 'bar';
      if (data.length > 0) {
         const keys = Object.keys(data[0]);
         const stringCols = keys.filter(k => typeof data[0][k] === 'string');
         const numCols = keys.filter(k => typeof data[0][k] === 'number');
         
         if (stringCols.length > 0 && numCols.length > 0) {
             setColumns({ x: stringCols[0], y: numCols });
         } else if (numCols.length >= 2) {
             selectedChartType = 'scatter';
             setColumns({ x: numCols[0], y: numCols.slice(1) });
         }
      }

      setChartData(data);
      setChartType(selectedChartType);

      // Step 2: Narrative Generation
      const narrativeRes = await axios.post(`${API_URL}/api/narrative/generate`, {
        dataset_id: datasetId,
        query: sql_query,
        results: data.slice(0, 20) // Provide a restricted context to the LLM to save tokens
      }, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      setInsightString(narrativeRes.data.narrative);

    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error(error.response?.data?.detail || 'Failed to execute analysis.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-4rem)] bg-background">
      
      {/* Dynamic Alert Banner: Triggers when navigated via Slack Deep Link */}
      {isHydrating ? (
          <Alert className="mx-4 mt-4 bg-slate-50 border-slate-200 animate-pulse">
              <Bot className="h-4 w-4" />
              <AlertTitle>Hydrating AI Diagnostic Context...</AlertTitle>
          </Alert>
      ) : anomalyContext ? (
          <Alert variant="destructive" className="mx-4 mt-4 bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4" color="#dc2626" />
              <AlertTitle className="text-red-800 font-bold flex justify-between items-center">
                  <span>Investigating Anomaly: {anomalyContext.metric} on {anomalyContext.date}</span>
                  <Button variant="outline" size="sm" onClick={handleClearInvestigation} className="h-8 border-red-300 text-red-700 hover:bg-red-100">
                      <X className="w-3 h-3 mr-1" /> Clear Context
                  </Button>
              </AlertTitle>
              <AlertDescription className="text-red-700 mt-2">
                  Data is currently pre-filtered to the top variance drivers: 
                  <strong> {Object.entries(activeFilters).map(([k,v]) => `${k}=${v}`).join(', ')}</strong>
              </AlertDescription>
          </Alert>
      ) : null}

      <div className="flex flex-1 overflow-hidden px-4 pb-4 gap-4">
        {/* Left Sidebar - Chat/Commands */}
        <Card className="w-1/3 flex flex-col shadow-sm border-muted">
          <div className="p-4 border-b bg-muted/20">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Analysis Assistant
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Upload data and ask questions in natural language.</p>
          </div>

          <ScrollArea className="flex-1 p-4">
            {!datasetId ? (
              <FileUploadZone onUploadSuccess={handleDatasetUploaded} />
            ) : (
              <div className="space-y-4">
                <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm border border-primary/20">
                  Dataset ready! Ask a question to analyze it.
                </div>
                
                {insightString && (
                  <div className={`p-4 rounded-lg text-sm leading-relaxed border ${anomalyContext ? 'bg-red-50 border-red-200 text-red-900' : 'bg-muted border-border'}`}>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> 
                      {anomalyContext ? "Diagnostic Summary" : "AI Insight"}
                    </h3>
                    {insightString}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Input 
                placeholder="e.g. 'Show me monthly revenue trend'" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={!datasetId || isProcessing}
                onKeyDown={(e) => e.key === 'Enter' && executeAnalysis()}
                className="flex-1"
              />
              <Button 
                onClick={executeAnalysis} 
                disabled={!datasetId || isProcessing || !prompt}
              >
                {isProcessing ? <Bot className="w-4 h-4 animate-bounce" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Right Content - Visualizations & Data */}
        <Card className="flex-1 flex flex-col shadow-sm border-muted overflow-hidden">
          <Tabs defaultValue="visual" className="flex-1 flex flex-col h-full">
            <div className="border-b px-4 py-2 bg-muted/20 flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="visual">Visualization</TabsTrigger>
                <TabsTrigger value="data">Raw Data</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="visual" className="flex-1 p-6 m-0 outline-none overflow-y-auto">
                <div className="mb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TerminalSquare className="w-4 h-4 text-primary" />
                    Result Visualization
                  </CardTitle>
                  <CardDescription>Auto-generated from your natural language query</CardDescription>
                </div>
                
                <div className="h-[450px] w-full">
                  {chartData.length > 0 || anomalyContext ? (
                    // We pass globalFilters down so DynamicChartFactory can apply them
                    // natively to DuckDB if it needs to fallback to direct queries
                    <DynamicChartFactory 
                      data={chartData} 
                      type={chartType} 
                      xKey={columns.x} 
                      yKeys={Array.isArray(columns.y) ? columns.y : [columns.y]}
                      globalFilters={activeFilters}
                      fileId={datasetId || ''} 
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center border-2 border-dashed border-muted rounded-lg text-muted-foreground text-sm flex-col gap-2">
                      <Bot className="w-8 h-8 opacity-20" />
                      <p>Run a query to see visualizations</p>
                    </div>
                  )}
                </div>
            </TabsContent>

            <TabsContent value="data" className="flex-1 p-6 m-0 outline-none overflow-y-auto">
                <div className="mb-4">
                  <CardTitle className="text-base">Data Table</CardTitle>
                </div>
                <div className="h-[450px] w-full border rounded-md">
                   {chartData.length > 0 ? (
                      <DataPreview data={chartData} />
                   ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm bg-muted/10">
                        No data available
                      </div>
                   )}
                </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};