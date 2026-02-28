"use client";

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { AlertCircle } from 'lucide-react';

// --- Interfaces ---
interface DashboardWidget {
  type: string;
  data: any[];
  xAxis?: string;
  yAxis?: string[];
}

interface DynamicChartFactoryProps {
  widget: DashboardWidget;
}

// Brand-aware, colorblind-friendly color palette
const COLORS = [
  '#2563eb', // Blue
  '#16a34a', // Green
  '#eab308', // Yellow
  '#ea580c', // Orange
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f43f5e'  // Rose
];

export function DynamicChartFactory({ widget }: DynamicChartFactoryProps) {
  const { type, data, xAxis, yAxis } = widget;

  // --- Utility & Formatting ---
  
  // Memoize the formatter to prevent recreation on every render
  const compactFormatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', { 
      notation: 'compact', 
      maximumFractionDigits: 1 
    });
  }, []);

  const formatTick = (val: any) => {
    if (typeof val === 'number') return compactFormatter.format(val);
    return val;
  };

  // --- Guard Clauses ---

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-sm">
        <span>No data returned for this query.</span>
      </div>
    );
  }

  // Handle errors bubbled up from DuckDB execution
  if (data[0] && 'error' in data[0]) {
    return (
      <div className="flex items-start space-x-2 text-destructive text-sm p-4 border border-destructive/20 rounded bg-destructive/10 h-full overflow-auto">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="font-mono text-xs">{data[0].error}</span>
      </div>
    );
  }

  // --- Routing & Rendering ---

  switch (type) {
    case 'kpi': {
      // Intelligently infer the numerical value to display if yAxis isn't explicitly provided
      const numericalKey = yAxis?.[0] || Object.keys(data[0]).find(k => typeof data[0][k] === 'number') || Object.keys(data[0])[0];
      const val = data[0][numericalKey];
      const displayVal = typeof val === 'number' ? compactFormatter.format(val) : val;
      
      return (
        <div className="flex items-center justify-center h-full w-full pb-4">
          <span className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary drop-shadow-sm">
            {displayVal}
          </span>
        </div>
      );
    }

    case 'bar_chart': {
      // Determine Y-axis keys intelligently if missing
      const keysToPlot = yAxis?.length ? yAxis : Object.keys(data[0]).filter(k => typeof data[0][k] === 'number' && k !== xAxis);
      
      return (
        <ResponsiveContainer width="100%" height="100%" minHeight={250}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            {xAxis && (
              <XAxis 
                dataKey={xAxis} 
                fontSize={12} 
                tickMargin={10} 
                axisLine={false} 
                tickLine={false} 
              />
            )}
            <YAxis 
              fontSize={12} 
              tickFormatter={formatTick} 
              axisLine={false} 
              tickLine={false} 
              width={50}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(0,0,0,0.04)' }} 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            {keysToPlot.map((y, idx) => (
              <Bar 
                key={y} 
                dataKey={y} 
                fill={COLORS[idx % COLORS.length]} 
                radius={[4, 4, 0, 0]} 
                maxBarSize={60} 
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case 'line_chart': {
      const keysToPlot = yAxis?.length ? yAxis : Object.keys(data[0]).filter(k => typeof data[0][k] === 'number' && k !== xAxis);

      return (
        <ResponsiveContainer width="100%" height="100%" minHeight={250}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            {xAxis && (
              <XAxis 
                dataKey={xAxis} 
                fontSize={12} 
                tickMargin={10} 
                axisLine={false} 
                tickLine={false} 
              />
            )}
            <YAxis 
              fontSize={12} 
              tickFormatter={formatTick} 
              axisLine={false} 
              tickLine={false} 
              width={50}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            {keysToPlot.map((y, idx) => (
              <Line 
                key={y} 
                type="monotone" 
                dataKey={y} 
                stroke={COLORS[idx % COLORS.length]} 
                strokeWidth={3} 
                dot={{ r: 3, strokeWidth: 2 }} 
                activeDot={{ r: 6, strokeWidth: 0 }} 
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    case 'pie_chart': {
      const pieKey = yAxis?.[0] || Object.keys(data[0]).find(k => typeof data[0][k] === 'number');
      const nameKey = xAxis || Object.keys(data[0]).find(k => typeof data[0][k] === 'string');
      
      if (!pieKey) return <div className="text-sm text-center p-4">Cannot infer numeric values for Pie Chart.</div>;

      return (
        <ResponsiveContainer width="100%" height="100%" minHeight={250}>
          <PieChart>
            <Tooltip 
              formatter={(value: any) => formatTick(value)}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Pie 
              data={data} 
              dataKey={pieKey} 
              nameKey={nameKey} 
              cx="50%" 
              cy="50%" 
              innerRadius={60} 
              outerRadius={80} 
              paddingAngle={2}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case 'table':
    default: {
      const headers = Object.keys(data[0]);
      
      return (
        <div className="overflow-auto max-h-[300px] w-full rounded-md border border-border/50">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                {headers.map(h => (
                  <TableHead key={h} className="font-semibold text-xs whitespace-nowrap">
                    {h.replace(/_/g, ' ').toUpperCase()}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                  {headers.map(h => (
                    <TableCell key={h} className="text-sm">
                      {typeof row[h] === 'number' 
                        ? row[h].toLocaleString('en-US', { maximumFractionDigits: 2 }) 
                        : String(row[h])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }
  }
}