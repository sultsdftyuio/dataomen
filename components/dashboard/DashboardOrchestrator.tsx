"use client";

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// 1. Strict Type Safety: Explicitly define all props injected by the Orchestrator
export interface DynamicChartFactoryProps {
  data: any[];
  type: "bar" | "line" | "scatter" | "area" | "pie";
  xKey: string;
  yKeys: string[];
  // FIX: Expose globalFilters and fileId to resolve IntrinsicAttributes mapping error
  globalFilters?: Record<string, string>; 
  fileId?: string; 
  colors?: string[];
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

export function DynamicChartFactory({
  data = [],
  type,
  xKey,
  yKeys,
  globalFilters = {},
  fileId, // Maintained for RAG context bridging if needed
  colors = DEFAULT_COLORS
}: DynamicChartFactoryProps) {

  // 2. Functional Operations: Isolate computation (filtering) off the render cycle 
  const filteredData = useMemo(() => {
    if (!globalFilters || Object.keys(globalFilters).length === 0) {
      return data;
    }
    
    return data.filter(item => {
      for (const [key, value] of Object.entries(globalFilters)) {
        if (item[key] !== undefined && String(item[key]).toLowerCase() !== String(value).toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [data, globalFilters]);

  // Unified Tooltip Configuration
  const renderTooltip = () => (
    <Tooltip 
      contentStyle={{ 
        backgroundColor: 'rgba(17, 24, 39, 0.9)', 
        borderColor: 'rgba(55, 65, 81, 1)', 
        color: '#fff', 
        borderRadius: '8px' 
      }}
      itemStyle={{ color: '#fff' }}
    />
  );

  // Structural Fallback
  if (!filteredData || filteredData.length === 0) {
    return (
      <div className="flex h-full w-full min-h-[350px] items-center justify-center bg-muted/20 rounded-lg border border-dashed p-4">
        <p className="text-muted-foreground text-sm">No analytical data available for these parameters.</p>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={filteredData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
            <XAxis 
              dataKey={xKey} 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            {renderTooltip()}
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            {yKeys.map((key, idx) => (
              <Bar key={key} dataKey={key} fill={colors[idx % colors.length]} radius={[4, 4, 0, 0]} maxBarSize={50} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={filteredData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
            <XAxis 
              dataKey={xKey} 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            {renderTooltip()}
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            {yKeys.map((key, idx) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[idx % colors.length]} 
                strokeWidth={2} 
                activeDot={{ r: 6 }} 
                dot={{ r: 3, strokeWidth: 0 }} 
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={filteredData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              {yKeys.map((key, idx) => (
                <linearGradient key={`color-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[idx % colors.length]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={colors[idx % colors.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
            <XAxis 
              dataKey={xKey} 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            {renderTooltip()}
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            {yKeys.map((key, idx) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[idx % colors.length]} 
                fillOpacity={1} 
                fill={`url(#color-${key})`} 
                strokeWidth={2} 
              />
            ))}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground)/0.2)" />
            <XAxis 
              dataKey={xKey} 
              type="number" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            <YAxis 
              dataKey={yKeys[0]} 
              type="number" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              tickLine={false} 
              axisLine={{ stroke: 'hsl(var(--muted-foreground)/0.2)' }} 
            />
            {renderTooltip()}
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            <Scatter name={yKeys[0]} data={filteredData} fill={colors[0]} line shape="circle" />
          </ScatterChart>
        );

      case 'pie':
        return (
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            {renderTooltip()}
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Pie
              data={filteredData}
              dataKey={yKeys[0]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={50}
              paddingAngle={5}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = 25 + innerRadius + (outerRadius - innerRadius);
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text 
                    x={x} 
                    y={y} 
                    fill={colors[index % colors.length]} 
                    textAnchor={x > cx ? 'start' : 'end'} 
                    dominantBaseline="central" 
                    fontSize={12}
                  >
                    {`${filteredData[index]?.[xKey] || 'Unknown'} (${value})`}
                  </text>
                );
              }}
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        );

      default:
        return (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Unsupported analytical chart type: {type}
          </div>
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      {renderChart()}
    </ResponsiveContainer>
  );
}