"use client";

/**
 * Phase 3.2 — Dashboard Hydration with Workspace Bridge
 *
 * Wraps the dashboard in a React <Suspense> boundary.  When a
 * `?workspace=UUID` URL parameter is present, it fetches the heavy
 * visualization JSON payload asynchronously from the workspace persistence
 * layer and mounts the <AnalyticalGrid /> with the hydrated data.
 *
 * Without a workspace parameter, falls back to the default executive
 * dashboard experience.
 */

import React, { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { StrategicQuery } from "@/components/landing/seo-blocks-3";
import { Loader2, AlertTriangle, BarChart3, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScenarioInput = {
  title?: string;
  description?: string;
  dialect?: string;
  language?: string;
  sql?: string;
  code?: string;
  sqlSnippet?: string;
  businessOutcome?: string;
  outcome?: string;
};

interface AnalyticsDashboardProps {
  scenario?: ScenarioInput;
  scenarios?: ScenarioInput[];
  data?: {
    scenario?: ScenarioInput;
    scenarios?: ScenarioInput[];
  };
  title?: string;
  description?: string;
  sql?: string;
  code?: string;
  businessOutcome?: string;
}

/** The shape returned by the workspace fetch API. */
interface WorkspacePayload {
  workspace_id: string;
  tenant_id: string;
  prompt: string;
  summary: string;
  chart_spec?: Record<string, unknown>;
  sql_query?: string;
  insight_payload?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  data_snapshot?: Array<Record<string, unknown>>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalizeScenario(source?: ScenarioInput | null) {
  if (!source || typeof source !== "object") return null;

  const title = source.title || "Analytical Scenario";
  const description = source.description || "Generated analytical query path.";
  const dialect = source.dialect || source.language || "SQL";
  const sql = source.sql || source.code || source.sqlSnippet || "-- Query unavailable";
  const businessOutcome = source.businessOutcome || source.outcome || description;

  return { title, description, dialect, sql, businessOutcome };
}

// ---------------------------------------------------------------------------
// Workspace Fetcher
// ---------------------------------------------------------------------------

async function fetchWorkspace(workspaceId: string): Promise<WorkspacePayload> {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error(`Workspace fetch failed: HTTP ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-slate-500">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45),inset_0_0_0_1px_rgba(148,163,184,0.22)]">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700">Hydrating workspace…</p>
        <p className="mt-1 text-xs text-slate-400">Loading visualization data from storage</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function DashboardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-slate-500">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.3)]">
        <AlertTriangle className="h-6 w-6 text-rose-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700">Failed to load workspace</p>
        <p className="mt-1 max-w-sm text-xs text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] transition-colors hover:bg-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hydrated Workspace View
// ---------------------------------------------------------------------------

function HydratedWorkspaceView({ workspace }: { workspace: WorkspacePayload }) {
  const data = workspace.data_snapshot || [];
  const chartSpec = workspace.chart_spec;
  const narrative = workspace.narrative;

  const executiveSummary =
    (narrative as Record<string, unknown>)?.executive_summary ??
    (narrative as Record<string, unknown>)?.summary ??
    workspace.summary ??
    "";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]">
          <BarChart3 className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Analytical Workspace
          </h1>
          {executiveSummary && (
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {String(executiveSummary)}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-400">
            <span>{data.length.toLocaleString()} rows</span>
            <span className="text-slate-300">•</span>
            <span>{chartSpec ? "Chart + Table" : "Table"}</span>
            <span className="text-slate-300">•</span>
            <span>{new Date(workspace.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* SQL Preview */}
      {workspace.sql_query && (
        <div className="overflow-hidden rounded-xl bg-slate-950/95 shadow-[0_18px_46px_-34px_rgba(15,23,42,0.8),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
          <div className="flex items-center justify-between bg-slate-900/80 px-3 py-1.5 shadow-[inset_0_-1px_0_rgba(148,163,184,0.25)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              SQL
            </span>
          </div>
          <pre className="m-0 overflow-x-auto px-4 py-3 text-[13px] leading-6 text-slate-100">
            <code>{workspace.sql_query}</code>
          </pre>
        </div>
      )}

      {/* Data Table */}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white/62 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500 shadow-[inset_0_-1px_0_rgba(148,163,184,0.24)]">
              <tr>
                {Object.keys(data[0]).map((key) => (
                  <th
                    key={key}
                    className="whitespace-nowrap px-4 py-2 font-semibold"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 50).map((row, idx) => (
                <tr
                  key={idx}
                  className="transition-colors hover:bg-slate-50/60 shadow-[inset_0_-1px_0_rgba(148,163,184,0.18)]"
                >
                  {Object.values(row).map((val: unknown, i) => (
                    <td key={i} className="whitespace-nowrap px-4 py-2">
                      {val === null ? (
                        <span className="italic text-slate-300">null</span>
                      ) : typeof val === "object" ? (
                        JSON.stringify(val)
                      ) : (
                        String(val)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.length > 50 && (
            <div className="w-full bg-slate-50/60 p-3 text-center text-xs font-medium text-slate-500 shadow-[inset_0_1px_0_rgba(148,163,184,0.2)]">
              Showing top 50 of {data.length.toLocaleString()} rows.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component that reads searchParams (must be inside Suspense)
// ---------------------------------------------------------------------------

function AnalyticsDashboardInner(props: AnalyticsDashboardProps) {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspace");

  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkspace(id);
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadWorkspace(workspaceId);
    }
  }, [workspaceId, loadWorkspace]);

  // ── Workspace-hydrated view ──
  if (workspaceId) {
    if (loading) return <DashboardSkeleton />;
    if (error) return <DashboardError message={error} onRetry={() => loadWorkspace(workspaceId)} />;
    if (workspace) return <HydratedWorkspaceView workspace={workspace} />;
    return <DashboardSkeleton />;
  }

  // ── Default scenario-based view (unchanged) ──
  const candidates: Array<ScenarioInput | undefined> = [
    props.scenario,
    Array.isArray(props.scenarios) ? props.scenarios[0] : undefined,
    props.data?.scenario,
    Array.isArray(props.data?.scenarios) ? props.data?.scenarios[0] : undefined,
    {
      title: props.title,
      description: props.description,
      sql: props.sql || props.code,
      businessOutcome: props.businessOutcome,
    },
  ];

  const resolved = candidates.map((candidate) => normalizeScenario(candidate)).find(Boolean);
  if (!resolved) return null;

  return <StrategicQuery scenario={resolved} />;
}

// ---------------------------------------------------------------------------
// Exported Component (wrapped in Suspense boundary)
// ---------------------------------------------------------------------------

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = (props) => {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AnalyticsDashboardInner {...props} />
    </Suspense>
  );
};

export default AnalyticsDashboard;
