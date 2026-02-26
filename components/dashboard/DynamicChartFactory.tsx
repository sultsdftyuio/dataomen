'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

// Strict TypeScript Interfaces representing our Phase 2 Output
export interface ChartConfig {
  type: 'bar_chart' | 'line_chart' | 'pie_chart';
  x_axis: string;
  y_axis: string;
}

interface DynamicChartFactoryProps {
  data: any[]; // The raw executed DuckDB rows
  config: ChartConfig; // The strict JSON configuration from the LLM
}

// A standard, corporate-friendly color palette (CFO-style)
const COLORS = ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1'];

export default function DynamicChartFactory({ data, config }: DynamicChartFactoryProps) {
  // Graceful fallback if no data or config is present
  if (!data || !config || data.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500">
        No data available to visualize.
      </div>
    );
  }

  const { type, x_axis, y_axis } = config;

  switch (type) {
    case 'bar_chart':
      return (
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey={x_axis} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Bar dataKey={y_axis} fill="#0f172a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'line_chart':
      return (
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey={x_axis} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Line type="monotone" dataKey={y_axis} stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pie_chart':
      return (
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={y_axis}
                nameKey={x_axis}
                cx="50%"
                cy="50%"
                outerRadius={130}
                innerRadius={60} // Creates a modern "Donut" look
                paddingAngle={2}
                label
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    default:
      return (
        <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 text-red-500">
          Unsupported chart type requested: {type}
        </div>
      );
  }
}