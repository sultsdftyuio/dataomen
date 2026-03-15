"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory, ExecutionPayload } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Bot, FileText, BrainCircuit, Activity, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
}

interface PredictiveData {
  status: string;
  metric: string;
  trend_slope: number;
  forecast_next_3_periods: number[];
  r_squared: number;
  confidence: "high" | "medium" | "low";
}

interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  reasoning?: string;
  files?: File[];
  payload?: ExecutionPayload; 
  predictiveData?: PredictiveData; // Phase 7 Integration
  jobId?: string; // Phase 6 Integration
  narrative?: string; // Phase 8 Integration
  timestamp: Date;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const DashboardOrchestrator: React.FC<DashboardOrchestratorProps> = ({ token, tenantId }) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic for responsive stream updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // Phase 6: Async Job Polling Effect
  // Automatically polls the backend for results if a "noisy neighbor" query was routed to a background worker.
  useEffect(() => {
    const activeJobs = messages.filter(m => m.role === "assistant" && m.jobId && !m.payload && !m.predictiveData);
    
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
                  narrative: data.narrative, // Phase 8: Capture narrative from completed job
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

  // Performance Optimization: Memoize history to prevent token bloat in re-renders
  const historyContext = useMemo(() => 
    messages.slice(-6).map(m => ({ role: m.role, content: m.content || m.reasoning })),
    [messages]
  );

  // ---------------------------------------------------------------------------
  // Phase 2: Storage Layer (R2 Ingestion)
  // ---------------------------------------------------------------------------
  const uploadDirectToR2 = async (file: File): Promise<string> => {
    const initRes = await fetch("/api/ingestion/presigned-url", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ file_name: file.name, content_type: file.type }),
    });
    
    if (!initRes.ok) throw new Error("Secure upload initialization failed.");
    const { url, fields, object_key, dataset_id } = await initRes.json();

    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
    formData.append("file", file);

    const uploadRes = await fetch(url, { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error(`R2 Storage rejection for ${file.name}`);

    setProgressStatus(`Profiling ${file.name}...`);
    const workerRes = await fetch("/api/ingestion/process-parquet", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ dataset_id, object_key }),
    });

    if (!workerRes.ok) throw new Error("Profiling worker failed.");
    return dataset_id;
  };

  // ---------------------------------------------------------------------------
  // Phase 3, 4, 6, 7 & 8: Streaming Orchestration
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, files: File[]) => {
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // 1. UI Setup: Optimistic updates for low latency
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: "user",
      content: text,
      files,
      timestamp: new Date(),
    }]);

    setIsProcessing(true);

    try {
      let newlyUploadedIds: string[] = [];
      if (files.length > 0) {
        setProgressStatus("Ingesting to analytical tier...");
        newlyUploadedIds = await Promise.all(files.map(f => uploadDirectToR2(f)));
        setActiveDatasetIds(prev => [...new Set([...prev, ...newlyUploadedIds])]);
      }

      // 2. Initiate Edge Stream
      const currentActiveIds = [...new Set([...activeDatasetIds, ...newlyUploadedIds])];

      // Automatically determine if the prompt is asking for a prediction to trigger Phase 7 config
      const isPredictive = text.toLowerCase().includes("predict") || text.toLowerCase().includes("forecast");

      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          prompt: text,
          active_dataset_ids: currentActiveIds,
          history: historyContext,
          // If the user is explicitly asking for a forecast, we inject the Phase 7 config
          ...(isPredictive && {
            predictive_config: { metric_col: "auto_detect", time_col: "auto_detect" } 
          })
        }),
      });

      if (!response.ok || !response.body) throw new Error("Analytical Engine connection failed.");

      // 3. Setup Initial Assistant Shell
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: "assistant",
        reasoning: "",
        timestamp: new Date(),
      }]);

      // 4. Consume SSE Stream
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

              if (packet.type === "status") {
                setProgressStatus(packet.content);
                return m;
              }
              if (packet.type === "reasoning") {
                return { ...m, reasoning: (m.reasoning || "") + packet.content };
              }
              if (packet.type === "data") {
                return { ...m, payload: packet.content as ExecutionPayload };
              }
              // Phase 6: Async Job Routing Triggered
              if (packet.type === "job_queued") {
                return { ...m, jobId: packet.job_id, reasoning: (m.reasoning || "") + "\n\n🚀 Query too complex for sync execution. Offloading to background compute worker..." };
              }
              // Phase 7: Predictive Insights Data Received
              if (packet.type === "predictive_insights") {
                return { ...m, predictiveData: packet.content as PredictiveData };
              }
              // Phase 8: Executive Narrative Received
              if (packet.type === "narrative") {
                return { ...m, narrative: packet.content };
              }
              return m;
            }));
          } catch (e) {
            console.warn("Fragmented chunk ignored:", payloadStr);
          }
        }
      }

    } catch (error: any) {
      toast({ title: "Engine Error", description: error.message, variant: "destructive" });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        payload: { type: "error", message: error.message } as any,
        timestamp: new Date()
      }]);
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
          <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-200">Dataomen <span className="text-slate-500 font-normal">v2.0</span></h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 border border-slate-800">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">{activeDatasetIds.length} Active Contexts</span>
        </div>
      </header>

      {/* Analytical Stream */}
      <ScrollArea className="flex-1 px-4 py-8 md:px-12 lg:px-24">
        <div className="max-w-4xl mx-auto space-y-10 pb-20">
          {messages.length === 0 && (
            <div className="h-[60vh] flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="p-6 bg-slate-900/50 rounded-3xl border border-slate-800 shadow-2xl">
                <Bot className="w-12 h-12 text-slate-700" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-slate-300">Analytical Engine Ready</p>
                <p className="text-xs text-slate-500">Upload CSVs or ask questions to initiate DuckDB vectorized scans.</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex gap-4",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border",
                msg.role === "assistant" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-800 border-slate-700"
              )}>
                {msg.role === "assistant" ? <Bot size={16} className="text-emerald-400" /> : <User size={16} className="text-slate-400" />}
              </div>

              <div className={cn(
                "flex flex-col max-w-[90%]",
                msg.role === "user" ? "items-end" : "items-start"
              )}>
                {/* Text Content */}
                {msg.content && (
                  <div className={cn(
                    "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                    msg.role === "user" 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-slate-900 text-slate-300 border border-slate-800 rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>
                )}

                {/* Agent Reasoning Stream */}
                {msg.reasoning && (
                  <div className="mt-2 text-[13px] text-slate-500 italic bg-slate-900/30 px-4 py-2 rounded-xl border border-dashed border-slate-800">
                    <ReactMarkdown>{msg.reasoning}</ReactMarkdown>
                  </div>
                )}

                {/* Uploaded File Indicators */}
                {msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                        <FileText size={12} className="text-emerald-500" />
                        <span className="truncate max-w-[120px]">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Phase 6: Async Background Job Indicator */}
                {msg.jobId && !msg.payload && (
                  <div className="mt-3 flex items-center gap-3 p-4 bg-slate-900/80 rounded-2xl border border-slate-700 text-sm shadow-inner w-full md:w-auto animate-in fade-in">
                    <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-200">Processing Complex Data...</span>
                      <span className="text-[11px] text-slate-400 font-mono tracking-wider">JOB_ID: {msg.jobId.split('-')[0]}</span>
                    </div>
                  </div>
                )}

                {/* Phase 7: Predictive ML Forecast Indicator */}
                {msg.predictiveData && (
                  <div className="mt-3 w-full bg-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden shadow-lg animate-in slide-in-from-bottom-2">
                    <div className="bg-purple-500/10 px-4 py-2 border-b border-purple-500/20 flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">Polars Predictive Insight</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Metric</span>
                        <span className="text-sm font-semibold text-slate-200">{msg.predictiveData.metric}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">Trend (Slope)</span>
                        <span className="text-sm font-mono text-emerald-400 flex items-center gap-1">
                          {msg.predictiveData.trend_slope > 0 ? '↗' : '↘'} {msg.predictiveData.trend_slope.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">R² Confidence</span>
                        <span className="text-sm font-mono text-slate-200">{msg.predictiveData.r_squared.toFixed(2)} ({msg.predictiveData.confidence})</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 uppercase">+3 Period Forecast</span>
                        <span className="text-sm font-mono text-slate-200">{msg.predictiveData.forecast_next_3_periods[0].toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard Execution Payload / Dynamic Chart */}
                {msg.payload && (
                  <div className="w-full mt-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <DynamicChartFactory payload={msg.payload} />
                  </div>
                )}

                {/* Phase 8: Executive Narrative Section */}
                {msg.narrative && (
                  <div className="w-full mt-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-700">
                    <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Executive Summary
                    </h4>
                    <div className="prose prose-sm dark:prose-invert text-slate-300 max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.narrative}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

              </div>
            </div>
          ))}
          
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Interactive Input Layer */}
      <div className="shrink-0 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-10 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
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