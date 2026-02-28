'use client';

import React, { useState, useEffect } from 'react';
import DynamicChartFactory, { ChartConfig } from './DynamicChartFactory';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

interface DashboardOrchestratorProps {
  datasetId: string;
}

// Engineering Excellence: Flexible Type Safety to handle varying backend schema fragments
interface ChartPayload {
  config?: ChartConfig;
  data?: any[];
  [key: string]: any; 
}

export default function DashboardOrchestrator({ datasetId }: DashboardOrchestratorProps) {
  const [charts, setCharts] = useState<ChartPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInitialAnalytics() {
      if (!datasetId) return;
      
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/query/auto-analyze/${datasetId}`);
        if (!response.ok) throw new Error('Analytical engine failed to provide insights.');
        
        const responseData = await response.json();
        setCharts(responseData.charts || []);
      } catch (err) {
        console.error('Dashboard Orchestration Error:', err);
        setError(err instanceof Error ? err.message : 'Could not connect to analytical service.');
      } finally {
        setLoading(false);
      }
    }

    fetchInitialAnalytics();
  }, [datasetId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-muted-foreground animate-pulse text-sm">Orchestrating Analytical View...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Engine Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {charts.length > 0 ? (
          charts.map((chartItem, index) => {
            // Modular Strategy: Safely extract config and data regardless of nesting
            const chartConfig = chartItem.config || (chartItem as unknown as ChartConfig);
            const chartData = chartItem.data || chartConfig.data || [];

            return (
              <DynamicChartFactory 
                key={`${datasetId}-${index}`} 
                config={chartConfig} 
                data={chartData} 
              />
            );
          })
        ) : (
          <div className="col-span-full text-center p-20 border-2 border-dashed rounded-xl bg-gray-50">
            <p className="text-gray-500">No automated insights found for this dataset.</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Retry Analysis
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}