"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  Download, Table2, BarChart3, LineChart as LineChartIcon, 
  Code2, AlertCircle, AreaChart as AreaChartIcon, Activity, 
  Copy, Check, BrainCircuit, PieChart as PieChartIcon, ScatterChart as ScatterChartIcon,
  Database
} from "lucide-react";
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend 
} from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Import the Brain (Heuristics & Types) ──
import { 
  ExecutionPayload, 
  AnomalyInsight, 
  CHART_COLORS, 
  ANOMALY_COLOR, 
  EMA_COLOR, 
  FORECAST_COLOR, 
  SIGMA_THRESHOLD,
  toTitleCase,
  formatEngineValue,
  resolveChartDataShape
} from "@/lib/chart-engine";

interface DynamicChartFactoryProps {
  payload: ExecutionPayload;
  anomalies?: AnomalyInsight[]; 
}

const renderCustomGradients = () => (
  <defs>
    {CHART_COLORS.map((color, index) => (
      <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    ))}
    <linearGradient id="grad-forecast" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.3} />
      <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
    </linearGradient>
  </defs>
);

export const DynamicChartFactory: React.FC<DynamicChartFactoryProps> = ({ payload, anomalies = [] }) => {
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.chart_spec || payload.type === "ml_result" || payload.type === "chart" ? "chart" : "table"
  );
  const [copied, setCopied] = useState(false);

  const data = payload.data || [];
  const rowCount = data.length;

  // ── Data Export ──
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
    link.download = `arcli_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, rowCount]);

  const copySQL = useCallback(() => {
    if (!payload.sql_used) return;
    navigator.clipboard.writeText(payload.sql_used);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [payload.sql_used]);

  // ── Intelligent Rendering Engine ──
  const resolved = useMemo(() => {
    return resolveChartDataShape(data, payload.chart_spec, anomalies);
  }, [data, payload.chart_spec, anomalies]);

  // TYPE FIX: Recharts expects tickFormatter to return strictly a string.
  const formatNum = (v: any): string => {
    return String(formatEngineValue(v, resolved?.isCurrency, resolved?.isPercent));
  };

  // TYPE FIX: Dedicated string formatter for X-Axis labels to prevent layout breaks.
  const formatXAxisLabel = (val: any): string => {
    if (typeof val === 'string' && val.length > 10) return val.substring(0, 10) + '...';
    return String(val);
  };

  const renderAnomalyDot = (props: any) => {
    const { cx, cy, payload: row, dataKey } = props;
    if (!row || !resolved) return <g key={`empty-${cx}-${cy}`} />;

    let isAnomaly = false;
    const zKey = Object.keys(row).find(k => k.includes(`${dataKey}_zscore`) || k === 'z_score');
    
    if (zKey && Math.abs(row[zKey]) > SIGMA_THRESHOLD) isAnomaly = true;
    else if (anomalies.length > 0) {
      const xValue = String(row[resolved.x]);
      const match = anomalies.find(a => a.column === dataKey && a.row_identifier === xValue);
      if (match && match.z_score >= SIGMA_THRESHOLD) isAnomaly = true;
    }

    if (isAnomaly) {
      return (
        <g key={`anomaly-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={6} fill={ANOMALY_COLOR} stroke="hsl(var(--background))" strokeWidth={2} className="animate-pulse" />
        </g>
      );
    }
    return <g key={`normal-${cx}-${cy}`} />; 
  };

  const keys = rowCount > 0 ? Object.keys(data[0]) : [];

  const getChartIcon = () => {
    if (!resolved) return <BarChart3 size={16} />;
    switch (resolved.type) {
      case "area": return <AreaChartIcon size={16} />;
      case "line": return <LineChartIcon size={16} />;
      case "pie": return <PieChartIcon size={16} />;
      case "scatter": return <ScatterChartIcon size={16} />;
      default: return <BarChart3 size={16} />;
    }
  };

  // ── View Renderers ──
  if (payload.type === "error") {
    return (
      <div className="flex items-start gap-3 p-4 border border-destructive/20 bg-destructive/5 rounded-2xl text-destructive shadow-sm">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex flex-col">
          <span className="text-sm font-bold">Execution Error</span>
          <span className="text-sm opacity-90">{payload.message || "Failed to execute analytical query."}</span>
        </div>
      </div>
    );
  }

  if (rowCount === 0 && payload.type !== "text") {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-muted/20 border border-border rounded-2xl text-muted-foreground text-sm shadow-sm">
        <Activity className="w-8 h-8 mb-3 opacity-20" />
        {payload.message || "No results returned for this query."}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
      
      {/* ── Segmented Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-muted/20 border-b border-border gap-2">
        <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50">
          {resolved && (resolved.y.length > 0 || resolved.forecast.length > 0) && (
            <button 
              onClick={() => setActiveTab("chart")}
              className={cn("flex items-center gap-2 h-8 px-4 text-xs font-semibold rounded-lg transition-all", activeTab === "chart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {getChartIcon()} Chart
              {resolved.hasAnomalies && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse ml-0.5" />}
              {resolved.forecast.length > 0 && <BrainCircuit size={12} className="text-primary ml-0.5" />}
            </button>
          )}
          <button 
            onClick={() => setActiveTab("table")}
            className={cn("flex items-center gap-2 h-8 px-4 text-xs font-semibold rounded-lg transition-all", activeTab === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Table2 size={16} /> Data <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">{rowCount}</Badge>
          </button>
          {payload.sql_used && (
            <button 
              onClick={() => setActiveTab("sql")}
              className={cn("flex items-center gap-2 h-8 px-4 text-xs font-semibold rounded-lg transition-all", activeTab === "sql" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Code2 size={16} /> SQL
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="h-8 text-xs bg-background shadow-sm rounded-lg hover:border-primary/50">
          <Download size={14} className="mr-2" /> Export
        </Button>
      </div>

      <div className="p-4 sm:p-6 bg-background">
        
        {/* ── VIEW: CHART ── */}
        {activeTab === "chart" && resolved && (
          <div className="w-full h-[350px] sm:h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              {resolved.type === "pie" ? (
                <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatNum(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))', paddingTop: '20px' }} formatter={(value) => toTitleCase(String(value))} />
                  <Pie data={data} dataKey={resolved.y[0]} nameKey={resolved.x} cx="50%" cy="50%" outerRadius="80%" innerRadius="50%" paddingAngle={2} stroke="none">
                    {data.map((_, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              ) : resolved.type === "scatter" ? (
                <ScatterChart margin={{ top: 20, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis type="number" dataKey={resolved.y.length > 1 ? resolved.y[0] : resolved.x} name={toTitleCase(resolved.y.length > 1 ? resolved.y[0] : resolved.x)} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <YAxis type="number" dataKey={resolved.y.length > 1 ? resolved.y[1] : resolved.y[0]} name={toTitleCase(resolved.y.length > 1 ? resolved.y[1] : resolved.y[0])} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <ZAxis type="category" dataKey={resolved.x} name={toTitleCase(resolved.x)} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{fontWeight: 600, color: 'hsl(var(--foreground))'}} />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))', paddingTop: '20px' }} formatter={(value) => toTitleCase(String(value))} />
                  <Scatter name="Distribution" data={data} fill={CHART_COLORS[0]}>
                    {data.map((_, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Scatter>
                </ScatterChart>
              ) : resolved.type === "area" ? (
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  {renderCustomGradients()}
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={formatXAxisLabel}/>
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: 'hsl(var(--muted-foreground))', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))', paddingTop: '20px' }} formatter={(value) => toTitleCase(String(value))} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={formatXAxisLabel}/>
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: 'hsl(var(--muted-foreground))', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))', paddingTop: '20px' }} formatter={(value) => toTitleCase(String(value))} />
                  {resolved.y.map((key, i) => (
                    <Line key={key} name={toTitleCase(key)} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={3} dot={resolved.hasAnomalies ? renderAnomalyDot : false} activeDot={{ r: 6, strokeWidth: 0 }} />
                  ))}
                  {resolved.forecast.map((key) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={FORECAST_COLOR} strokeWidth={3} strokeDasharray="5 5" name={`${toTitleCase(key)} (Forecast)`} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey={resolved.x} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} tickFormatter={formatXAxisLabel}/>
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{color: 'hsl(var(--muted-foreground))', marginBottom: '4px'}} itemStyle={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))', paddingTop: '20px' }} formatter={(value) => toTitleCase(String(value))} />
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

        {/* ── VIEW: DATA TABLE ── */}
        {activeTab === "table" && data && (
          <ScrollArea className="w-full h-[350px] sm:h-[450px] rounded-xl border border-border bg-background shadow-sm">
            <table className="w-full text-left text-xs sm:text-[13px] border-collapse">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-md z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider border-b border-border w-12 text-center">#</th>
                  {keys.map(k => (
                    <th key={k} className="px-4 py-3 font-semibold text-foreground border-b border-border whitespace-nowrap">
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
                    <tr key={i} className={cn("hover:bg-muted/30 transition-colors border-b border-border", isAnomalyRow && "bg-destructive/5 hover:bg-destructive/10", isForecastRow && !isAnomalyRow && "bg-primary/5 dark:bg-primary/10")}>
                      <td className="px-4 py-2.5 text-muted-foreground text-center font-mono border-r border-border/30">{i + 1}</td>
                      {keys.map(k => {
                        const isAnomCell = anomalies.some(a => a.column === k && a.row_identifier === xValue && a.z_score > SIGMA_THRESHOLD);
                        const isNumeric = typeof row[k] === 'number';
                        return (
                          <td key={k} className={cn("px-4 py-2.5", isAnomCell ? "text-destructive font-bold" : "text-foreground", isNumeric && "font-mono")}>
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

        {/* ── VIEW: SQL DEBUGGER ── */}
        {activeTab === "sql" && (
          <div className="relative group rounded-xl overflow-hidden border border-border">
            <Button variant="secondary" size="sm" onClick={copySQL} className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border-0 z-10">
              {copied ? <Check size={14} className="text-emerald-400 mr-2" /> : <Copy size={14} className="mr-2" />} {copied ? "Copied" : "Copy"}
            </Button>
            <div className="bg-[#0d1117] px-6 py-5 overflow-auto max-h-[450px]">
              <pre className="font-mono text-[13px] text-[#e6edf3] leading-relaxed">
                <code>{payload.sql_used}</code>
              </pre>
            </div>
            <div className="bg-[#161b22] px-4 py-2 border-t border-[#30363d] text-[10px] text-[#8b949e] font-mono uppercase tracking-widest flex items-center">
              <Database className="w-3 h-3 mr-2" /> Executed via DuckDB Columnar Engine
            </div>
          </div>
        )}
      </div>
    </div>
  );
};