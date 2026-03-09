import React, { useMemo, useState } from "react";
import { Download, Table2, BarChart3, Code2, AlertCircle } from "lucide-react";
import { Vega } from "react-vega";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
export interface ExecutionPayload {
  type: "chart" | "table" | "ml_result" | "error" | "text";
  data?: Record<string, any>[];
  chart_config?: Record<string, any>;
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
  // Default to chart view if it's a chart payload, otherwise table view
  const [activeTab, setActiveTab] = useState<"chart" | "table" | "sql">(
    payload.type === "chart" ? "chart" : "table"
  );

  // 1. Data Export: CSV Generation Loop (Vectorized logic kept at the edge)
  const downloadCSV = () => {
    if (!payload.data || payload.data.length === 0) return;

    const headers = Object.keys(payload.data[0]);
    const csvContent = [
      headers.join(","),
      ...payload.data.map((row) =>
        headers
          .map((fieldName) => {
            const val = row[fieldName] === null ? "" : String(row[fieldName]);
            // Escape quotes and wrap in quotes for safety
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

  // 2. Vega Spec Patching (Ensures the chart is responsive to the chat bubble)
  const patchedChartSpec = useMemo(() => {
    if (!payload.chart_config) return null;
    return {
      ...payload.chart_config,
      width: "container",
      autosize: { type: "fit", contains: "padding" },
      background: "transparent",
    };
  }, [payload.chart_config]);

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
          {payload.type === "chart" && (
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
        {activeTab === "chart" && patchedChartSpec && (
          <div className="w-full h-[300px] sm:h-[400px] flex items-center justify-center">
            {/* The unified Vega component handles both Vega and VegaLite specs */}
            <Vega spec={patchedChartSpec} data={{ table: payload.data }} actions={false} />
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
                        {/* Format numbers for cleaner analytical readability */}
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