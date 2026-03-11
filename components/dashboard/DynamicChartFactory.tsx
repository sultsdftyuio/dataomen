"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  Download, Table2, BarChart3, LineChart as LineChartIcon, 
  Code2, AlertCircle, AreaChart as AreaChartIcon, Activity, Copy, Check 
} from "lucide-react";
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Type Safety Layer
// -----------------------------------------------------------------------------
export interface ChartConfig {
  type?: "bar" | "line" | "area" | "scatter";
  xAxisKey?: string;
  yAxisKeys?: string[];
  mark?: string | { type: string };
  encoding?: {
    x?: { field: string; type?: string };
    y?: { field: string; type?: string };
    color?: { field: string };
  };
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_spec?: ChartConfig; 
}

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
}

// -----------------------------------------------------------------------------
// Constants & Styling
// -----------------------------------------------------------------------------
const CHART_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4"];
const ANOMALY_COLOR = "#ef4444"; 
const EMA_COLOR = "#94a3b8"; 
const SIGMA_THRESHOLD = 3.0; 

const renderCustomGradients = () => (
  <defs>
    {CHART_COLORS.map((color, index) => (
      <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.4} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    ))}
  </defs>
);

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.chart_spec || payload.type === "ml_result" ? "chart" : "table"
  );
  const [copied, setCopied] = useState(false);

  // 1. Data Export Implementation
  const downloadCSV = useCallback(() => {
    if (!payload.data?.length) return;
    const headers = Object.keys(payload.data[0]);
    const csvContent = [
      headers.join(","),
      ...payload.data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dataomen_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [payload.data]);

  const copySQL = useCallback(() => {
    if (!payload.sql_used) return;
    navigator.clipboard.writeText(payload.sql_used);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [payload.sql_used]);

  // 2. Intelligent Rendering Engine
  const resolved = useMemo(() => {
    if (!payload.data?.length) return null;
    const sample = payload.data[0];
    const keys = Object.keys(sample);
    
    const hasAnomalies = keys.some(k => /zscore|z_score/i.test(k));

    if (payload.chart_spec?.encoding) {
      const { encoding, mark } = payload.chart_spec;
      const typeStr = typeof mark === 'string' ? mark : mark?.type || 'bar';
      return {
        type: typeStr === 'area' ? 'area' : typeStr === 'line' ? 'line' : 'bar',
        x: encoding.x?.field || keys[0],
        y: encoding.y?.field ? [encoding.y?.field] : keys.filter(k => typeof sample[k] === 'number' && !/zscore|ema/i.test(k)),
        hasAnomalies
      };
    }

    const x = keys.find(k => /date|time|month|ds/i.test(k)) || keys.find(k => typeof sample[k] === 'string') || keys[0];
    const y = keys.filter(k => k !== x && typeof sample[k] === 'number' && !/zscore|variance|ema/i.test(k));
    const detectedType = (x.toLowerCase().includes('date') || x.toLowerCase().includes('time')) ? "area" : "bar";

    return { type: detectedType, x, y, hasAnomalies };
  }, [payload.data, payload.chart_spec]);

  const formatNum = (v: any) => typeof v === 'number' 
    ? new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(v) 
    : v;

  /**
   * FIX: Returning an invisible element instead of null to satisfy Recharts TypeScript overloads.
   */
  const renderAnomalyDot = (props: any) => {
    const { cx, cy, payload: row, dataKey } = props;
    const zKey = Object.keys(row).find(k => k.includes(`${dataKey}_zscore`) || k === 'z_score');
    if (zKey && Math.abs(row[zKey]) > SIGMA_THRESHOLD) {
      return (
        <circle cx={cx} cy={cy} r={6} fill={ANOMALY_COLOR} stroke="#0B1120" strokeWidth={2} className="animate-pulse" />
      );
    }
    return <circle cx={cx} cy={cy} r={0} />; 
  };

  const keys = payload.data?.length ? Object.keys(payload.data[0]) : [];

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------
  if (payload.type === "error") {
    return (
      <div className="flex items-start gap-3 p-4 mt-2 border border-red-500/20 bg-red-500/10 rounded-xl text-red-400">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">{payload.message || "Numerical engine error detected."}</p>
      </div>
    );
  }

  if (!payload.data?.length && payload.type !== "text") {
    return (
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-400 text-sm italic mt-2">
        {payload.message || "No results found for current query context."}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full bg-[#0B1120] border border-slate-800 rounded-xl overflow-hidden mt-2 shadow-xl">
      {/* Interactive Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
        <div className="flex gap-1">
          {resolved && resolved.y.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("chart")}
              className={cn("h-8 text-xs gap-2", activeTab === "chart" ? "bg-slate-800 text-emerald-400" : "text-slate-400")}
            >
              {resolved.type === "area" ? <AreaChartIcon size={14} /> : resolved.type === "line" ? <LineChartIcon size={14} /> : <BarChart3 size={14} />}
              Visual
              {resolved.hasAnomalies && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setActiveTab("table")}
            className={cn("h-8 text-xs gap-2", activeTab === "table" ? "bg-slate-800 text-blue-400" : "text-slate-400")}
          >
            <Table2 size={14} /> Dataset ({payload.data?.length})
          </Button>
          {payload.sql_used && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("sql")}
              className={cn("h-8 text-xs gap-2", activeTab === "sql" ? "bg-slate-800 text-amber-400" : "text-slate-400")}
            >
              <Code2 size={14} /> SQL Execution
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={downloadCSV} className="h-8 text-xs text-slate-500 hover:text-white">
          <Download size={14} className="mr-2" /> Download
        </Button>
      </div>

      <div className="p-5">
        {/* VIEW: ANALYTICAL CHARTS */}
        {activeTab === "chart" && resolved && (
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              {resolved.type === "area" ? (
                <AreaChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  {renderCustomGradients()}
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  {resolved.y.map((key, i) => (
                    <Area 
                      key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                      fill={`url(#grad-${i % CHART_COLORS.length})`} strokeWidth={2.5}
                      dot={resolved.hasAnomalies ? renderAnomalyDot : false} 
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))}
                  {/* Vectorized EMA Overlay */}
                  {keys.filter(k => k.includes('_ema')).map(k => (
                    <Area key={k} type="monotone" dataKey={k} stroke={EMA_COLOR} fill="none" strokeDasharray="5 5" strokeWidth={1.5} name={`${k.split('_')[0]} (EMA)`} />
                  ))}
                </AreaChart>
              ) : resolved.type === "line" ? (
                <LineChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  {resolved.y.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={3} 
                      dot={resolved.hasAnomalies ? renderAnomalyDot : false} 
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  {resolved.y.map((key, i) => (
                    <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* VIEW: DATA TABLE (With Row-Level Anomaly Detection) */}
        {activeTab === "table" && payload.data && (
          <ScrollArea className="w-full h-[400px] rounded-lg border border-slate-800 bg-slate-950/20 shadow-inner">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-10 shadow-sm">
                <tr>
                  {keys.map(k => (
                    <th key={k} className="px-4 py-3 font-semibold text-slate-400 uppercase tracking-tight border-b border-slate-800">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.data.map((row, i) => {
                  const isAnomalyRow = keys.some(k => k.includes('zscore') && Math.abs(row[k]) > SIGMA_THRESHOLD);
                  return (
                    <tr key={i} className={cn("hover:bg-slate-800/40 transition-colors", isAnomalyRow && "bg-red-950/10")}>
                      {keys.map(k => {
                        const isZ = k.includes('zscore');
                        const isAnomCell = isZ && Math.abs(row[k]) > SIGMA_THRESHOLD;
                        return (
                          <td key={k} className={cn("px-4 py-2 font-mono border-b border-slate-800/50", isAnomCell ? "text-red-400 font-bold" : "text-slate-300")}>
                            {formatNum(row[k])}
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

        {/* VIEW: SQL DEBUGGER */}
        {activeTab === "sql" && (
          <div className="relative group">
            <Button variant="ghost" size="icon" onClick={copySQL}
              className="absolute right-4 top-4 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </Button>
            <pre className="p-4 rounded-lg bg-black/50 border border-slate-800 font-mono text-[13px] text-amber-400/80 overflow-auto max-h-[400px] leading-relaxed">
              {payload.sql_used}
            </pre>
          </div>
        )}
      </div>

      {/* FOOTER: ML DIAGNOSTICS */}
      {payload.message && (
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30 flex items-center gap-2">
          {resolved?.hasAnomalies ? (
            <Activity size={14} className="text-red-500 animate-pulse" /> 
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <p className="text-[12px] text-slate-500 italic truncate">{payload.message}</p>
        </div>
      )}
    </div>
  );
};