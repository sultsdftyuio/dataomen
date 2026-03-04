"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { DynamicChartFactory } from './DynamicChartFactory';
import { DataPreview } from './DataPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// Type Safety: Strict interfaces for our analytical schema
export interface AnalyticalData {
  id: string;
  metric_name: string;
  metric_value: number;
  recorded_at: string;
}

export function DashboardOrchestrator() {
  const [dataset, setDataset] = useState<AnalyticalData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Security by Design & Modular Strategy
  // Fetch data specifically partitioned by the authenticated tenant ID using RLS.
  useEffect(() => {
    let isMounted = true;

    async function fetchTenantData() {
      try {
        setIsLoading(true);
        
        // Supabase query to fetch analytical data - RLS ensures tenant isolation at the database layer
        const { data, error: queryError } = await supabase
          .from('analytical_metrics')
          .select('id, metric_name, metric_value, recorded_at')
          .order('recorded_at', { ascending: true })
          .limit(100);

        if (queryError) throw queryError;
        
        // Fallback to mock data strictly for visual scaffolding if the table is empty
        const finalData = data && data.length > 0 ? data : generateMockData();
        
        if (isMounted) setDataset(finalData);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to fetch analytical metrics.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchTenantData();
    return () => { isMounted = false; };
  }, []);

  // Computation (Execution) layer
  // Utilizing a functional, stateless approach to calculate baselines (Mean, SD) for anomaly detection.
  const aggregatedStats = useMemo(() => {
    if (!dataset.length) return null;
    
    // Mathematical Precision: Instead of a simple average, we isolate variance.
    const total = dataset.reduce((acc, row) => acc + row.metric_value, 0);
    const mean = total / dataset.length;
    
    // Calculate variance for standard deviation (useful for upper/lower bound anomaly flagging)
    const variance = dataset.reduce((acc, row) => acc + Math.pow(row.metric_value - mean, 2), 0) / dataset.length;
    const stdDev = Math.sqrt(variance);

    return { 
      total, 
      mean, 
      stdDev 
    };
  }, [dataset]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 text-red-900 p-6">
        <CardTitle className="text-red-700">Analytics Load Error</CardTitle>
        <CardContent className="mt-2">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Sidebar: Data Management & Metrics */}
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Calculated Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {aggregatedStats ? (
              <div className="flex flex-col gap-4">
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Volume (Total)</span>
                  <span className="font-bold">{aggregatedStats.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Mean Baseline</span>
                  <span className="font-bold">{aggregatedStats.mean.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Std Deviation</span>
                  <span className="font-bold text-amber-600">± {aggregatedStats.stdDev.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Insufficient data for statistical modelling.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Raw Data Vector</CardTitle>
          </CardHeader>
          <CardContent>
             <DataPreview data={dataset.slice(0, 5)} />
             {dataset.length > 5 && (
               <p className="text-xs text-gray-400 mt-3 italic text-right">
                 Showing 5 of {dataset.length} entries.
               </p>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Main Column: Visualization Factory */}
      <div className="lg:col-span-2">
        <Card className="h-full flex flex-col border border-gray-200 dark:border-gray-800 shadow-sm">
          <CardHeader>
            <CardTitle>Time Series Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px]">
             {/* The Modular Strategy: Delegating rendering to a swappable component */}
             <DynamicChartFactory 
               data={dataset} 
               type="area" 
               xKey="recorded_at" 
               yKeys={['metric_value']} 
             />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Pure function for mock generation ensuring the UI runs locally even if the DB is empty
function generateMockData(): AnalyticalData[] {
  return Array.from({ length: 14 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (14 - i));
    return {
      id: `mock-${i}`,
      metric_name: 'Compute Load',
      metric_value: Math.floor(200 + i * 15 + Math.random() * 50),
      recorded_at: date.toISOString().split('T')[0],
    };
  });
}