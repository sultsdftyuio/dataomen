"use client";

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutTemplate } from "lucide-react";

// 1. The Strict Contract (Stateless mapping)
export interface DynamicChartFactoryProps {
  data: Record<string, any>[]; // The vectorized JSON array from FastAPI
  isLoading?: boolean;
  preferredType?: 'bar' | 'line' | 'area';
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const DynamicChartFactory = ({ 
  data, 
  isLoading = false,
  preferredType = 'bar'
}: DynamicChartFactoryProps) => {
  
  // 2. Computation Layer: Memoized dimensional inference to prevent re-renders
  // Mathematically infers the X and Y axes regardless of what the LLM generates
  const { xAxisKey, numericKeys } = useMemo(() => {
    if (!data || data.length === 0) return { xAxisKey: '', numericKeys: [] };
    
    const keys = Object.keys(data[0]);
    
    // Find the first string or date column to use as the X-Axis naturally
    // If none exist, fallback to the first key regardless of type
    const inferredXAxis = keys.find(
      key => typeof data[0][key] === 'string' || isNaN(Number(data[0][key]))
    ) || keys[0];
    
    // Filter out the X-axis and strictly keep properties that represent numeric data
    const inferredNumeric = keys.filter(
      key => key !== inferredXAxis && (typeof data[0][key] === 'number' || !isNaN(Number(data[0][key])))
    );

    return { 
      xAxisKey: inferredXAxis, 
      numericKeys: inferredNumeric.slice(0, 5) // Cap at 5 metrics to prevent UI clutter
    };
  }, [data]);

  // 3. Vectorized translation layer: Renders exact SVG type based on preferred config
  const RenderedChart = useMemo(() => {
    if (numericKeys.length === 0) return null;

    const commonProps = { 
      data, 
      margin: { top: 10, right: 10, left: -20, bottom: 0 } 
    };

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
            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={{ opacity: 0.2 }} />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255,255,255,0.95)', color: '#000' }} 
              itemStyle={{ color: '#000', fontSize: '12px', fontWeight: 600 }}
              labelStyle={{ color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} iconType="circle" />
            {numericKeys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={2}
                fillOpacity={1} 
                fill={`url(#color${key})`} 
              />
            ))}
          </AreaChart>
        );
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={{ opacity: 0.2 }} />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255,255,255,0.95)', color: '#000' }} 
              itemStyle={{ color: '#000', fontSize: '12px', fontWeight: 600 }}
              labelStyle={{ color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} iconType="circle" />
            {numericKeys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={3} 
                activeDot={{ r: 6, strokeWidth: 0 }} 
                dot={false}
              />
            ))}
          </LineChart>
        );
      case 'bar':
      default:
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={{ opacity: 0.2 }} />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
            <Tooltip 
              cursor={{ fill: 'rgba(0,0,0,0.05)' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255,255,255,0.95)', color: '#000' }} 
              itemStyle={{ color: '#000', fontSize: '12px', fontWeight: 600 }}
              labelStyle={{ color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} iconType="circle" />
            {numericKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={COLORS[index % COLORS.length]} 
                radius={[4, 4, 0, 0]} 
                maxBarSize={50}
              />
            ))}
          </BarChart>
        );
    }
  }, [data, xAxisKey, numericKeys, preferredType]);

  // 4. State Rendering Fallbacks
  if (isLoading) {
    return (
       <div className="w-full h-full min-h-[300px] flex items-end justify-between p-6 gap-2">
         {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-t-md" style={{ height: `${Math.max(20, Math.random() * 100)}%` }} />
         ))}
       </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-[300px] items-center justify-center text-center text-neutral-400 p-6">
        <LayoutTemplate className="w-8 h-8 opacity-20 mb-3" />
        <p className="text-[11px] font-mono uppercase tracking-wider">&lt; No Plot Data /&gt;</p>
      </div>
    );
  }

  if (numericKeys.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-[300px] items-center justify-center text-center text-neutral-500 p-6">
         <p className="text-sm font-medium">Insufficient numeric variance</p>
         <p className="text-xs opacity-75 mt-1 max-w-[250px]">The extracted dataset contains strings or discrete categories without measurable quantities to plot.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[350px] min-h-[300px] pb-4">
      <ResponsiveContainer width="100%" height="100%">
        {RenderedChart!}
      </ResponsiveContainer>
    </div>
  );
};