/**
 * ARCLI Intelligence System
 * Phase 4: Analytical Grid Orchestration
 * * Semantically groups, prioritizes, and renders chart jobs.
 * Includes the multi-view Chart Toolbar (Visualization, Table, SQL) per metric.
 */

import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Table as TableIcon, Code2 } from "lucide-react";
import { ChartOrchestrator, ChartJob } from "@/lib/intelligence/chart-orchestrator";
import { ProgressiveChart } from "./ProgressiveChart";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// Types & Interfaces
// -----------------------------------------------------------------------------
interface AnalyticalGridProps {
  orchestrator: ChartOrchestrator;
  jobs: Omit<ChartJob, "status" | "result" | "error" | "retryCount">[];
}

type ViewMode = "chart" | "table" | "sql";

// -----------------------------------------------------------------------------
// Component: Inner View Manager (The "Shopify-Level" Toolbar)
// -----------------------------------------------------------------------------
const DataViewer: React.FC<{ data: any; query: string; viewMode: ViewMode }> = ({
  data,
  query,
  viewMode,
}) => {
  if (viewMode === "sql") {
    return (
      <div className="w-full h-full p-4 bg-slate-900 rounded-md overflow-auto font-mono text-xs text-blue-300">
        <pre>{query}</pre>
      </div>
    );
  }

  if (viewMode === "table") {
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    return (
      <div className="w-full h-full overflow-auto border border-slate-100 rounded-md">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.slice(0, 50).map((row: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                {headers.map((h) => (
                  <td key={h} className="px-4 py-2 text-slate-700 truncate max-w-[150px]">
                    {String(row[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Default: Chart View (Placeholder for actual charting library like Recharts/Vega)
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-md text-slate-400">
      <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
      <span className="text-xs font-medium">Visualization Render Target</span>
      <span className="text-[10px]">Data points: {data.length}</span>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Component: Analytical Grid Main
// -----------------------------------------------------------------------------
export const AnalyticalGrid: React.FC<AnalyticalGridProps> = ({ orchestrator, jobs }) => {
  // Local state to track which view is active for which chart job
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});

  // 1. Register jobs on mount
  useEffect(() => {
    jobs.forEach((job) => orchestrator.addJob(job));
  }, [jobs, orchestrator]);

  // 2. Auto-group charts semantically based on the 'group' property
  const groupedJobs = useMemo(() => {
    const groups: Record<string, typeof jobs> = {};
    jobs.forEach((job) => {
      if (!groups[job.group]) groups[job.group] = [];
      groups[job.group].push(job);
    });
    return groups;
  }, [jobs]);

  const setViewMode = (jobId: string, mode: ViewMode) => {
    setViewModes((prev) => ({ ...prev, [jobId]: mode }));
  };

  return (
    <div className="flex flex-col space-y-12">
      {Object.entries(groupedJobs).map(([groupName, groupJobs]) => (
        <section key={groupName} className="flex flex-col space-y-4">
          
          {/* Group Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 uppercase">
              {groupName} Intelligence
            </h3>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {groupJobs.map((job) => {
              const currentMode = viewModes[job.id] || "chart";

              return (
                <div key={job.id} className="group relative flex flex-col">
                  
                  {/* Toolbar overlay (Appears on hover or if not on chart view) */}
                  <div className={`absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-md border border-slate-200 shadow-sm transition-opacity duration-200 ${currentMode !== 'chart' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-7 w-7 ${currentMode === 'chart' ? 'bg-slate-100 text-blue-600' : 'text-slate-500'}`}
                      onClick={() => setViewMode(job.id, "chart")}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-7 w-7 ${currentMode === 'table' ? 'bg-slate-100 text-blue-600' : 'text-slate-500'}`}
                      onClick={() => setViewMode(job.id, "table")}
                    >
                      <TableIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-7 w-7 ${currentMode === 'sql' ? 'bg-slate-100 text-blue-600' : 'text-slate-500'}`}
                      onClick={() => setViewMode(job.id, "sql")}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Progressive Rendering Wrapper */}
                  <ProgressiveChart
                    jobId={job.id}
                    orchestrator={orchestrator}
                    title={job.id.replace(/_/g, " ").toUpperCase()} // Fallback title formatting
                    heightClass="h-[320px]"
                    onRetry={() => orchestrator.cancelJob(job.id)} // Resets and allows system to retry
                  >
                    {(data) => (
                      <DataViewer 
                        data={data} 
                        query={job.query} 
                        viewMode={currentMode} 
                      />
                    )}
                  </ProgressiveChart>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};