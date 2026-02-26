'use client';

import React, { useState } from 'react';
import DynamicChartFactory, { ChartConfig } from './DynamicChartFactory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Sparkles } from 'lucide-react';

export default function DashboardOrchestrator() {
  const [question, setQuestion] = useState('');
  
  // Execution Phase 2 States (Fast)
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  // Execution Phase 3 States (Slow/Async)
  const [narrative, setNarrative] = useState<string | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    // Reset states for a new run
    setIsQuerying(true);
    setChartData(null);
    setChartConfig(null);
    setNarrative(null);
    setIsNarrating(false);

    try {
      // ---------------------------------------------------------
      // 1. FAST PATH: Execute DuckDB Query
      // ---------------------------------------------------------
      // Note: Replace with your actual backend URL in production
      const queryRes = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // dataset_id would eventually come from your app state
        body: JSON.stringify({ question, dataset_id: "default_dataset" }) 
      });

      if (!queryRes.ok) throw new Error('Failed to execute query');
      
      const queryData = await queryRes.json();
      
      // Instantly render the chart
      setChartData(queryData.data);
      setChartConfig(queryData.chart_config);
      setIsQuerying(false);

      // ---------------------------------------------------------
      // 2. SLOW PATH: Trigger CFO Narrative Asynchronously
      // ---------------------------------------------------------
      setIsNarrating(true);
      fetch('http://localhost:8000/narrative/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            user_question: question, 
            data_rows: queryData.data 
        })
      })
      .then((res) => res.json())
      .then((narrativeData) => {
          setNarrative(narrativeData.summary);
      })
      .catch((err) => {
          console.error("Narrative failed:", err);
          setNarrative("Narrative engine offline. Please review the chart for insights.");
      })
      .finally(() => {
          setIsNarrating(false);
      });

    } catch (error) {
      console.error(error);
      setIsQuerying(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      
      {/* 1. The Input Zone */}
      <form onSubmit={handleAskQuestion} className="flex w-full items-center gap-3">
        <Input 
          type="text" 
          placeholder="Ask a question about your data (e.g., 'What is the trend of sales by category?')" 
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={isQuerying}
          className="flex-1"
        />
        <Button type="submit" disabled={isQuerying || !question.trim()}>
          {isQuerying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Ask Data
        </Button>
      </form>

      {/* 2. The Visualization Zone (Instant) */}
      <div className="w-full">
        {isQuerying ? (
          <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 gap-4 text-slate-400">
             <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
             <p className="text-sm font-medium">Analyzing database schema...</p>
          </div>
        ) : (
          chartData && chartConfig && (
            <div className="w-full animate-in fade-in zoom-in-95 duration-300">
                <DynamicChartFactory data={chartData} config={chartConfig} />
            </div>
          )
        )}
      </div>

      {/* 3. The CFO Narrative Zone (Delayed) */}
      {(isNarrating || narrative) && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  CFO Executive Summary
              </div>
              
              {isNarrating ? (
                  <div className="space-y-2 py-2">
                      <Skeleton className="h-4 w-full bg-slate-200" />
                      <Skeleton className="h-4 w-[90%] bg-slate-200" />
                      <Skeleton className="h-4 w-[60%] bg-slate-200" />
                  </div>
              ) : (
                  <p className="text-sm leading-relaxed text-slate-600 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      {narrative}
                  </p>
              )}
          </div>
      )}
    </div>
  );
}