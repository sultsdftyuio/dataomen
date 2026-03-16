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
    size?: { field: string }; 
  };
}

export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
  chart_spec?: ChartConfig; 
}

export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
}

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
  anomalies?: AnomalyInsight[]; 
}

// -----------------------------------------------------------------------------
// Constants & Styling (Premium SaaS Light Theme)
// -----------------------------------------------------------------------------
const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#0891b2", "#7c3aed", "#db2777", "#e11d48", "#0d9488"];
const ANOMALY_COLOR = "#ef4444"; 
const EMA_COLOR = "#94a3b8"; 
const FORECAST_COLOR = "#9333ea"; 
const SIGMA_THRESHOLD = 2.0; 

const renderCustomGradients = () => (
  <defs>
    {CHART_COLORS.map((color, index) => (
      <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.2} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    ))}
    <linearGradient id="grad-forecast" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.2} />
      <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
    </linearGradient>
  </defs>
);

// Helper to format raw database columns to Human Readable strings
const toTitleCase = (str: string) => {
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// -----------------------------------------------------------------------------
// Main Intelligent Component
// -----------------------------------------------------------------------------
export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload, anomalies = [] }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.chart_spec || payload.type === "ml_result" ? "chart" : "table"
  );
  const [copied, setCopied] = useState(false);

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

  // 2. Intelligent Rendering Engine (Data Shape Mapping)
  const resolved = useMemo(() => {
    if (rowCount === 0) return null;
    const sample = data[0];
    const keys = Object.keys(sample);
    
    const hasLegacyAnomalies = keys.some(k => /zscore|z_score/i.test(k));
    const hasExternalAnomalies = anomalies.length > 0;
    const hasAnomalies = hasLegacyAnomalies || hasExternalAnomalies;

    // Determine X-Axis
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
        if (/date|time|month|year|day|ds/i.test(x)) isTimeSeries = true;
    }

    // Categorize Y-Axis series
    const forecastKeys = keys.filter(k => /forecast|predict|trend/i.test(k) && k !== x);
    const emaKeys = keys.filter(k => /_ema/i.test(k) && k !== x);
    const yKeys = keys.filter(k => 
        k !== x && 
        typeof sample[k] === 'number' && 
        !/zscore|variance|id/i.test(k) && 
        !forecastKeys.includes(k) && 
        !emaKeys.includes(k)
    );

    if (payload.chart_spec?.encoding?.y?.field && !yKeys.includes(payload.chart_spec.encoding.y.field)) {
        yKeys.push(payload.chart_spec.encoding.y.field);
    }

    // Determine chart type
    let detectedType: "area" | "line" | "bar" | "pie" | "scatter" = "bar";
    
    if (isTimeSeries) detectedType = "line";
    else if (yKeys.length === 1 && rowCount <= 8 && !isTimeSeries) detectedType = "bar"; 
    
    if (payload.chart_spec?.type) {
      detectedType = payload.chart_spec.type;
    } else if (payload.chart_spec?.mark) {
      const typeStr = typeof payload.chart_spec.mark === 'string' ? payload.chart_spec.mark : payload.chart_spec.mark.type;
      if (["area", "line", "bar", "pie", "scatter"].includes(typeStr.toLowerCase())) {
        detectedType = typeStr.toLowerCase() as any;
      }
    }

    if (forecastKeys.length > 0 && detectedType === "line") detectedType = "area";

    // Determine if data represents Currency or Percentages based on column names
    const isCurrency = yKeys.some(k => /price|revenue|cost|mrr|arr|spend|amount|sales|value/i.test(k));
    const isPercent = yKeys.some(k => /rate|percent|pct|margin|ratio|churn/i.test(k));

    return { 
        type: detectedType, 
        x, 
        y: yKeys, 
        forecast: forecastKeys, 
        ema: emaKeys, 
        hasAnomalies,
        isTimeSeries,
        isCurrency,
        isPercent
    };
  }, [data, payload.chart_spec, anomalies, rowCount]);

  // Intelligent Formatter
  const formatNum = (v: any) => {
    if (typeof v !== 'number') return v;
    
    let formatted = new Intl.NumberFormat('en-US', { 
      notation: "compact", 
      maximumFractionDigits: 1 
    }).format(v);

    if (resolved?.isCurrency) return `$${formatted}`;
    if (resolved?.isPercent) return `${v < 1 ? (v * 100).toFixed(1) : v.toFixed(1)}%`;
    return formatted;
  };

  const renderAnomalyDot = (props: any) => {
    const { cx, cy, payload: row, dataKey } = props;
    if (!row || !resolved) return <g key={`empty-${cx}-${cy}`} />;

    let isAnomaly = false;
    const zKey = Object.keys(row).find(k => k.includes(`${dataKey}_zscore`) || k === 'z_score');
    
    if (zKey && Math.abs(row[zKey]) > SIGMA_THRESHOLD) {
      isAnomaly = true;
    } else if (anomalies.length > 0) {
      const xValue = String(row[resolved.x]);
      const match = anomalies.find(a => a.column === dataKey && a.row_identifier === xValue);
      if (match && match.z_score >= SIGMA_THRESHOLD) isAnomaly = true;
    }

    if (isAnomaly) {
      return (
        <g key={`anomaly-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={6} fill={ANOMALY_COLOR} stroke="#ffffff" strokeWidth={2} className="animate-pulse" />
        </g>
      );
    }
    return <g key={`normal-${cx}-${cy}`} />; 
  };

  const keys = rowCount > 0 ? Object.keys(data[0]) : [];

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
      <div className="flex items-start gap-3 p-4 mt-2 border border-rose-200 bg-rose-50 rounded-xl text-rose-700 shadow-sm">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{payload.message || "Numerical engine error detected."}</p>
      </div>
    );
  }

  if (rowCount === 0 && payload.type !== "text") {
    return (
      <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm italic mt-2 text-center shadow-sm">
        {payload.message || "No results found for current query context."}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full bg-white border border-slate-200 rounded-2xl overflow-hidden mt-2 shadow-sm">
      
      {/* Interactive Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 gap-2">
        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          {resolved && (resolved.y.length > 0 || resolved.forecast.length > 0) && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("chart")}
              className={cn("h-7 text-xs gap-1.5 px-3", activeTab === "chart" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500 hover:text-slate-700")}
            >
              {getChartIcon()}
              Chart
              {resolved.hasAnomalies && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ml-1" />}
              {resolved.forecast.length > 0 && <BrainCircuit size={12} className="text-purple-500 ml-1" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setActiveTab("table")}
            className={cn("h-7 text-xs gap-1.5 px-3", activeTab === "table" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500 hover:text-slate-700")}
          >
            <Table2 size={14} /> Data ({rowCount})
          </Button>
          {payload.sql_used && (
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("sql")}
              className={cn("h-7 text-xs gap-1.5 px-3", activeTab === "sql" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500 hover:text-slate-700")}
            >
              <Code2 size={14} /> SQL
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="h-8 text-xs text-slate-600 bg-white shadow-sm hover:bg-slate-50">
          <Download size={14} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="p-4 sm:p-6">
        {/* VIEW: ANALYTICAL CHARTS */}
        {activeTab === "chart" && resolved && (
          <div className="w-full h-[350px] sm:h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              {resolved.type === "pie" ? (
                <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}
                    formatter={(value: number) => formatNum(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '20px' }} formatter={(value) => toTitleCase(value)} />
                  <Pie
                    data={data} dataKey={resolved.y[0]} nameKey={resolved.x} cx="50%" cy="50%"
                    outerRadius="80%" innerRadius="50%" paddingAngle={2} stroke="none"
                  >
                    {data.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>

              ) : resolved.type === "scatter" ? (
                <ScatterChart margin={{ top: 20, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey={resolved.y.length > 1 ? resolved.y[0] : resolved.x} name={toTitleCase(resolved.y.length > 1 ? resolved.y[0] : resolved.x)} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <YAxis type="number" dataKey={resolved.y.length > 1 ? resolved.y[1] : resolved.y[0]} name={toTitleCase(resolved.y.length > 1 ? resolved.y[1] : resolved.y[0])} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <ZAxis type="category" dataKey={resolved.x} name={toTitleCase(resolved.x)} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{fontWeight: 600, color: '#0f172a'}} />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '20px' }} formatter={(value) => toTitleCase(value)} />
                  <Scatter name="Distribution" data={data} fill={CHART_COLORS[0]}>
                    {data.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Scatter>
                </ScatterChart>

              ) : resolved.type === "area" ? (
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  {renderCustomGradients()}
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={(val) => typeof val === 'string' && val.length > 10 ? val.substring(0,10)+'...' : val}/>
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: '#64748b', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '20px' }} formatter={(value) => toTitleCase(value)} />
                  
                  {resolved.y.map((key, i) => (
                    <Area key={key} name={toTitleCase(key)} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={`url(#grad-${i % CHART_COLORS.length})`} strokeWidth={3} dot={resolved.hasAnomalies ? renderAnomalyDot : false} activeDot={{ r: 6, strokeWidth: 0, fill: CHART_COLORS[i % CHART_COLORS.length] }} />
                  ))}
                  {resolved.forecast.map((key) => (
                    <Area key={key} type="monotone" dataKey={key} stroke={FORECAST_COLOR} fill="url(#grad-forecast)" strokeWidth={2.5} strokeDasharray="5 5" name={`${toTitleCase(key)} (AI Forecast)`} />
                  ))}
                  {resolved.ema.map((key) => (
                    <Area key={key} type="monotone" dataKey={key} stroke={EMA_COLOR} fill="none" strokeDasharray="3 3" strokeWidth={2} name={`${toTitleCase(key.split('_')[0])} (Trend)`} />
                  ))}
                </AreaChart>

              ) : resolved.type === "line" ? (
                <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={(val) => typeof val === 'string' && val.length > 10 ? val.substring(0,10)+'...' : val}/>
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: '#64748b', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '20px' }} formatter={(value) => toTitleCase(value)} />
                  
                  {resolved.y.map((key, i) => (
                    <Line key={key} name={toTitleCase(key)} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={3} dot={resolved.hasAnomalies ? renderAnomalyDot : false} activeDot={{ r: 6, strokeWidth: 0 }} />
                  ))}
                  {resolved.forecast.map((key) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={FORECAST_COLOR} strokeWidth={3} strokeDasharray="5 5" name={`${toTitleCase(key)} (Forecast)`} />
                  ))}
                </LineChart>

              ) : (
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={(val) => typeof val === 'string' && val.length > 10 ? val.substring(0,10)+'...' : val}/>
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: '#64748b', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '20px' }} formatter={(value) => toTitleCase(value)} />
                  
                  {resolved.y.map((key, i) => (
                    <Bar key={key} name={toTitleCase(key)} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                  {resolved.forecast.map((key) => (
                    <Bar key={key} type="monotone" dataKey={key} fill={FORECAST_COLOR} fillOpacity={0.6} radius={[4, 4, 0, 0]} name={`${toTitleCase(key)} (Forecast)`} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* VIEW: DATA TABLE */}
        {activeTab === "table" && data && (
          <ScrollArea className="w-full h-[350px] sm:h-[450px] rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                <tr>
                  {keys.map(k => (
                    <th key={k} className="px-4 py-3 font-bold text-slate-600 uppercase tracking-tight border-b border-slate-200">
                      {toTitleCase(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const xValue = resolved ? String(row[resolved.x]) : '';
                  const isAnomalyRow = anomalies.some(a => a.row_identifier === xValue && a.z_score > SIGMA_THRESHOLD);
                  const isForecastRow = keys.some(k => /forecast|predict/i.test(k) && row[k] !== null && row[k] !== undefined);
                  
                  return (
                    <tr key={i} className={cn("hover:bg-slate-50/80 transition-colors border-b border-slate-100", isAnomalyRow && "bg-rose-50/50", isForecastRow && !isAnomalyRow && "bg-purple-50/30")}>
                      {keys.map(k => {
                        const isAnomCell = anomalies.some(a => a.column === k && a.row_identifier === xValue && a.z_score > SIGMA_THRESHOLD);
                        return (
                          <td key={k} className={cn("px-4 py-3 font-medium", isAnomCell ? "text-rose-600 font-bold" : "text-slate-700")}>
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
          <div className="relative group mt-2">
            <Button variant="secondary" size="sm" onClick={copySQL} className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 bg-white/10 hover:bg-white/20 text-slate-300 border-0">
              {copied ? <Check size={14} className="text-emerald-400 mr-2" /> : <Copy size={14} className="mr-2" />} {copied ? "Copied" : "Copy"}
            </Button>
            <pre className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-inner font-mono text-[13px] text-blue-300 overflow-auto max-h-[450px] leading-loose">
              <code>{payload.sql_used}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};