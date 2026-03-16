"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  Download, Table2, BarChart3, LineChart as LineChartIcon, 
  Code2, AlertCircle, AreaChart as AreaChartIcon, Activity, 
  Copy, Check, BrainCircuit, PieChart as PieChartIcon, ScatterChart as ScatterChartIcon
} from "lucide-react";
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend 
} from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Type Safety Layer
// -----------------------------------------------------------------------------
export interface ChartConfig {
  type?: "bar" | "line" | "area" | "scatter" | "pie";
  xAxisKey?: string;
  yAxisKeys?: string[];
  mark?: string | { type: string };
  encoding?: {
    x?: { field: string; type?: string };
    y?: { field: string; type?: string };
    color?: { field: string };
    size?: { field: string }; // Useful for scatter
  };
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_spec?: ChartConfig; 
}

// Phase 3 Integration: Accept the InsightOrchestrator anomalies
export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
}

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
  anomalies?: AnomalyInsight[]; // Optional to support legacy/raw queries
}

// -----------------------------------------------------------------------------
// Constants & Styling
// -----------------------------------------------------------------------------
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6"];
const ANOMALY_COLOR = "#ef4444"; 
const EMA_COLOR = "#94a3b8"; 
const FORECAST_COLOR = "#a855f7"; 
const SIGMA_THRESHOLD = 2.0; // Synced with InsightOrchestrator (2-Sigma Band)

const renderCustomGradients = () => (
  <defs>
    {CHART_COLORS.map((color, index) => (
      <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.4} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    ))}
    <linearGradient id="grad-forecast" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.4} />
      <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
    </linearGradient>
  </defs>
);

// -----------------------------------------------------------------------------
// Phase 4.1: Automatic Chart Intelligence Component
// -----------------------------------------------------------------------------
export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload, anomalies = [] }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.chart_spec || payload.type === "ml_result" ? "chart" : "table"
  );
  const [copied, setCopied] = useState(false);

  // Safely extract data to prevent undefined errors
  const data = payload.data || [];
  const rowCount = data.length;

  // 1. Data Export Implementation
  const downloadCSV = useCallback(() => {
    if (rowCount === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dataomen_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, rowCount]);

  const copySQL = useCallback(() => {
    if (!payload.sql_used) return;
    navigator.clipboard.writeText(payload.sql_used);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [payload.sql_used]);

  // 2. Intelligent Rendering Engine (Deterministic Data Shape Mapping)
  const resolved = useMemo(() => {
    if (rowCount === 0) return null;
    const sample = data[0];
    const keys = Object.keys(sample);
    
    // Check if anomalies exist either in raw SQL (legacy) or via the new Insight Payload
    const hasLegacyAnomalies = keys.some(k => /zscore|z_score/i.test(k));
    const hasExternalAnomalies = anomalies.length > 0;
    const hasAnomalies = hasLegacyAnomalies || hasExternalAnomalies;

    // Determine X-Axis (Prioritize Time-Series columns, then categorical strings)
    let isTimeSeries = false;
    let x = keys.find(k => {
      if (/date|time|month|year|day|ds/i.test(k)) {
        isTimeSeries = true;
        return true;
      }
      return false;
    }) || keys.find(k => typeof sample[k] === 'string') || keys[0];
    
    if (payload.chart_spec?.encoding?.x?.field) {
        x = payload.chart_spec.encoding.x.field;
        // Re-evaluate timeseries based on explicit LLM spec
        if (/date|time|month|year|day|ds/i.test(x)) isTimeSeries = true;
    }

    // Categorize Y-Axis series for advanced layering
    const forecastKeys = keys.filter(k => /forecast|predict|trend/i.test(k) && k !== x);
    const emaKeys = keys.filter(k => /_ema/i.test(k) && k !== x);
    const yKeys = keys.filter(k => 
        k !== x && 
        typeof sample[k] === 'number' && 
        !/zscore|variance|id/i.test(k) && // Exclude IDs and statistical artifacts
        !forecastKeys.includes(k) && 
        !emaKeys.includes(k)
    );

    // Override from LLM Chart Spec if provided
    if (payload.chart_spec?.encoding?.y?.field && !yKeys.includes(payload.chart_spec.encoding.y.field)) {
        yKeys.push(payload.chart_spec.encoding.y.field);
    }

    // Determine deterministic chart type based on Data Shape
    let detectedType: "area" | "line" | "bar" | "pie" | "scatter" = "bar";
    
    // Auto-Intelligence Heuristics
    if (isTimeSeries) {
      detectedType = "line"; // Continuous data defaults to line/area
    } else if (yKeys.length === 1 && rowCount <= 8 && !isTimeSeries) {
      // Small categorical distribution -> Good candidate for Pie
      // We'll leave default as Bar but allow explicit override to Pie easily
      detectedType = "bar"; 
    } else if (yKeys.length >= 2 && !isTimeSeries) {
      // Multiple numeric metrics without time -> Good candidate for Scatter/Correlation
      // Leaving default as Bar to be safe unless explicitly requested
    }

    // Explicit Overrides from LLM Spec
    if (payload.chart_spec?.type) {
      detectedType = payload.chart_spec.type;
    } else if (payload.chart_spec?.mark) {
      const typeStr = typeof payload.chart_spec.mark === 'string' ? payload.chart_spec.mark : payload.chart_spec.mark.type;
      if (["area", "line", "bar", "pie", "scatter"].includes(typeStr.toLowerCase())) {
        detectedType = typeStr.toLowerCase() as any;
      }
    }

    // Force area if it's a forecast to show standard deviation bands cleanly
    if (forecastKeys.length > 0 && detectedType === "line") {
      detectedType = "area";
    }

    return { 
        type: detectedType, 
        x, 
        y: yKeys, 
        forecast: forecastKeys, 
        ema: emaKeys, 
        hasAnomalies,
        isTimeSeries
    };
  }, [data, payload.chart_spec, anomalies, rowCount]);

  const formatNum = (v: any) => typeof v === 'number' 
    ? new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(v) 
    : v;

  /**
   * Safe Custom Anomaly Dot Renderer (Bridging SQL ML with Polars InsightOrchestrator)
   */
  const renderAnomalyDot = (props: any) => {
    const { cx, cy, payload: row, dataKey } = props;
    if (!row || !resolved) return <g key={`empty-${cx}-${cy}`} />;

    let isAnomaly = false;

    // 1. Legacy SQL ML Check
    const zKey = Object.keys(row).find(k => k.includes(`${dataKey}_zscore`) || k === 'z_score');
    if (zKey && Math.abs(row[zKey]) > SIGMA_THRESHOLD) {
      isAnomaly = true;
    } 
    // 2. Phase 3 InsightOrchestrator Check
    else if (anomalies.length > 0) {
      const xValue = String(row[resolved.x]);
      const match = anomalies.find(a => a.column === dataKey && a.row_identifier === xValue);
      if (match && match.z_score >= SIGMA_THRESHOLD) {
        isAnomaly = true;
      }
    }

    if (isAnomaly) {
      return (
        <g key={`anomaly-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={6} fill={ANOMALY_COLOR} stroke="#0B1120" strokeWidth={2} className="animate-pulse" />
        </g>
      );
    }
    return <g key={`normal-${cx}-${cy}`} />; 
  };

  const keys = rowCount > 0 ? Object.keys(data[0]) : [];

  // Get dynamic icon based on resolved type
  const getChartIcon = () => {
    if (!resolved) return <BarChart3 size={14} />;
    switch (resolved.type) {
      case "area": return <AreaChartIcon size={14} />;
      case "line": return <LineChartIcon size={14} />;
      case "pie": return <PieChartIcon size={14} />;
      case "scatter": return <ScatterChartIcon size={14} />;
      default: return <BarChart3 size={14} />;
    }
  };

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

  if (rowCount === 0 && payload.type !== "text") {
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
          {resolved && (resolved.y.length > 0 || resolved.forecast.length > 0) && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("chart")}
              className={cn("h-8 text-xs gap-2", activeTab === "chart" ? "bg-slate-800 text-emerald-400" : "text-slate-400")}
            >
              {getChartIcon()}
              Visual
              {resolved.hasAnomalies && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              {resolved.forecast.length > 0 && <BrainCircuit size={12} className="text-purple-400 ml-1" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setActiveTab("table")}
            className={cn("h-8 text-xs gap-2", activeTab === "table" ? "bg-slate-800 text-blue-400" : "text-slate-400")}
          >
            <Table2 size={14} /> Dataset ({rowCount})
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
              {resolved.type === "pie" ? (
                <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ fontSize: '12px' }}
                    formatter={(value: number) => formatNum(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Pie
                    data={data}
                    dataKey={resolved.y[0]}
                    nameKey={resolved.x}
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    innerRadius={60}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>

              ) : resolved.type === "scatter" ? (
                <ScatterChart margin={{ top: 20, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  {/* For scatter, we use the first two Y keys as X and Y if X isn't purely numeric */}
                  <XAxis 
                    type="number" 
                    dataKey={resolved.y.length > 1 ? resolved.y[0] : resolved.x} 
                    name={resolved.y.length > 1 ? resolved.y[0] : resolved.x} 
                    stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} 
                  />
                  <YAxis 
                    type="number" 
                    dataKey={resolved.y.length > 1 ? resolved.y[1] : resolved.y[0]} 
                    name={resolved.y.length > 1 ? resolved.y[1] : resolved.y[0]} 
                    stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} 
                  />
                  <ZAxis type="category" dataKey={resolved.x} name={resolved.x} />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f8fafc' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  <Scatter name="Distribution" data={data} fill={CHART_COLORS[0]}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>

              ) : resolved.type === "area" ? (
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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

                  {resolved.forecast.map((key) => (
                    <Area 
                      key={key} type="monotone" dataKey={key} stroke={FORECAST_COLOR} 
                      fill="url(#grad-forecast)" strokeWidth={2.5} strokeDasharray="5 5"
                      name={`${key.replace(/_/g, ' ')} (AI Forecast)`}
                    />
                  ))}

                  {resolved.ema.map((key) => (
                    <Area key={key} type="monotone" dataKey={key} stroke={EMA_COLOR} fill="none" strokeDasharray="3 3" strokeWidth={1.5} name={`${key.split('_')[0]} (EMA)`} />
                  ))}
                </AreaChart>

              ) : resolved.type === "line" ? (
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  
                  {resolved.y.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={3} 
                      dot={resolved.hasAnomalies ? renderAnomalyDot : false} activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))}

                  {resolved.forecast.map((key) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={FORECAST_COLOR} strokeWidth={3} strokeDasharray="5 5" name={`${key} (Forecast)`} />
                  ))}
                </LineChart>

              ) : (
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                  
                  {resolved.y.map((key, i) => (
                    <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                  
                  {resolved.forecast.map((key) => (
                    <Bar key={key} dataKey={key} fill={FORECAST_COLOR} fillOpacity={0.6} radius={[4, 4, 0, 0]} name={`${key} (Forecast)`} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* VIEW: DATA TABLE (With Unified Anomaly Tinting) */}
        {activeTab === "table" && data && (
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
                {data.map((row, i) => {
                  const xValue = resolved ? String(row[resolved.x]) : '';
                  
                  // Unified row highlight logic
                  const isLegacyAnomalyRow = keys.some(k => k.includes('zscore') && Math.abs(row[k]) > SIGMA_THRESHOLD);
                  const isPhase3AnomalyRow = anomalies.some(a => a.row_identifier === xValue && a.z_score > SIGMA_THRESHOLD);
                  const isAnomalyRow = isLegacyAnomalyRow || isPhase3AnomalyRow;
                  
                  const isForecastRow = keys.some(k => /forecast|predict/i.test(k) && row[k] !== null && row[k] !== undefined);
                  
                  return (
                    <tr key={i} className={cn(
                      "hover:bg-slate-800/40 transition-colors", 
                      isAnomalyRow && "bg-red-950/10",
                      isForecastRow && !isAnomalyRow && "bg-purple-950/10"
                    )}>
                      {keys.map(k => {
                        const isLegacyZ = k.includes('zscore') && Math.abs(row[k]) > SIGMA_THRESHOLD;
                        const isPhase3Z = anomalies.some(a => a.column === k && a.row_identifier === xValue && a.z_score > SIGMA_THRESHOLD);
                        const isAnomCell = isLegacyZ || isPhase3Z;
                        const isForecastCell = /forecast|predict/i.test(k);
                        
                        return (
                          <td key={k} className={cn(
                            "px-4 py-2 font-mono border-b border-slate-800/50", 
                            isAnomCell ? "text-red-400 font-bold" : 
                            isForecastCell ? "text-purple-300" : "text-slate-300"
                          )}>
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
          ) : resolved?.forecast.length ? (
            <BrainCircuit size={14} className="text-purple-500 animate-pulse" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <p className="text-[12px] text-slate-500 italic truncate">{payload.message}</p>
        </div>
      )}
    </div>
  );
};