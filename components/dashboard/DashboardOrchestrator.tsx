"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, FileText, Loader2, Sparkles,
  Zap, TrendingUp, TrendingDown, AlertCircle, Activity,
  Table2, BarChart3, ChevronDown, ChevronRight, CheckCircle2,
  TerminalSquare, ListTree, ThumbsUp, ThumbsDown,
} from "lucide-react";

import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ============================================================================
// 1. STRICT TYPE DEFINITIONS (Mapped to Python Backend Models)
// ============================================================================

interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
  initialDatasetIds?: string[];
}

interface QueryStep {
  step_number: number;
  operation: string;
  description: string;
  columns_involved: string[];
}

interface QueryPlan {
  intent: string;
  is_achievable: boolean;
  missing_data_reason?: string;
  steps: QueryStep[];
}

export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
}

interface TrendInsight {
  column: string;
  direction: "increasing" | "decreasing" | "flat";
  slope: number;
  percentage_change: number;
}

interface CorrelationInsight {
  metric_a: string;
  metric_b: string;
  pearson_coefficient: number;
}

interface InsightPayload {
  row_count: number;
  intent_analyzed: string;
  trends: TrendInsight[];
  anomalies: AnomalyInsight[];
  correlations: CorrelationInsight[];
}

interface StructuredNarrative {
  executive_summary: string;
  key_insights: string[];
  recommended_action?: string;
}

/** Must stay in sync with DynamicChartFactory's ExecutionPayload.type union. */
type PayloadType = "table" | "chart" | "text" | "error" | "ml_result";

interface ExecutionPayload {
  type: PayloadType;
  data: any[];
  sql_used?: string;
  chart_spec?: any;
  row_count: number;
  execution_time_ms: number;
}

interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  reasoning?: string;
  files?: File[];

  // Streaming & Pipeline State
  statusSteps: string[];
  isComplete: boolean;
  isError: boolean;

  // Advanced Analytical Payloads
  plan?: QueryPlan;
  payload?: ExecutionPayload;
  insights?: InsightPayload;
  narrative?: StructuredNarrative;

  // FIX #3: sqlUsed was used in the SSE handler but missing from the type
  sqlUsed?: string;

  // Meta / Background Task State
  jobId?: string;
  isCached?: boolean;
  executionTimeMs?: number;
  timestamp: Date;
}

// ============================================================================
// 2. UX SUB-COMPONENTS: PROGRESSIVE DISCLOSURE & DATA RENDERERS
// ============================================================================

const StatusStepper = ({
  steps,
  isComplete,
  isError,
}: {
  steps: string[];
  isComplete: boolean;
  isError: boolean;
}) => {
  if (steps.length === 0 || isComplete) return null;
  const currentStep = steps[steps.length - 1];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-full shadow-sm w-fit mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {isError ? (
        <AlertCircle className="w-4 h-4 text-rose-500" />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
      )}
      <span className="text-sm font-semibold text-slate-600">
        {isError ? "Processing halted." : currentStep}
      </span>
      {!isError && (
        <span className="flex gap-1 ml-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      )}
    </div>
  );
};

const PlanViewer = ({ plan }: { plan: QueryPlan }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!plan.is_achievable) {
    return (
      <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex gap-3 items-start animate-in fade-in">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
        <div>
          <strong className="block mb-1 text-rose-900 font-bold">
            Execution Blocked
          </strong>
          {plan.missing_data_reason ||
            "The requested metrics cannot be calculated with the provided datasets."}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors uppercase tracking-wider"
      >
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-blue-500" />
          <span>Execution Plan: {plan.intent}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-200 space-y-4 bg-white">
          {plan.steps.map((step) => (
            <div key={step.step_number} className="flex gap-3 text-sm">
              <div className="shrink-0 w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[11px] text-blue-700 font-bold border border-blue-100">
                {step.step_number}
              </div>
              <div className="pt-0.5">
                <span className="font-mono text-[10px] text-blue-600 font-bold uppercase mr-2 tracking-wider px-2 py-0.5 bg-blue-50 rounded border border-blue-100">
                  {step.operation}
                </span>
                <span className="text-slate-700 font-medium">
                  {step.description}
                </span>
                <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Columns: {step.columns_involved.join(", ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SQLDisclosure = ({ sql }: { sql: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wider group"
      >
        <TerminalSquare className="w-3.5 h-3.5 group-hover:text-blue-500 transition-colors" />
        {isOpen ? "Hide Math Logic" : "View Math Logic"}
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 bg-slate-900 rounded-xl p-4 overflow-x-auto text-left shadow-inner border border-slate-800 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Dialect: DuckDB
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(sql)}
              className="text-[10px] text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <FileText className="w-3 h-3" /> Copy
            </button>
          </div>
          <pre className="text-[13px] font-mono text-blue-300 leading-relaxed">
            <code>{sql}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

const MathematicalInsights = ({
  insights,
}: {
  insights: InsightPayload;
}) => {
  if (
    !insights.trends?.length &&
    !insights.anomalies?.length &&
    !insights.correlations?.length
  )
    return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
      {insights.anomalies?.map((a, i) => (
        <div
          key={`anomaly-${i}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 shadow-sm font-medium"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          <span>
            <strong>{a.is_positive ? "Spike" : "Drop"}</strong> in {a.column}{" "}
            ({a.z_score.toFixed(1)}σ)
          </span>
        </div>
      ))}

      {insights.trends?.map((t, i) => (
        <div
          key={`trend-${i}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 shadow-sm font-medium"
        >
          {t.direction === "increasing" ? (
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
          )}
          <span>
            <strong>{t.column}</strong> is {t.direction} (
            {t.percentage_change > 0 ? "+" : ""}
            {t.percentage_change.toFixed(1)}%)
          </span>
        </div>
      ))}

      {insights.correlations?.map((c, i) => (
        <div
          key={`corr-${i}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 shadow-sm font-medium"
        >
          <Activity className="w-3.5 h-3.5 text-emerald-500" />
          <span>
            <strong>{c.metric_a}</strong> & <strong>{c.metric_b}</strong>{" "}
            correlated
          </span>
        </div>
      ))}
    </div>
  );
};

const StructuredNarrativeBlock = ({
  narrative,
}: {
  narrative: StructuredNarrative;
}) => {
  return (
    <div className="w-full mt-5 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 p-6 shadow-sm animate-in fade-in duration-700">
      <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2 tracking-tight">
        <Sparkles className="h-4 w-4 text-blue-600" />
        Executive Summary
      </h4>
      <p className="text-slate-700 text-[15px] leading-relaxed mb-5">
        {narrative.executive_summary}
      </p>

      {narrative.key_insights && narrative.key_insights.length > 0 && (
        <div className="mb-5">
          <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Key Drivers
          </h5>
          <ul className="space-y-2.5">
            {narrative.key_insights.map((insight, idx) => (
              <li
                key={idx}
                className="flex gap-3 text-[14px] text-slate-600 items-start leading-relaxed"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span
                  dangerouslySetInnerHTML={{
                    __html: insight.replace(
                      /\*\*(.*?)\*\*/g,
                      '<strong class="text-slate-900 font-bold">$1</strong>'
                    ),
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.recommended_action && (
        <div className="mt-5 pt-4 border-t border-blue-100">
          <h5 className="text-[11px] font-bold text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Recommended Action
          </h5>
          <p className="text-[14px] text-blue-900 font-medium leading-relaxed">
            {narrative.recommended_action}
          </p>
        </div>
      )}
    </div>
  );
};

const PaginatedTable = ({ data }: { data: any[] }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 8;
  const totalPages = Math.ceil((data?.length || 0) / rowsPerPage);

  if (!data || data.length === 0)
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No data available.
      </div>
    );

  const columns = Object.keys(data[0]);
  const currentData = data.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mt-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 font-bold text-xs uppercase tracking-wider whitespace-nowrap"
                >
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentData.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((col) => (
                  <td
                    key={`${i}-${col}`}
                    className="px-4 py-2.5 whitespace-nowrap text-slate-700 font-medium text-[13px]"
                  >
                    {typeof row[col] === "number"
                      ? row[col] % 1 !== 0
                        ? row[col].toFixed(2)
                        : row[col]
                      : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Rows {page * rowsPerPage + 1}-
            {Math.min((page + 1) * rowsPerPage, data.length)} of {data.length}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// FIX #4: ViewModeToggle moved to module level — was previously defined inside
// DashboardOrchestrator, causing it to be recreated on every parent render.
const ViewModeToggle = ({
  viewMode,
  setViewMode,
}: {
  viewMode: "chart" | "table";
  setViewMode: (v: "chart" | "table") => void;
}) => (
  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 w-fit mb-4">
    <button
      onClick={() => setViewMode("chart")}
      className={cn(
        "p-1.5 rounded-md text-xs transition-all flex items-center gap-1.5",
        viewMode === "chart"
          ? "bg-white text-blue-700 shadow-sm font-semibold"
          : "text-slate-500 hover:text-slate-700"
      )}
    >
      <BarChart3 className="w-3.5 h-3.5" /> Chart
    </button>
    <button
      onClick={() => setViewMode("table")}
      className={cn(
        "p-1.5 rounded-md text-xs transition-all flex items-center gap-1.5",
        viewMode === "table"
          ? "bg-white text-blue-700 shadow-sm font-semibold"
          : "text-slate-500 hover:text-slate-700"
      )}
    >
      <Table2 className="w-3.5 h-3.5" /> Table
    </button>
  </div>
);

// FIX #1: MessageBubble extracted as a proper named component at module level.
// Previously "RenderMessageContent" was an anonymous component created inside
// .map(), which caused React to remount it on every render (destroying viewMode
// state) and violated the Rules of Hooks.
interface MessageBubbleProps {
  msg: RichMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ msg }) => {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  // Resolved SQL: prefer payload.sql_used, fall back to the interim sqlUsed field
  // populated by the "sql" SSE packet that arrives before the full payload.
  const resolvedSql = msg.payload?.sql_used ?? msg.sqlUsed;

  return (
    <div
      className={cn(
        "flex flex-col w-full min-w-0 max-w-[90%]",
        msg.role === "user" ? "items-end" : "items-start"
      )}
    >
      {/* USER MESSAGE */}
      {msg.role === "user" && msg.content && (
        <div className="px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm bg-slate-900 text-white rounded-tr-none border border-slate-800">
          {msg.content}
        </div>
      )}

      {/* USER FILES */}
      {msg.role === "user" && msg.files && msg.files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 justify-end">
          {msg.files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 shadow-sm"
            >
              <FileText size={14} className="text-blue-500" />
              <span className="truncate max-w-[150px] font-semibold">
                {f.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ASSISTANT RESPONSE */}
      {msg.role === "assistant" && (
        <div className="w-full">
          {/* Cache Indicator */}
          {msg.isCached && (
            <div className="mb-3 flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-bold tracking-widest uppercase w-fit shadow-sm">
              <Zap className="w-3 h-3 text-amber-500" /> Serverless Cache Hit (
              {msg.executionTimeMs}ms)
            </div>
          )}

          {/* Status & Plan Viewer */}
          <StatusStepper
            steps={msg.statusSteps}
            isComplete={msg.isComplete}
            isError={msg.isError}
          />
          {msg.plan && <PlanViewer plan={msg.plan} />}

          {/* Job Polling UI */}
          {msg.jobId && !msg.payload && !msg.isError && (
            <div className="mt-4 flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900">
                  Background Compute Worker Active
                </span>
                <span className="text-[11px] text-slate-500 font-mono mt-1 uppercase tracking-wider">
                  Job ID: {msg.jobId.split("-")[0]}
                </span>
              </div>
            </div>
          )}

          {/* Main Narrative / Content Blocks */}
          <div className="w-full space-y-4">
            {msg.content && !msg.narrative && !msg.isError && (
              <div className="bg-white px-6 py-5 rounded-3xl rounded-tl-sm border border-slate-200 shadow-sm w-full mt-3">
                {/* className moved to wrapper: ReactMarkdown v8 removed the prop */}
                <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Error Bubble */}
            {msg.isError && msg.content && (
              <div className="mt-3 bg-rose-50 text-rose-700 border border-rose-200 px-5 py-4 rounded-2xl rounded-tl-sm text-sm font-medium flex items-start gap-3 shadow-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                {msg.content}
              </div>
            )}

            {msg.insights && <MathematicalInsights insights={msg.insights} />}
            {msg.narrative && (
              <StructuredNarrativeBlock narrative={msg.narrative} />
            )}

            {/* Data Rendering (Chart / Table) */}
            {msg.payload && (
              <div className="mt-6 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
                {viewMode === "chart" ? (
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[300px]">
                    <DynamicChartFactory
                      payload={msg.payload}
                      anomalies={msg.insights?.anomalies}
                    />
                  </div>
                ) : (
                  <PaginatedTable data={msg.payload.data} />
                )}
              </div>
            )}

            {/* SQL Code Disclosure — shows resolved SQL from either source */}
            {resolvedSql && msg.isComplete && (
              <SQLDisclosure sql={resolvedSql} />
            )}

            {/* Feedback Actions */}
            {msg.isComplete && !msg.isError && (
              <div className="flex items-center gap-2 pt-2 pl-2">
                <button className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors">
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. MAIN ORCHESTRATOR COMPONENT
// ============================================================================

export const DashboardOrchestrator: React.FC<DashboardOrchestratorProps> = ({
  token,
  tenantId, // retained for future use (e.g. multi-tenant API headers)
  initialDatasetIds = [],
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [activeDatasetIds, setActiveDatasetIds] =
    useState<string[]>(initialDatasetIds);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll handler
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, progressStatus]);

  // Async Job Polling
  useEffect(() => {
    const activeJobs = messages.filter(
      (m) => m.role === "assistant" && m.jobId && !m.payload && !m.isError
    );
    if (activeJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const jobMsg of activeJobs) {
        try {
          const res = await fetch(`/api/query/job/${jobMsg.jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.status === 200) {
            const data = await res.json();
            if (data.status === "success") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jobMsg.id
                    ? {
                        ...m,
                        payload: data.payload as ExecutionPayload,
                        insights: data.insights,
                        narrative: data.narrative,
                        jobId: undefined,
                        isComplete: true,
                        statusSteps: [
                          ...m.statusSteps,
                          "Background job complete.",
                        ],
                      }
                    : m
                )
              );
            } else if (data.status === "failed") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jobMsg.id
                    ? {
                        ...m,
                        isError: true,
                        isComplete: true,
                        content: data.error || "Background task failed.",
                        jobId: undefined,
                      }
                    : m
                )
              );
            }
          }
        } catch (e) {
          console.error(`Polling failed for job ${jobMsg.jobId}`, e);
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [messages, token]);

  const historyContext = useMemo(
    () =>
      messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content || m.reasoning || "" })),
    [messages]
  );

  // Direct to R2 Pre-signed Upload Handler
  const uploadDirectToR2 = async (file: File): Promise<string> => {
    try {
      const initRes = await fetch("/api/ingestion/presigned-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file_name: file.name, content_type: file.type }),
      });

      if (!initRes.ok) throw new Error("Upload initialization failed.");
      const { url, fields, object_key, dataset_id } = await initRes.json();

      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) =>
        formData.append(key, value as string)
      );
      formData.append("file", file);

      const uploadRes = await fetch(url, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error(`Storage rejection for ${file.name}`);

      setProgressStatus(`Indexing ${file.name} for Zero-ETL...`);

      const workerRes = await fetch("/api/ingestion/process-parquet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataset_id, object_key }),
      });

      if (!workerRes.ok) throw new Error("Processing failed.");
      return dataset_id;
    } catch (e: any) {
      toast({ title: "Upload Failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleSendMessage = async (text: string, files: File[]) => {
    if ((!text.trim() && files.length === 0) || isProcessing) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // Optimistic UI Update
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: text,
        files,
        statusSteps: [],
        isComplete: true,
        isError: false,
        timestamp: new Date(),
      },
    ]);

    setIsProcessing(true);
    setProgressStatus("Preparing workspace...");

    try {
      // 1. Handle File Uploads first if present
      let newlyUploadedIds: string[] = [];
      if (files.length > 0) {
        setProgressStatus("Mounting dataset to compute engine...");
        newlyUploadedIds = await Promise.all(
          files.map((f) => uploadDirectToR2(f))
        );
        setActiveDatasetIds((prev) => [
          ...new Set([...prev, ...newlyUploadedIds]),
        ]);
      }

      const currentActiveIds = [
        ...new Set([...activeDatasetIds, ...newlyUploadedIds]),
      ];

      // 2. Placeholder for AI Response
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          statusSteps: [],
          isComplete: false,
          isError: false,
          timestamp: new Date(),
        },
      ]);

      // 3. Initiate SSE Streaming Request
      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: text,
          active_dataset_ids: currentActiveIds,
          history: historyContext,
        }),
      });

      if (!response.ok || !response.body)
        throw new Error("Compute Engine disconnected.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";
      let accumulatedNarrative = "";

      // 4. SSE Parsing Loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n\n");
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const payloadStr = line.replace(/^data: /, "").trim();
          if (!payloadStr) continue;

          try {
            const packet = JSON.parse(payloadStr);

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;

                switch (packet.type) {
                  case "status":
                    setProgressStatus(packet.content);
                    return { ...m, statusSteps: [...m.statusSteps, packet.content] };
                  case "plan":
                    return { ...m, plan: packet.content as QueryPlan };
                  case "sql":
                    // FIX #3: sqlUsed is now typed on RichMessage so this is valid.
                    // The field is used as a fallback when payload.sql_used is absent.
                    return { ...m, sqlUsed: packet.content as string };
                  case "data":
                    return { ...m, payload: packet.content as unknown as ExecutionPayload };
                  case "insights":
                    return { ...m, insights: packet.content as InsightPayload };
                  case "narrative":
                    return { ...m, narrative: packet.content as StructuredNarrative };
                  case "narrative_chunk":
                    accumulatedNarrative += packet.content;
                    return { ...m, content: accumulatedNarrative };
                  case "cache_hit":
                    return {
                      ...m,
                      isCached: true,
                      executionTimeMs: packet.execution_time_ms,
                      plan: packet.content.plan as QueryPlan,
                      payload: packet.content.payload as unknown as ExecutionPayload,
                      insights: packet.content.insights as InsightPayload,
                      narrative: packet.content.narrative as StructuredNarrative,
                      isComplete: true,
                    };
                  case "job_queued":
                    return {
                      ...m,
                      jobId: packet.content.job_id,
                      content:
                        "This is a highly complex query. I've spun up a background worker to calculate it. Hang tight...",
                    };
                  case "error":
                    return {
                      ...m,
                      isError: true,
                      content: packet.content,
                      isComplete: true,
                    };
                  case "done":
                    return { ...m, isComplete: true };
                  default:
                    return m;
                }
              })
            );
          } catch {
            // Silently ignore split JSON fragment parsing errors
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Engine Error", description: error.message, variant: "destructive" });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isError: true,
                isComplete: true,
                content: `Error: ${error.message}`,
              }
            : m
        )
      );
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans">
      {/* --- HEADER --- */}
      <header className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-600 rounded-lg shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900">
            DataOmen{" "}
            <span className="text-slate-400 font-medium ml-1 border-l border-slate-200 pl-2">
              Copilot
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              activeDatasetIds.length > 0
                ? "bg-emerald-500 animate-pulse"
                : "bg-slate-300"
            )}
          />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            {activeDatasetIds.length} Sources Active
          </span>
        </div>
      </header>

      {/* --- SCROLLABLE CHAT FEED --- */}
      <ScrollArea className="flex-1 px-4 py-8 md:px-12 lg:px-24">
        <div className="max-w-4xl mx-auto space-y-10 pb-40">
          {/* Welcome State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in-95 duration-700 text-center space-y-6">
              <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50">
                <Bot className="w-12 h-12 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Enterprise Analytics Engine
                </h2>
                <p className="text-[15px] text-slate-500 max-w-md leading-relaxed">
                  Upload files or connect your database. I'll translate your
                  plain English questions into optimized SQL and generate
                  insights instantly.
                </p>
              </div>
            </div>
          )}

          {/* Message Rendering Loop */}
          {messages.map((msg) => (
            // FIX #1: Using the extracted MessageBubble component instead of an
            // anonymous component defined inline. This ensures React can properly
            // reconcile the component tree and viewMode state is preserved across
            // parent re-renders.
            // FIX #5 (layout): Avatar is now conditionally rendered only for
            // assistant messages, eliminating the hidden-div layout jitter.
            <div
              key={msg.id}
              className={cn(
                "flex w-full group",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm mr-4 bg-white border-slate-200 text-blue-600">
                  <Sparkles size={14} className="text-blue-600" />
                </div>
              )}
              <MessageBubble msg={msg} />
            </div>
          ))}

          <div ref={scrollRef} className="h-10" />
        </div>
      </ScrollArea>

      {/* --- OMNI INPUT LAYER --- */}
      <div className="shrink-0 bg-white border-t border-slate-200 p-4 sm:p-6 z-30">
        <div className="max-w-4xl mx-auto relative">
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
          />
        </div>
      </div>
    </div>
  );
};