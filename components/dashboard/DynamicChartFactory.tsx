"use client";

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// 1. The Strict Contract (Stateless mapping)
export interface DynamicChartFactoryProps {
  data: Record<string, any>[]; // The vectorized JSON array from FastAPI
  isLoading?: boolean;
  title?: string;
  tenantId?: string; // Maintained for security visualization
  preferredType?: 'bar' | 'line' | 'area';
}

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export function DynamicChartFactory({ 
  data, 
  isLoading = false,
  title = "Analytical Trajectory",
  tenantId,
  preferredType = 'area'
}: DynamicChartFactoryProps) {
  
  // 2. Computation Layer: Memoized dimensional inference to prevent re-renders
  // Mathematically infers the X and Y axes regardless of what the LLM generates
  const { xAxisKey, numericKeys } = useMemo(() => {
    if (!data || data.length === 0) return { xAxisKey: '', numericKeys: [] };
    
    const keys = Object.keys(data[0]);
    
    // Find the first string or date column to use as the X-Axis naturally
    const inferredXAxis = keys.find(key => typeof data[0][key] === 'string') || keys[0];
    
    // Filter out the X-axis and strictly keep properties that represent numeric data for Y-axis plotting
    const inferredNumeric = keys.filter(
      key => key !== inferredXAxis && typeof data[0][key] === 'number'
    );

    return { xAxisKey: inferredXAxis, numericKeys: inferredNumeric };
  }, [data]);

  // 3. Vectorized translation layer: Renders exact SVG type based on preferred config
  const RenderedChart = useMemo(() => {
    if (numericKeys.length === 0) return null;

    const commonProps = { data, margin: { top: 10, right: 30, left: 0, bottom: 0 } };

    switch (preferredType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              {numericKeys.map((key, index) => (
                <linearGradient key={`color${key}`} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            {numericKeys.map((key, index) => (
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
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            {numericKeys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={3} 
                activeDot={{ r: 8 }} 
              />
            ))}
          </LineChart>
        );
      case 'bar':
      default:
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            {numericKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={COLORS[index % COLORS.length]} 
                radius={[4, 4, 0, 0]} 
              />
            ))}
          </BarChart>
        );
    }
  }, [data, xAxisKey, numericKeys, preferredType]);

  // 4. State Rendering Fallbacks
  const renderContent = () => {
    if (isLoading) {
      return <Skeleton className="w-full h-full min-h-[300px] rounded-lg" />;
    }
    if (!data || data.length === 0) {
      return (
        <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
          No analytical data available to visualize.
        </div>
      );
    }
    if (numericKeys.length === 0) {
      return (
        <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
          The generated dataset does not contain numeric fields for charting.
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%" minHeight={300}>
        {RenderedChart!}
      </ResponsiveContainer>
    );
  };

  return (
    <Card className="h-full min-h-[450px] flex flex-col bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {tenantId && (
          <CardDescription>
            Metrics scoped strictly to Tenant: <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{tenantId}</span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 w-full min-h-[300px] mt-2">
        {renderContent()}
      </CardContent>
    </Card>
  );
}