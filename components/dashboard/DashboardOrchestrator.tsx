import React, { useState } from 'react';
import { DataPreview } from './DataPreview';
import { DynamicChartFactory } from './DynamicChartFactory';
import { FileUploadZone } from '../ingestion/FileUploadZone';
import { Bot, Send, Settings, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/utils';
import axios from 'axios';
import { toast } from 'sonner';

export const DashboardOrchestrator = () => {
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [insightString, setInsightString] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'scatter' | 'area' | 'pie'>('bar');
  const [columns, setColumns] = useState<{ x: string, y: string | string[] }>({ x: '', y: '' });

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
        prompt: prompt
      }, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const { data, columns: resultColumns, sql_query } = queryRes.data;

      // Smart Chart Type Selection based on data shape (heuristic)
      let selectedChartType: 'bar' | 'line' | 'scatter' | 'pie' = 'bar';
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
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Left Sidebar - Chat/Commands */}
      <div className="w-1/3 border-r flex flex-col">
        <div className="p-4 border-b bg-muted/20">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5" />
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
                <div className="bg-muted p-4 rounded-lg text-sm leading-relaxed border border-border">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> 
                    AI Insight
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
      </div>

      {/* Right Content - Visualizations & Data */}
      <div className="flex-1 flex flex-col bg-muted/10">
        <Tabs defaultValue="visual" className="flex-1 flex flex-col">
          <div className="border-b px-4 py-2 bg-background flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="visual">Visualization</TabsTrigger>
              <TabsTrigger value="data">Raw Data</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="visual" className="flex-1 p-6 m-0 outline-none">
            <Card className="h-full flex flex-col shadow-sm border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4 text-primary" />
                  Result Visualization
                </CardTitle>
                <CardDescription>Auto-generated from your natural language query</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[400px]">
                {chartData.length > 0 ? (
                  <DynamicChartFactory 
                    data={chartData} 
                    type={chartType} 
                    xKey={columns.x} 
                    yKeys={Array.isArray(columns.y) ? columns.y : [columns.y]} 
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
                    <Bot className="w-8 h-8 opacity-20" />
                    <p>Run a query to see visualizations</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="flex-1 p-6 m-0 outline-none">
            <Card className="h-full flex flex-col shadow-sm border-muted">
               <CardHeader className="pb-2">
                <CardTitle className="text-base">Data Table</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                 {chartData.length > 0 ? (
                    <DataPreview data={chartData} />
                 ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      No data available
                    </div>
                 )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};