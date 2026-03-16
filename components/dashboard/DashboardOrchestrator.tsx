"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory, ExecutionPayload } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, Bot, FileText, BrainCircuit, Loader2, Sparkles, 
  Zap, TrendingUp, TrendingDown, AlertCircle, Activity, 
  ListTree, Table2, BarChart3, ChevronDown, ChevronRight, CheckCircle2
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Type Definitions (Mapped to strict backend Pydantic models)
// -----------------------------------------------------------------------------
interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
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

interface TrendInsight {
  column: string;
  direction: 'increasing' | 'decreasing' | 'flat';
  slope: number;
  percentage_change: number;
}

export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
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

interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  reasoning?: string;
  files?: File[];
  
  // Advanced Pipeline State
  plan?: QueryPlan;
  payload?: ExecutionPayload; 
  insights?: InsightPayload;
  narrative?: StructuredNarrative;
  
  // Meta State
  jobId?: string;
  isCached?: boolean;
  executionTimeMs?: number;
  timestamp: Date;
}

// -----------------------------------------------------------------------------
// Sub-Components for Clean Architecture
// -----------------------------------------------------------------------------

const PlanViewer = ({ plan }: { plan: QueryPlan }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!plan.is_achievable) {
    return (
      <div className="mt-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex gap-3 items-start">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-1">Unable to execute request</strong>
          {plan.missing_data_reason}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden animate-in fade-in">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-emerald-500" />
          <span>Execution Plan: {plan.intent}</span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      
      {isOpen && (
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/50">
          {plan.steps.map((step) => (
            <div key={step.step_number} className="flex gap-3 text-sm">
              <div className="shrink-0 w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold border border-slate-700">
                {step.step_number}
              </div>
              <div>
                <span className="font-mono text-[11px] text-emerald-400 uppercase mr-2 tracking-wider px-1.5 py-0.5 bg-emerald-500/10 rounded">
                  {step.operation}
                </span>
                <span className="text-slate-300">{step.description}</span>
                <div className="text-[10px] text-slate-500 mt-1">
                  Columns: {step.columns_involved.join(', ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MathematicalInsights = ({ insights }: { insights: InsightPayload }) => {
  if (!insights.trends.length && !insights.anomalies.length && !insights.correlations.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
      {insights.anomalies.map((a, i) => (
        <div key={`anomaly-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300">
          <AlertCircle className="w-3.5 h-3.5" />
          <span><strong>{a.is_positive ? 'Spike' : 'Drop'}</strong> in {a.column} ({a.z_score}σ)</span>
        </div>
      ))}
      
      {insights.trends.map((t, i) => (
        <div key={`trend-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
          {t.direction === 'increasing' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          <span><strong>{t.column}</strong> is {t.direction} ({t.percentage_change > 0 ? '+' : ''}{t.percentage_change}%)</span>
        </div>
      ))}

      {insights.correlations.map((c, i) => (
        <div key={`corr-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
          <Activity className="w-3.5 h-3.5" />
          <span><strong>{c.metric_a}</strong> & <strong>{c.metric_b}</strong> highly correlated</span>
        </div>
      ))}
    </div>
  );
};

const StructuredNarrativeBlock = ({ narrative }: { narrative: StructuredNarrative }) => {
  return (
    <div className="w-full mt-4 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-2xl border border-emerald-500/20 p-5 shadow-sm animate-in fade-in duration-700">
      <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        Executive Summary
      </h4>
      <p className="text-slate-200 text-sm leading-relaxed mb-4">
        {narrative.executive_summary}
      </p>

      {narrative.key_insights && narrative.key_insights.length > 0 && (
        <div className="mb-4">
          <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Key Drivers</h5>
          <ul className="space-y-2">
            {narrative.key_insights.map((insight, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-slate-300 items-start">
                <CheckCircle2 className="w-4 h-4 text-emerald-500/50 shrink-0 mt-0.5" />
                <span dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>') }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.recommended_action && (
        <div className="mt-4 pt-4 border-t border-emerald-500/10">
          <h5 className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Recommended Action</h5>
          <p className="text-sm text-emerald-100/80">{narrative.recommended_action}</p>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// UPDATED DATA RENDERER (Typescript Fixes Applied)
// -----------------------------------------------------------------------------
const DataRenderer = ({ payload, anomalies }: { payload: ExecutionPayload, anomalies?: AnomalyInsight[] }) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // TS FIX: Fallback to an empty array so `.length` and `.slice` never crash on undefined
  const data = payload.data || [];
  const rowCount = data.length;

  if (rowCount === 0) {
    return (
      <div className="w-full mt-4 p-4 border border-slate-800 rounded-xl text-center text-sm text-slate-500 bg-slate-950/50">
        No data available to render.
      </div>
    );
  }

  return (
    <div className="w-full mt-4 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        {/* TS FIX: Use dynamically calculated rowCount instead of payload.row_count */}
        <span className="text-xs font-medium text-slate-400 font-mono">{rowCount} rows analyzed</span>
        <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
          <button 
            onClick={() => setViewMode('chart')}
            className={cn("p-1.5 rounded-md text-xs transition-colors", viewMode === 'chart' ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300")}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={cn("p-1.5 rounded-md text-xs transition-colors", viewMode === 'table' ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300")}
          >
            <Table2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="p-4 bg-white/5">
        {viewMode === 'chart' ? (
          // Pass the mapped anomalies into the factory
          <DynamicChartFactory payload={payload} anomalies={anomalies} />
        ) : (
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 sticky top-0">
                <tr>
                  {Object.keys(data[0]).map(col => (
                    <th key={col} className="px-3 py-2 font-medium text-slate-400 border-b border-slate-800">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.slice(0, 100).map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    {Object.values(row).map((val: any, j: number) => (
                      <td key={j} className="px-3 py-2 whitespace-nowrap">{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rowCount > 100 && (
              <div className="text-center p-3 text-xs text-slate-500 border-t border-slate-800">
                Showing first 100 rows. Export for full dataset.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export const DashboardOrchestrator: React.FC<DashboardOrchestratorProps> = ({ token, tenantId }) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // Phase 6: Async Job Polling
  useEffect(() => {
    const activeJobs = messages.filter(m => m.role === "assistant" && m.jobId && !m.payload);
    if (activeJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const jobMsg of activeJobs) {
        try {
          const res = await fetch(`/api/query/job/${jobMsg.jobId}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.status === 200) {
            const data = await res.json();
            if (data.status === "success") {
              setMessages(prev => prev.map(m => 
                m.id === jobMsg.id ? { 
                  ...m, 
                  payload: data as ExecutionPayload, 
                  insights: data.insights,
                  narrative: data.narrative,
                  jobId: undefined 
                } : m
              ));
            }
          }
        } catch (e) {
          console.error(`Polling failed for job ${jobMsg.jobId}`, e);
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [messages, token]);

  const historyContext = useMemo(() => 
    messages.slice(-6).map(m => ({ role: m.role, content: m.content || m.reasoning })),
    [messages]
  );

  const uploadDirectToR2 = async (file: File): Promise<string> => {
    const initRes = await fetch("/api/ingestion/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ file_name: file.name, content_type: file.type }),
    });
    
    if (!initRes.ok) throw new Error("Upload initialization failed.");
    const { url, fields, object_key, dataset_id } = await initRes.json();

    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
    formData.append("file", file);

    const uploadRes = await fetch(url, { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error(`Storage rejection for ${file.name}`);

    setProgressStatus(`Indexing ${file.name} for Zero-ETL...`);
    const workerRes = await fetch("/api/ingestion/process-parquet", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ dataset_id, object_key }),
    });

    if (!workerRes.ok) throw new Error("Processing failed.");
    return dataset_id;
  };

  const handleSendMessage = async (text: string, files: File[]) => {
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, {
      id: userMsgId, role: "user", content: text, files, timestamp: new Date(),
    }]);

    setIsProcessing(true);

    try {
      let newlyUploadedIds: string[] = [];
      if (files.length > 0) {
        setProgressStatus("Mounting dataset to compute engine...");
        newlyUploadedIds = await Promise.all(files.map(f => uploadDirectToR2(f)));
        setActiveDatasetIds(prev => [...new Set([...prev, ...newlyUploadedIds])]);
      }

      const currentActiveIds = [...new Set([...activeDatasetIds, ...newlyUploadedIds])];

      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          prompt: text,
          active_dataset_ids: currentActiveIds,
          history: historyContext
        }),
      });

      if (!response.ok || !response.body) throw new Error("Compute Engine disconnected.");

      setMessages(prev => [...prev, {
        id: assistantMsgId, role: "assistant", reasoning: "", timestamp: new Date(),
      }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";

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

            setMessages(prev => prev.map(m => {
              if (m.id !== assistantMsgId) return m;

              switch (packet.type) {
                case "status":
                  setProgressStatus(packet.content);
                  return m;
                case "plan":
                  // Phase 2: Query Planner
                  return { ...m, plan: packet.content as QueryPlan };
                case "reasoning":
                  return { ...m, reasoning: (m.reasoning || "") + packet.content };
                case "data":
                  return { ...m, payload: packet.content as ExecutionPayload };
                case "insights":
                  // Phase 3.1: Mathematical Gauntlet
                  return { ...m, insights: packet.content as InsightPayload };
                case "narrative":
                  // Phase 3.2: Executive Storyteller
                  return { ...m, narrative: packet.content as StructuredNarrative };
                case "cache_hit":
                  // Phase 4: Enterprise Caching
                  return { 
                    ...m, 
                    isCached: true,
                    executionTimeMs: packet.execution_time_ms,
                    plan: packet.content.plan,
                    payload: packet.content.payload,
                    insights: packet.content.insights,
                    narrative: packet.content.narrative
                  };
                case "job_queued":
                  return { 
                    ...m, 
                    jobId: packet.job_id, 
                    reasoning: (m.reasoning || "") + "\n\n🚀 Query too complex for sync execution. Offloading to background compute worker..." 
                  };
                case "error":
                  throw new Error(packet.content);
                default:
                  return m;
              }
            }));
          } catch (e: any) {
            // Ignore fragment parsing errors during streaming
            if(e.message && !e.message.includes("Unexpected token")) {
              throw e;
            }
          }
        }
      }

    } catch (error: any) {
      toast({ title: "Engine Error", description: error.message, variant: "destructive" });
      setMessages(prev => prev.map(m => 
        m.id === assistantMsgId ? { ...m, content: `Error: ${error.message}` } : m
      ));
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 overflow-hidden font-sans">
      {/* SaaS Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-950/60 backdrop-blur-xl flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shadow-inner">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-200">
            Dataomen <span className="text-slate-500 font-normal ml-1 border-l border-slate-700 pl-2">Orchestrator v2</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className={cn("w-2 h-2 rounded-full", activeDatasetIds.length > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-600")} />
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">
            {activeDatasetIds.length} Active {activeDatasetIds.length === 1 ? 'Dataset' : 'Datasets'}
          </span>
        </div>
      </header>

      {/* Analytical Stream Area */}
      <ScrollArea className="flex-1 px-4 py-8 md:px-12 lg:px-24 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-10 pb-32">
          {messages.length === 0 && (
            <div className="h-[60vh] flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in duration-700">
              <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-950 rounded-[2rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 opacity-50"></div>
                <Bot className="w-16 h-16 text-slate-700" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-bold text-slate-200 tracking-tight">Enterprise Analytics Engine</p>
                <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                  Upload Parquet/CSVs or connect your warehouse to initiate DuckDB vectorized scans. Ask any business question.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex gap-4 group",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm transition-transform group-hover:scale-105",
                msg.role === "assistant" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-blue-600 border-blue-500"
              )}>
                {msg.role === "assistant" ? <Bot size={16} className="text-emerald-400" /> : <User size={16} className="text-white" />}
              </div>

              <div className={cn(
                "flex flex-col w-full max-w-[90%]",
                msg.role === "user" ? "items-end" : "items-start"
              )}>
                
                {/* 1. User Content & Files */}
                {msg.content && msg.role === 'user' && (
                  <div className="px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-md bg-slate-800 text-white rounded-tr-none border border-slate-700">
                    {msg.content}
                  </div>
                )}
                
                {msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 shadow-sm">
                        <FileText size={14} className="text-blue-400" />
                        <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* --- ASSISTANT RESPONSE PIPELINE --- */}

                {/* Cache Badge Indicator */}
                {msg.isCached && (
                  <div className="mb-2 flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md text-[10px] text-amber-400 font-bold tracking-widest uppercase animate-in slide-in-from-left-2">
                    <Zap className="w-3 h-3" />
                    Served from Cache ({msg.executionTimeMs}ms)
                  </div>
                )}

                {/* Phase 2: Lead Engineer Query Plan */}
                {msg.plan && <PlanViewer plan={msg.plan} />}

                {/* Code generation reasoning (Fallback / legacy) */}
                {msg.reasoning && !msg.plan && (
                  <div className="mt-2 text-[13px] text-slate-500 italic bg-slate-900/30 px-4 py-2 rounded-xl border border-dashed border-slate-800">
                    <ReactMarkdown>{msg.reasoning}</ReactMarkdown>
                  </div>
                )}

                {/* Phase 6: Async Job Polling */}
                {msg.jobId && !msg.payload && (
                  <div className="mt-3 flex items-center gap-4 p-5 bg-slate-900/80 rounded-2xl border border-slate-700 shadow-inner animate-pulse">
                    <div className="p-2 bg-emerald-500/10 rounded-full">
                      <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-200">Executing complex query in background...</span>
                      <span className="text-[11px] text-slate-400 font-mono mt-1">Worker ID: {msg.jobId.split('-')[0]}</span>
                    </div>
                  </div>
                )}

                {/* Phase 3.1: Mathematical Insights Gauntlet */}
                {msg.insights && <MathematicalInsights insights={msg.insights} />}

                {/* Phase 3.2: Executive Narrative Storyteller */}
                {msg.narrative && <StructuredNarrativeBlock narrative={msg.narrative} />}

                {/* Phase 1 & 5: Raw Data / Visual Render */}
                {/* TS FIX: Passing anomalies securely directly into DataRenderer */}
                {msg.payload && <DataRenderer payload={msg.payload} anomalies={msg.insights?.anomalies} />}
                
                {/* Fallback error or text from assistant */}
                {msg.content && msg.role === 'assistant' && !msg.narrative && (
                   <div className="mt-2 px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm bg-slate-900 text-slate-300 border border-slate-800 rounded-tl-none">
                     <ReactMarkdown>{msg.content}</ReactMarkdown>
                   </div>
                )}

              </div>
            </div>
          ))}
          <div ref={scrollRef} className="h-4" />
        </div>
      </ScrollArea>

      {/* Input Layer */}
      <div className="shrink-0 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-12 pb-6 px-4 sm:px-8 z-30">
        <div className="max-w-4xl mx-auto drop-shadow-2xl relative">
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