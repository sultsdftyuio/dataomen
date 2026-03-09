// components/dashboard/DynamicChartFactory.tsx

"use client";

import React, { useState, useMemo } from "react";
import { Download, Table2, BarChart3, LineChart as LineChartIcon, Code2, AlertCircle } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
export interface ChartConfig {
  type: "bar" | "line";
  xAxisKey: string;
  yAxisKeys: string[];
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_config?: ChartConfig;
}

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.type === "chart" ? "chart" : "table"
  );

  // 1. Data Export: Optimized Vectorized CSV Generation
  const downloadCSV = () => {
    if (!payload.data || payload.data.length === 0) return;

    const headers = Object.keys(payload.data[0]);
    const csvContent = [
      headers.join(","),
      ...payload.data.map((row) =>
        headers
          .map((fieldName) => {
            const val = row[fieldName] === null ? "" : String(row[fieldName]);
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `dataomen_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Hybrid Axis Detection (Backend explicitly defines it OR we auto-guess)
  const resolvedChartConfig = useMemo((): ChartConfig | null => {
    if (!payload.data || payload.data.length === 0) return null;
    
    // Prioritize explicit configuration from the Semantic Router/LLM
    if (payload.chart_config) {
      return payload.chart_config;
    }
    
    // Fallback: Intelligent Auto-Detection
    const sampleRow = payload.data[0];
    const keys = Object.keys(sampleRow);
    
    const xAxisKey = keys.find(k => typeof sampleRow[k] === 'string') || keys[0];
    const yAxisKeys = keys.filter(k => k !== xAxisKey && typeof sampleRow[k] === 'number');

    return { 
      type: "bar", // Default fallback type
      xAxisKey, 
      yAxisKeys 
    };
  }, [payload.data, payload.chart_config]);

  const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  // Helper function to format large numbers cleanly
  const formatNumber = (val: any) => {
    if (typeof val !== 'number') return val;
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(val);
  };

  // Handle Error States
  if (payload.type === "error") {
    return (
      <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start space-x-3 text-red-400 mt-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{payload.message || "An unknown execution error occurred."}</p>
      </div>
    );
  }

  // Handle Standard Text/Fallback
  if (payload.type === "text" || !payload.data) {
    return (
      <div className="text-sm text-slate-200 bg-slate-800/80 px-4 py-3 rounded-xl border border-slate-700 shadow-sm mt-2">
        {payload.message}
      </div>
    );
  }

  const tableHeaders = Object.keys(payload.data[0] || {});

  return (
    <div className="flex flex-col w-full max-w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mt-2 shadow-lg shadow-black/50">
      
      {/* Top Toolbar: Context & Actions */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-800">
        <div className="flex space-x-1">
          {payload.type === "chart" && resolvedChartConfig && resolvedChartConfig.yAxisKeys.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("chart")}
              className={`h-8 px-2 text-xs ${activeTab === "chart" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            >
              {resolvedChartConfig.type === "line" ? (
                <LineChartIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              ) : (
                <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
              )}
              Chart
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab("table")}
            className={`h-8 px-2 text-xs ${activeTab === "table" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
          >
            <Table2 className="w-3.5 h-3.5 mr-1.5" /> Data ({payload.data.length})
          </Button>
          {payload.sql_used && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("sql")}
              className={`h-8 px-2 text-xs ${activeTab === "sql" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            >
              <Code2 className="w-3.5 h-3.5 mr-1.5" /> SQL
            </Button>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={downloadCSV} className="h-8 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Dynamic Render Zone */}
      <div className="p-4 w-full overflow-hidden">
        
        {/* CHART VIEW */}
        {activeTab === "chart" && resolvedChartConfig && resolvedChartConfig.yAxisKeys.length > 0 && (
          <div className="w-full h-[300px] sm:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              {resolvedChartConfig.type === "bar" ? (
                <BarChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis 
                    dataKey={resolvedChartConfig.xAxisKey} 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatNumber}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value: any) => [formatNumber(value), undefined]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  {resolvedChartConfig.yAxisKeys.map((key, idx) => (
                    <Bar 
                      key={key} 
                      dataKey={key} 
                      fill={CHART_COLORS[idx % CHART_COLORS.length]} 
                      radius={[4, 4, 0, 0]} 
                    />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis 
                    dataKey={resolvedChartConfig.xAxisKey} 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatNumber}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value: any) => [formatNumber(value), undefined]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  {resolvedChartConfig.yAxisKeys.map((key, idx) => (
                    <Line 
                      key={key} 
                      type="monotone"
                      dataKey={key} 
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#0f172a', strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* DATA GRID VIEW */}
        {activeTab === "table" && (
          <ScrollArea className="w-full max-h-[400px] rounded-md border border-slate-800 bg-slate-950">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900 sticky top-0 z-10 shadow-sm shadow-black/20">
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className="px-4 py-3 font-medium whitespace-nowrap">
                      {header.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payload.data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    {tableHeaders.map((header) => (
                      <td key={`${i}-${header}`} className="px-4 py-2.5 text-slate-300 whitespace-nowrap font-mono text-xs">
                        {typeof row[header] === 'number' 
                          ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row[header])
                          : String(row[header])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}

        {/* SQL DEBUG VIEW */}
        {activeTab === "sql" && payload.sql_used && (
          <div className="w-full max-h-[400px] overflow-auto rounded-md bg-[#0d1117] border border-slate-800 p-4">
            <pre className="text-[13px] leading-relaxed text-emerald-400 font-mono whitespace-pre-wrap">
              {payload.sql_used}
            </pre>
          </div>
        )}
      </div>

      {/* Optional Metadata Message */}
      {payload.message && activeTab !== "sql" && (
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-400 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {payload.message}
        </div>
      )}
    </div>
  );
};