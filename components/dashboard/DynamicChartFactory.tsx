"use client";

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// 1. Strict Type Safety: Define the exact shape of props expected by the factory
export interface DynamicChartFactoryProps {
  data: any[]; // Data payload from the backend (array of row objects)
  type: 'bar' | 'line' | 'scatter' | 'area' | 'pie'; // Chart classification
  xKey: string; // Key for the X-Axis (categorical, time-series, or independent variable)
  yKeys: string[]; // Keys for the Y-Axis (numerical measures/dependent variables)
}

// 2. Theming: A sophisticated color palette for analytical dashboards. 
// It attempts to use CSS variables for light/dark mode support, falling back to hex.
const CHART_COLORS = [
  'hsl(var(--chart-1, 220, 70%, 50%))',
  'hsl(var(--chart-2, 160, 60%, 45%))',
  'hsl(var(--chart-3, 30, 80%, 55%))',
  'hsl(var(--chart-4, 280, 65%, 60%))',
  'hsl(var(--chart-5, 340, 75%, 55%))',
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F'
];

export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ 
  data, 
  type = 'bar', 
  xKey, 
  yKeys = [] 
}) => {
  // Memoize the color assignment so it isn't recalculated on every React render tick
  const colors = useMemo(() => CHART_COLORS, []);

  // Guard clause: Return an empty state if no data or axes are defined to prevent rendering crashes
  if (!data || data.length === 0 || !xKey || yKeys.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground bg-muted/5 rounded-xl border border-dashed border-muted">
        Insufficient data or mapping to render visualization.
      </div>
    );
  }

  // Functional rendering strategy: Isolate chart construction based on the injected `type`
  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickMargin={10} />
            <YAxis tick={{ fontSize: 12 }} tickMargin={10} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {yKeys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[index % colors.length]} 
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} name={xKey} tick={{ fontSize: 12 }} tickMargin={10} />
            <YAxis dataKey={yKeys[0]} name={yKeys[0]} tick={{ fontSize: 12 }} tickMargin={10} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {yKeys.map((key, index) => (
              <Scatter 
                key={key} 
                name={key} 
                data={data} 
                fill={colors[index % colors.length]} 
              />
            ))}
          </ScatterChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickMargin={10} />
            <YAxis tick={{ fontSize: 12 }} tickMargin={10} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {yKeys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                fill={colors[index % colors.length]} 
                stroke={colors[index % colors.length]} 
                fillOpacity={0.2}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
        return (
          <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Pie 
              data={data} 
              dataKey={yKeys[0]} 
              nameKey={xKey} 
              cx="50%" 
              cy="50%" 
              innerRadius={60}
              outerRadius={120} 
              paddingAngle={2}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        );

      case 'bar':
      default:
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickMargin={10} />
            <YAxis tick={{ fontSize: 12 }} tickMargin={10} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {yKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={colors[index % colors.length]} 
                radius={[4, 4, 0, 0]} 
                maxBarSize={60}
              />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
};