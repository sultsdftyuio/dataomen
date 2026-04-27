"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";

import { AnalyticalGrid } from "@/components/dashboard/AnalyticalGrid";
import { ChartJob, ChartOrchestrator } from "@/lib/intelligence/chart-orchestrator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WorkspaceWidgetConfig {
  id: string;
  query: string;
  group: string;
  priority: number;
  title?: string;
  description?: string;
  data?: Array<Record<string, unknown>>;
  chartSpec?: Record<string, unknown>;
  vegaLiteSpec?: Record<string, unknown>;
}

interface WorkspaceLayoutResponse {
  workspaceId: string | null;
  narrative?: string;
  widgets?: WorkspaceWidgetConfig[];
  error?: string;
}

type GridJobInput = Omit<ChartJob, "status" | "result" | "error" | "retryCount">;

function DashboardOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspace");

  const [widgets, setWidgets] = useState<WorkspaceWidgetConfig[]>([]);
  const [narrative, setNarrative] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [workspaceMissing, setWorkspaceMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const orchestrator = useMemo(
    () =>
      new ChartOrchestrator(
        async (_query, params) => {
          const rows = params?.data;
          return Array.isArray(rows) ? rows : [];
        },
        {
          maxConcurrency: 4,
          maxRetries: 0,
        }
      ),
    []
  );

  const jobs: GridJobInput[] = useMemo(
    () =>
      widgets.map((widget, index) => ({
        id: widget.id || `workspace_job_${index + 1}`,
        query: widget.query || "SELECT 1 AS value",
        group: widget.group || "analysis",
        priority:
          typeof widget.priority === "number" && Number.isFinite(widget.priority)
            ? Math.max(1, Math.floor(widget.priority))
            : Math.max(10, 100 - index * 5),
        params: {
          data: Array.isArray(widget.data) ? widget.data : [],
          chartSpec: widget.chartSpec,
          vegaLiteSpec: widget.vegaLiteSpec,
          title: widget.title,
          description: widget.description,
        },
      })),
    [widgets]
  );

  useEffect(() => {
    orchestrator.flush();
  }, [orchestrator, workspaceId, refreshKey]);

  useEffect(() => {
    return () => {
      orchestrator.flush();
    };
  }, [orchestrator]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateWorkspace = async () => {
      setIsLoading(true);
      setError(null);
      setWorkspaceMissing(false);

      try {
        const endpoint = workspaceId
          ? `/api/chat/orchestrate/workspace/${encodeURIComponent(workspaceId)}`
          : "/api/chat/orchestrate/workspace/default";

        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.status === 404) {
          if (!isCancelled) {
            setWidgets([]);
            setNarrative("");
            setWorkspaceMissing(true);
          }
          return;
        }

        if (!response.ok) {
          const failureText = await response.text().catch(() => "Unable to load dashboard workspace.");
          throw new Error(failureText || "Unable to load dashboard workspace.");
        }

        const payload = (await response.json()) as WorkspaceLayoutResponse;

        if (isCancelled) {
          return;
        }

        setWidgets(Array.isArray(payload.widgets) ? payload.widgets : []);
        setNarrative(typeof payload.narrative === "string" ? payload.narrative : "");
      } catch (requestError: any) {
        if (isCancelled) {
          return;
        }

        setWidgets([]);
        setNarrative("");
        setError(requestError?.message || "Unable to hydrate workspace.");
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [workspaceId, refreshKey]);

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_10%_0%,rgba(14,116,144,0.08),transparent_40%),radial-gradient(circle_at_95%_10%,rgba(15,23,42,0.08),transparent_38%)] px-4 pb-8 pt-5 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Spatial Grid</p>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Deterministic Dashboard Mount</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">
              {workspaceId ? `workspace=${workspaceId}` : "workspace=default"}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRefreshKey((value) => value + 1)}
              className="h-9 w-9 rounded-lg border-slate-300 bg-white"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading && (
          <Card className="border border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="flex items-center gap-3 py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              <p className="text-sm font-medium text-slate-600">Hydrating analytical workspace...</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && workspaceMissing && (
          <Card className="border border-amber-200 bg-amber-50/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-extrabold tracking-tight text-amber-900">Workspace not found</CardTitle>
              <CardDescription className="text-sm font-medium text-amber-800/80">
                This workspace id is invalid or expired. Load the default executive layout instead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  router.push("/dashboard");
                }}
                className="rounded-lg bg-amber-700 text-white hover:bg-amber-800"
              >
                Load Default Layout
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !workspaceMissing && error && (
          <Card className="border border-rose-200 bg-rose-50/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-900">
                <AlertCircle className="h-4 w-4" />
                Dashboard hydration failed
              </CardTitle>
              <CardDescription className="text-rose-800/90">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setRefreshKey((value) => value + 1)}
                className="rounded-lg bg-rose-700 text-white hover:bg-rose-800"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !workspaceMissing && !error && narrative && (
          <Card className="border border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">
                Workspace Narrative
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed text-slate-700">{narrative}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !workspaceMissing && !error && jobs.length === 0 && (
          <Card className="border border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="py-10 text-sm font-medium text-slate-600">
              No widgets are available for this workspace.
            </CardContent>
          </Card>
        )}

        {!isLoading && !workspaceMissing && !error && jobs.length > 0 && (
          <div className="min-h-[420px] rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur">
            <AnalyticalGrid orchestrator={orchestrator} jobs={jobs} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full flex-1 items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <DashboardOverviewContent />
    </Suspense>
  );
}