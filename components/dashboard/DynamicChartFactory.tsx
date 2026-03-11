"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Download, Table2, BarChart3, LineChart as LineChartIcon, Code2, AlertCircle, AreaChart as AreaChartIcon, Activity } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceDot
} from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// -----------------------------------------------------------------------------
// Type Definitions (Aligned with Backend ChatResponse & Vega-Lite Concepts)
// -----------------------------------------------------------------------------
export interface ChartConfig {
  type?: "bar" | "line" | "area" | "scatter";
  xAxisKey?: string;
  yAxisKeys?: string[];
  mark?: string | { type: string }; // Vega-Lite compatibility
  encoding?: Record<string, any>;   // Vega-Lite compatibility
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_spec?: ChartConfig; // Declarative output from NL2SQL Generator
}

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
}

// -----------------------------------------------------------------------------
// Premium SaaS Color Palette & Gradients
// -----------------------------------------------------------------------------
const CHART_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4"];
const ANOMALY_COLOR = "#ef4444"; // Red for statistical anomalies
const EMA_COLOR = "#f59e0b";     // Amber for Moving Averages

const renderCustomGradients = () => (
  <defs>
    {CHART_COLORS.map((color, index) => (
      <linearGradient key={`colorUv-${index}`} id={`colorUv-${index}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.4} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    ))}
  </defs>
);

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.type === "chart" || payload.chart_spec || payload.type === "ml_result" ? "chart" : "table"
  );

  // 1. Data Export: Optimized Vectorized CSV Generation
  const downloadCSV = useCallback(() => {
    if (!payload.data || payload.data.length === 0) return;

    const headers = Object.keys(payload.data[0]);
    const csvContent = [
      headers.join(","),
      ...payload.data.map((row) =>
        headers
          .map((fieldName) => {
            const val = row[fieldName] === null || row[fieldName] === undefined ? "" : String(row[fieldName]);
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
  }, [payload.data]);

  // 2. Hybrid Axis Detection & Intelligent Routing (Supports Vega-Lite Specs)
  const resolvedChartConfig = useMemo((): { type: string; xAxisKey: string; yAxisKeys: string[]; hasAnomalies: boolean } | null => {
    if (!payload.data || payload.data.length === 0) return null;
    
    const sampleRow = payload.data[0];
    const keys = Object.keys(sampleRow);
    
    // Check if the backend executed an ML pipeline with Z-Scores
    const hasAnomalies = keys.some(k => k.includes('_zscore'));

    // If the LLM passed a Vega-Lite spec, map it to Recharts intelligently
    if (payload.chart_spec && payload.chart_spec.encoding) {
      const spec = payload.chart_spec;
      const encoding = spec.encoding; // Safely extracted
      const markType = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type || 'bar';
      
      return {
        type: markType === 'line' ? 'line' : markType === 'area' ? 'area' : 'bar',
        xAxisKey: encoding?.x?.field || keys[0],
        yAxisKeys: encoding?.y?.field ? [encoding?.y?.field] : keys.filter(k => typeof sampleRow[k] === 'number'),
        hasAnomalies
      };
    }
    
    // Fallback: Intelligent Auto-Detection Engine
    const xAxisKey = keys.find(k => 
      k.toLowerCase().includes('date') || k.toLowerCase().includes('time') || k.toLowerCase().includes('month')
    ) || keys.find(k => typeof sampleRow[k] === 'string') || keys[0];
    
    // Filter out metadata columns like Z-Scores from the main Y-Axis rendering
    const yAxisKeys = keys.filter(k => 
      k !== xAxisKey && 
      typeof sampleRow[k] === 'number' && 
      !k.includes('_zscore') && 
      !k.includes('_variance')
    );

    if (yAxisKeys.length === 0) return null;

    // Auto-select chart type based on data shape and semantic meaning
    let detectedType = "bar";
    if (xAxisKey.toLowerCase().includes('date') || xAxisKey.toLowerCase().includes('time')) {
      detectedType = "area"; // Time series look best as Area charts
    } else if (payload.data.length > 20) {
      detectedType = "line"; 
    }

    return { type: detectedType, xAxisKey, yAxisKeys, hasAnomalies };
  }, [payload.data, payload.chart_spec]);

  // Helper function to format large numbers cleanly
  const formatNumber = (val: any) => {
    if (typeof val !== 'number') return val;
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(val);
  };

  // 3. Mathematical Rendering: Custom Dot for Anomaly Detection (3-Sigma Rule)
  const renderCustomDot = (props: any) => {
    const { cx, cy, payload: rowData, dataKey } = props;
    const zScoreKey = `${dataKey}_zscore`;
    
    // If backend flagged this specific point as an anomaly (Z-Score > 3 or < -3)
    if (rowData[zScoreKey] && Math.abs(rowData[zScoreKey]) > 3) {
      return (
        <circle cx={cx} cy={cy} r={6} fill={ANOMALY_COLOR} stroke="#0f172a" strokeWidth={2} className="animate-pulse" />
      );
    }
    return <circle cx={cx} cy={cy} r={0} />; // Hide normal dots for clean UI
  };

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  if (payload.type === "error") {
    return (
      <div className="p-4 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start space-x-3 text-red-400 mt-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{payload.message || "Execution error occurred."}</p>
      </div>
    );
  }

  if (payload.type === "text" || !payload.data || payload.data.length === 0) {
    return (
      <div className="text-sm text-slate-200 bg-slate-800/80 px-4 py-3 rounded-xl border border-slate-700 shadow-sm mt-2">
        {payload.message || "No visual data to display."}
      </div>
    );
  }

  const tableHeaders = Object.keys(payload.data[0] || {});

  return (
    <div className="flex flex-col w-full max-w-full bg-[#0B1120] border border-slate-800 rounded-xl overflow-hidden mt-2 shadow-lg shadow-black/50">
      
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
        <div className="flex space-x-1">
          {resolvedChartConfig && resolvedChartConfig.yAxisKeys.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("chart")}
              className={`h-8 px-2 text-xs ${activeTab === "chart" ? "bg-slate-800 text-emerald-400 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            >
              {resolvedChartConfig.type === "area" ? <AreaChartIcon className="w-3.5 h-3.5 mr-1.5" /> : 
               resolvedChartConfig.type === "line" ? <LineChartIcon className="w-3.5 h-3.5 mr-1.5" /> : 
               <BarChart3 className="w-3.5 h-3.5 mr-1.5" />}
              Visualization
              {resolvedChartConfig.hasAnomalies && <div className="w-2 h-2 rounded-full bg-red-500 ml-2 animate-pulse" title="Anomalies Detected" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setActiveTab("table")}
            className={`h-8 px-2 text-xs ${activeTab === "table" ? "bg-slate-800 text-blue-400 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
          >
            <Table2 className="w-3.5 h-3.5 mr-1.5" /> Data ({payload.data.length})
          </Button>
          {payload.sql_used && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("sql")}
              className={`h-8 px-2 text-xs ${activeTab === "sql" ? "bg-slate-800 text-amber-400 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            >
              <Code2 className="w-3.5 h-3.5 mr-1.5" /> SQL Plan
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={downloadCSV} className="h-8 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export Parquet/CSV
        </Button>
      </div>

      {/* Dynamic Render Zone */}
      <div className="p-4 w-full overflow-hidden">
        
        {/* CHART VIEW */}
        {activeTab === "chart" && resolvedChartConfig && resolvedChartConfig.yAxisKeys.length > 0 && (
          <div className="w-full h-[300px] sm:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              {resolvedChartConfig.type === "area" ? (
                <AreaChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  {renderCustomGradients()}
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolvedChartConfig.xAxisKey} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }} formatter={(value: any) => [formatNumber(value), undefined]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  {resolvedChartConfig.yAxisKeys.map((key, idx) => {
                    const isEMA = key.includes('_ema_');
                    return (
                      <Area 
                        key={key} 
                        type="monotone" 
                        dataKey={key} 
                        stroke={isEMA ? EMA_COLOR : CHART_COLORS[idx % CHART_COLORS.length]} 
                        fillOpacity={isEMA ? 0 : 1} // Don't fill EMA lines
                        strokeDasharray={isEMA ? "5 5" : ""} // Dashed lines for math predictions
                        fill={isEMA ? "none" : `url(#colorUv-${idx % CHART_COLORS.length})`} 
                        strokeWidth={2} 
                        dot={resolvedChartConfig.hasAnomalies ? renderCustomDot : false}
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                      />
                    );
                  })}
                </AreaChart>
              ) : resolvedChartConfig.type === "bar" ? (
                <BarChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolvedChartConfig.xAxisKey} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }} formatter={(value: any) => [formatNumber(value), undefined]} cursor={{ fill: '#1e293b' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  {resolvedChartConfig.yAxisKeys.map((key, idx) => (
                    <Bar key={key} dataKey={key} fill={key.includes('_ema_') ? EMA_COLOR : CHART_COLORS[idx % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolvedChartConfig.xAxisKey} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }} formatter={(value: any) => [formatNumber(value), undefined]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  {resolvedChartConfig.yAxisKeys.map((key, idx) => {
                    const isEMA = key.includes('_ema_');
                    return (
                      <Line 
                        key={key} 
                        type="monotone" 
                        dataKey={key} 
                        stroke={isEMA ? EMA_COLOR : CHART_COLORS[idx % CHART_COLORS.length]} 
                        strokeWidth={isEMA ? 2 : 3} 
                        strokeDasharray={isEMA ? "5 5" : ""}
                        dot={resolvedChartConfig.hasAnomalies ? renderCustomDot : false} 
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                      />
                    );
                  })}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* DATA GRID VIEW */}
        {activeTab === "table" && (
          <ScrollArea className="w-full max-h-[400px] rounded-md border border-slate-800 bg-slate-950/50">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] text-slate-400 uppercase bg-slate-900 sticky top-0 z-10 shadow-sm shadow-black/20">
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap border-b border-slate-800">
                      {header.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payload.data.map((row, i) => {
                  // Determine if this entire row represents an anomaly across any metric
                  const isAnomalyRow = tableHeaders.some(h => h.includes('_zscore') && Math.abs(row[h]) > 3);
                  
                  return (
                    <tr key={i} className={`transition-colors ${isAnomalyRow ? 'bg-red-950/20 hover:bg-red-950/40' : 'hover:bg-slate-800/40'}`}>
                      {tableHeaders.map((header) => {
                        const isZScore = header.includes('_zscore');
                        const val = row[header];
                        const isCellAnomaly = isZScore && Math.abs(val) > 3;

                        return (
                          <td key={`${i}-${header}`} className={`px-4 py-2.5 whitespace-nowrap font-mono text-xs ${isCellAnomaly ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                            {typeof val === 'number' 
                              ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val)
                              : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}

        {/* SQL DEBUG VIEW */}
        {activeTab === "sql" && payload.sql_used && (
          <div className="w-full max-h-[400px] overflow-auto rounded-md bg-[#0d1117] border border-slate-800 p-4">
            <pre className="text-[13px] leading-relaxed text-amber-400/90 font-mono whitespace-pre-wrap">
              {payload.sql_used}
            </pre>
          </div>
        )}
      </div>

      {/* Optional Metadata / ML Diagnostics Message */}
      {payload.message && activeTab !== "sql" && (
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/40 text-[13px] text-slate-400 flex items-center gap-2">
          {resolvedChartConfig?.hasAnomalies ? (
            <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span className="truncate">{payload.message}</span>
        </div>
      )}
    </div>
  );
};