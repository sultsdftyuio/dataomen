// components/chat/DashboardCard.tsx
"use client";

/**
 * Phase 3.2 — The UI Handoff Component
 *
 * When the orchestrator streams a `data` event containing a
 * `dashboard_workspace_id`, the MessageBubble intercepts the render loop
 * and injects this card underneath the narrative text.
 *
 * The card shows a preview of the analysis and provides a one-click
 * navigation to the full spatial dashboard via Next.js router push.
 */

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ExternalLink,
  Table2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface DashboardCardProps {
  /** The workspace UUID persisted in Redis/Postgres by the orchestrator. */
  workspaceId: string;
  /** Short executive summary from the narrative service. */
  summary?: string;
  /** Whether the workspace contains a VegaLite chart or a raw data table. */
  vizType?: "chart" | "table";
  /** Number of rows in the data snapshot. */
  rowCount?: number;
  /** The SQL query used to generate the results. */
  sqlPreview?: string;
}

export function DashboardCard({
  workspaceId,
  summary,
  vizType = "table",
  rowCount,
  sqlPreview,
}: DashboardCardProps) {
  const router = useRouter();

  const handleOpenDashboard = useCallback(() => {
    router.push(`/dashboard?workspace=${encodeURIComponent(workspaceId)}`);
  }, [router, workspaceId]);

  const Icon = vizType === "chart" ? BarChart3 : Table2;
  const typeLabel = vizType === "chart" ? "Interactive Chart" : "Data Table";

  return (
    <div className="group my-4 overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 via-slate-50/70 to-blue-50/40 shadow-[0_16px_38px_-26px_rgba(15,23,42,0.45),inset_0_0_0_1px_rgba(148,163,184,0.22)] transition-all duration-300 hover:shadow-[0_20px_46px_-26px_rgba(15,23,42,0.55),inset_0_0_0_1px_rgba(99,102,241,0.3)]">
      {/* ── Header Strip ── */}
      <div className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_rgba(148,163,184,0.2)]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-600/80">
              {typeLabel}
            </span>
            {rowCount != null && rowCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-medium text-slate-500">
                  {rowCount.toLocaleString()} rows
                </span>
              </>
            )}
          </div>
        </div>
        <Sparkles className="h-3.5 w-3.5 text-blue-400/60" />
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3">
        {summary && (
          <p className="mb-3 line-clamp-2 text-[14px] leading-relaxed text-slate-600">
            {summary}
          </p>
        )}

        {sqlPreview && (
          <div className="mb-3 overflow-hidden rounded-lg bg-slate-950/90 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]">
            <code className="block truncate font-mono text-[11px] leading-5 text-slate-300">
              {sqlPreview.length > 120
                ? `${sqlPreview.slice(0, 120)}…`
                : sqlPreview}
            </code>
          </div>
        )}

        {/* ── CTA Button ── */}
        <button
          type="button"
          onClick={handleOpenDashboard}
          className="group/btn flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(79,70,229,0.6)] transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-[0_12px_28px_-12px_rgba(79,70,229,0.7)] active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Spatial Dashboard
          </span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
