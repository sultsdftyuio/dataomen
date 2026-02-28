"use client";

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// Strict Type Safety Definitions
export interface ChartConfig {
  title?: string;
  type: 'bar' | 'line' | 'pie' | string;
  xAxisKey: string;
  yAxisKey: string;
  color?: string;
  data?: any[]; // Optional fallback if data is embedded in the config
}

export interface DynamicChartFactoryProps {
  config: ChartConfig;
  data: any[]; // Explicit data requirement to satisfy TypeScript
}

// Engineering Excellence: Professional Data Visualization Palettes
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function DynamicChartFactory({ config, data }: DynamicChartFactoryProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 bg-white border rounded-xl shadow-sm h-80">
        <p className="text-gray-500 text-sm">Insufficient data to render {config.title || 'chart'}</p>
      </div>
    );
  }

  const renderChart = () => {
    switch (config.type?.toLowerCase()) {
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey={config.xAxisKey} stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Line type="monotone" dataKey={config.yAxisKey} stroke={config.color || COLORS[0]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
        
      case 'pie':
        return (
          <PieChart>
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
            <Pie
              data={data}
              dataKey={config.yAxisKey}
              nameKey={config.xAxisKey}
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={60} // Donut style for modern analytics
              label={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        );
        
      case 'bar':
      default:
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey={config.xAxisKey} stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey={config.yAxisKey} fill={config.color || COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[400px] w-full transition-all hover:shadow-md">
      {config.title && <h3 className="text-lg font-semibold mb-6 text-gray-800 tracking-tight">{config.title}</h3>}
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}