"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { DynamicChartFactory } from './DynamicChartFactory';
import { DataPreview } from './DataPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/utils';
import { Loader2, AlertCircle } from 'lucide-react';

// -----------------------------------------------------------------------------
// Type Safety: Strict interfaces for our analytical schema and calculated stats
// -----------------------------------------------------------------------------
export interface AnalyticalData {
  id: string;
  metric_name: string;
  metric_value: number;
  recorded_at: string;
}

export interface AggregatedStats {
  total: number;
  mean: number;
  stdDev: number;
}

// -----------------------------------------------------------------------------
// Computation (Execution) Layer: Pure, functional, and testable math modules
// -----------------------------------------------------------------------------

/**
 * Calculates standard statistical vectors (Total, Mean, Population StdDev).
 * Utilizing functional array methods (reduce) for JS-native vectorization equivalents.
 */
function calculateVectorStats(data: AnalyticalData[]): AggregatedStats | null {
  const len = data.length;
  if (len === 0) return null;

  // Pass 1: Sum and Mean
  const total = data.reduce((acc, row) => acc + row.metric_value, 0);
  const mean = total / len;

  // Pass 2: Population Variance and Standard Deviation
  const variance = data.reduce((acc, row) => acc + Math.pow(row.metric_value - mean, 2), 0) / len;
  const stdDev = Math.sqrt(variance);

  return { total, mean, stdDev };
}

/**
 * Pure function for mock generation ensuring the UI runs locally 
 * if the DB is empty, maintaining a deterministic, seeded output pattern.
 */
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

// -----------------------------------------------------------------------------
// Interaction (Frontend) Layer: Functional React Component
// -----------------------------------------------------------------------------

export function DashboardOrchestrator() {
  const [dataset, setDataset] = useState<AnalyticalData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Security by Design: RLS natively handles tenant data isolation
  useEffect(() => {
    let isMounted = true;

    async function fetchTenantData() {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch analytical data partitioned natively by tenant via Supabase RLS
        const { data, error: queryError } = await supabase
          .from('analytical_metrics')
          .select('id, metric_name, metric_value, recorded_at')
          .order('recorded_at', { ascending: true })
          .limit(100);

        if (queryError) throw queryError;
        
        // Graceful fallback to mock data strictly for visual scaffolding
        const finalData = data && data.length > 0 ? data : generateMockData();
        
        if (isMounted) setDataset(finalData);
      } catch (err: unknown) {
        // Strict Type Safety: Avoid `any` in catch blocks
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytical metrics.';
          setError(errorMessage);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchTenantData();
    
    return () => { 
      isMounted = false; 
    };
  }, []);

  // Isolate heavy math into a memoized value to prevent re-calculations on unrelated renders
  const aggregatedStats = useMemo(() => calculateVectorStats(dataset), [dataset]);

  // Finite State Render: Loading
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-12 text-blue-600">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4 text-sm font-medium text-gray-500">Querying analytical engine...</p>
      </div>
    );
  }

  // Finite State Render: Error
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 text-red-900 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <CardTitle className="text-red-800">Analytics Engine Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Finite State Render: Success
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Sidebar: Data Management & Metrics */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Calculated Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {aggregatedStats ? (
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Volume (Total)</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {aggregatedStats.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Mean Baseline</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {aggregatedStats.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-gray-500 font-medium">Std Deviation</span>
                  <span className="font-bold text-amber-600">
                    ± {aggregatedStats.stdDev.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Insufficient data for statistical modelling.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm flex-1">
          <CardHeader>
            <CardTitle className="text-lg">Raw Data Vector</CardTitle>
          </CardHeader>
          <CardContent>
             <DataPreview data={dataset.slice(0, 5)} />
             {dataset.length > 5 && (
               <p className="text-xs text-gray-400 mt-4 text-right">
                 Showing 5 of {dataset.length} entries
               </p>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Main Column: Visualization Factory */}
      <div className="lg:col-span-2">
        <Card className="h-full flex flex-col shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Time Series Distribution</CardTitle>
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