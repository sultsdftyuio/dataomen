import React, { useState, useMemo } from "react";
import { Download, Table2, BarChart3, Code2, AlertCircle } from "lucide-react";
import { 
  BarChart, 
  Bar, 
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
export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  message?: string;
  sql_used?: string;
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

  // 2. Intelligent Auto-Axis Detection for Dynamic Recharts
  const chartConfig = useMemo(() => {
    if (!payload.data || payload.data.length === 0) return null;
    
    const sampleRow = payload.data[0];
    const keys = Object.keys(sampleRow);
    
    // Automatically detect strings/dates for the X-Axis, default to the first column
    const xAxisKey = keys.find(k => typeof sampleRow[k] === 'string') || keys[0];
    
    // Automatically extract numerical values for Y-Axis bars
    const yAxisKeys = keys.filter(k => k !== xAxisKey && typeof sampleRow[k] === 'number');

    return { xAxisKey, yAxisKeys };
  }, [payload.data]);

  const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  // Handle Error States
  if (payload.type === "error") {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start space-x-3 text-red-500">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">{payload.message || "An unknown execution error occurred."}</p>
      </div>
    );
  }

  // Handle Standard Text/Fallback
  if (payload.type === "text" || !payload.data) {
    return <div className="text-sm text-slate-200">{payload.message}</div>;
  }

  const tableHeaders = Object.keys(payload.data[0] || {});

  return (
    <div className="flex flex-col w-full max-w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mt-2 shadow-lg shadow-black/50">
      
      {/* Top Toolbar: Context & Actions */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-800">
        <div className="flex space-x-1">
          {payload.type === "chart" && chartConfig && chartConfig.yAxisKeys.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("chart")}
              className={`h-8 px-2 text-xs ${activeTab === "chart" ? "bg-slate-700 text-white" : "text-slate-400"}`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Chart
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab("table")}
            className={`h-8 px-2 text-xs ${activeTab === "table" ? "bg-slate-700 text-white" : "text-slate-400"}`}
          >
            <Table2 className="w-3.5 h-3.5 mr-1.5" /> Data ({payload.data.length})
          </Button>
          {payload.sql_used && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("sql")}
              className={`h-8 px-2 text-xs ${activeTab === "sql" ? "bg-slate-700 text-white" : "text-slate-400"}`}
            >
              <Code2 className="w-3.5 h-3.5 mr-1.5" /> SQL
            </Button>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={downloadCSV} className="h-8 px-2 text-xs text-slate-400 hover:text-white">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Dynamic Render Zone */}
      <div className="p-4 w-full overflow-hidden">
        
        {/* CHART VIEW */}
        {activeTab === "chart" && chartConfig && chartConfig.yAxisKeys.length > 0 && (
          <div className="w-full h-[300px] sm:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payload.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey={chartConfig.xAxisKey} 
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
                  tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(val)}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                {chartConfig.yAxisKeys.map((key, idx) => (
                  <Bar 
                    key={key} 
                    dataKey={key} 
                    fill={CHART_COLORS[idx % CHART_COLORS.length]} 
                    radius={[4, 4, 0, 0]} 
                  />
                ))}
              </BarChart>
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
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payload.data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    {tableHeaders.map((header) => (
                      <td key={`${i}-${header}`} className="px-4 py-2 text-slate-300 whitespace-nowrap">
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
          <div className="w-full max-h-[400px] overflow-auto rounded-md bg-slate-950 border border-slate-800 p-4">
            <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">
              {payload.sql_used}
            </pre>
          </div>
        )}
      </div>

      {/* Optional Metadata Message */}
      {payload.message && activeTab !== "sql" && (
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-400">
          {payload.message}
        </div>
      )}
    </div>
  );
};