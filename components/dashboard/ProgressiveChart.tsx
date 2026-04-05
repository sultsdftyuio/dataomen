/**
 * ARCLI Intelligence System
 * Phase 4: Progressive Chart Component
 * * Subscribes to the ChartOrchestrator and manages the lifecycle UI of a single analytical query.
 * Enforces smooth skeleton transitions, semantic error handling, and non-blocking rendering.
 */

import React, { useEffect, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartOrchestrator, ChartJob } from "@/lib/intelligence/chart-orchestrator";

// -----------------------------------------------------------------------------
// Hook: Binds React state to the Orchestrator's event emitter
// -----------------------------------------------------------------------------
export function useChartSubscription(jobId: string, orchestrator: ChartOrchestrator) {
  const [job, setJob] = useState<ChartJob | null>(null);

  useEffect(() => {
    // Subscribe returns an unsubscribe cleanup function
    const unsubscribe = orchestrator.subscribe(jobId, (updatedJob) => {
      setJob(updatedJob);
    });

    return () => unsubscribe();
  }, [jobId, orchestrator]);

  return job;
}

// -----------------------------------------------------------------------------
// Component: Progressive Chart Wrapper
// -----------------------------------------------------------------------------
interface ProgressiveChartProps {
  jobId: string;
  orchestrator: ChartOrchestrator;
  title: string;
  description?: string;
  heightClass?: string;
  /** * Render prop pattern ensures this wrapper remains completely decoupled 
   * from the actual chart rendering engine (e.g., Vega, ECharts, D3).
   */
  children: (data: any) => React.ReactNode;
  onRetry?: () => void;
}

export const ProgressiveChart: React.FC<ProgressiveChartProps> = ({
  jobId,
  orchestrator,
  title,
  description,
  heightClass = "h-[300px]",
  children,
  onRetry,
}) => {
  const job = useChartSubscription(jobId, orchestrator);

  // Derive state (default to loading if job isn't registered yet to prevent flashing)
  const isPending = !job || job.status === "idle" || job.status === "loading";
  const isError = job?.status === "error";
  const isReady = job?.status === "ready";

  return (
    <Card className="flex flex-col bg-white border border-slate-200/60 shadow-sm overflow-hidden transition-all duration-300">
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-xs text-slate-500">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className={`flex-1 relative ${heightClass} pb-4`}>
        {/* State: SKELETON / LOADING */}
        {isPending && (
          <div className="absolute inset-0 px-6 pb-6 flex items-end space-x-2 animate-pulse">
            <Skeleton className="h-[40%] w-full rounded-t-sm bg-slate-100/80" />
            <Skeleton className="h-[70%] w-full rounded-t-sm bg-slate-100/80" />
            <Skeleton className="h-[55%] w-full rounded-t-sm bg-slate-100/80" />
            <Skeleton className="h-[90%] w-full rounded-t-sm bg-slate-100/80" />
            <Skeleton className="h-[30%] w-full rounded-t-sm bg-slate-100/80" />
          </div>
        )}

        {/* State: ERROR */}
        {isError && (
          <div className="absolute inset-0 px-6 pb-6 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50 rounded-md m-4 border border-dashed border-slate-200">
            <div className="p-3 bg-red-50 text-red-500 rounded-full">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">Data Fetch Failed</p>
              <p className="text-xs text-slate-500 max-w-[200px] truncate">
                {job.error || "An unknown error occurred"}
              </p>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
              >
                <RefreshCcw className="w-3 h-3" />
                Retry Query
              </button>
            )}
          </div>
        )}

        {/* State: READY (Inject Data into Chart Render Prop) */}
        {isReady && job.result && (
          <div className="w-full h-full animate-in fade-in duration-700 fill-mode-forwards">
            {children(job.result)}
          </div>
        )}

        {/* State: EMPTY (Ready, but no data returned) */}
        {isReady && (!job.result || job.result.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            No data available for this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
};