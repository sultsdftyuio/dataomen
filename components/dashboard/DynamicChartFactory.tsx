"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// 1. The Strict Contract
export interface DynamicChartFactoryProps {
  tenantId: string;
}

// 2. Data Shape Interfaces
type ChartType = 'line' | 'bar' | 'area' | 'scatter';

interface AnalyticalPayload {
  chartType: ChartType;
  title: string;
  xAxisKey: string;
  dataKeys: string[];
  // Array of vectorized records (Pandas `to_dict('records')` output format)
  data: Record<string, any>[]; 
}

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export function DynamicChartFactory({ tenantId }: DynamicChartFactoryProps) {
  const [payload, setPayload] = useState<AnalyticalPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch logic: In a real analytical SaaS, this queries your semantic router / RAG backend
    // which processes DuckDB/Polars logic and returns a JSON payload of the computed metrics.
    const fetchAnalyticalTrajectory = async () => {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 900)); // Simulate compute
        
        // Mocking the result of an anomaly detection or forecasting EMA calculation
        setPayload({
          chartType: 'area',
          title: 'Financial Trajectory (EMA Smoothed)',
          xAxisKey: 'month',
          dataKeys: ['revenue', 'projected'],
          data: [
            { month: 'Jan', revenue: 4000, projected: 4100 },
            { month: 'Feb', revenue: 3000, projected: 3200 },
            { month: 'Mar', revenue: 2000, projected: 2500 },
            { month: 'Apr', revenue: 2780, projected: 2900 },
            { month: 'May', revenue: 1890, projected: 2100 },
            { month: 'Jun', revenue: 2390, projected: 2500 },
            { month: 'Jul', revenue: 3490, projected: 3600 },
          ]
        });
      } catch (err) {
        console.error("[DynamicChartFactory] Failed to process payload:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalyticalTrajectory();
  }, [tenantId]);

  // Vectorized translation layer: Memoize the chart generation so React doesn't needlessly rerender recharts SVGs
  const RenderedChart = useMemo(() => {
    if (!payload || !payload.data) return null;

    const { chartType, data, xAxisKey, dataKeys } = payload;

    switch (chartType) {
      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              {dataKeys.map((key, index) => (
                <linearGradient key={`color${key}`} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[index % COLORS.length]} 
                fillOpacity={1} 
                fill={`url(#color${key})`} 
              />
            ))}
          </AreaChart>
        );
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={2} activeDot={{ r: 8 }} />
            ))}
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, index) => (
              <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      default:
        return (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Unsupported chart configuration derived from data payload.
          </div>
        );
    }
  }, [payload]);

  return (
    <Card className="h-full min-h-[450px] flex flex-col bg-card border-border">
      <CardHeader>
        <CardTitle>{payload?.title || "Analytical Trajectory"}</CardTitle>
        <CardDescription>Metrics scoped strictly to Tenant: <span className="font-mono text-xs">{tenantId}</span></CardDescription>
      </CardHeader>
      <CardContent className="flex-1 w-full min-h-[300px] mt-4">
        {isLoading ? (
          <Skeleton className="w-full h-full min-h-[300px] rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={300}>
            {RenderedChart!}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}