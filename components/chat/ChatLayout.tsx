// components/chat/ChatLayout.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings2, Sparkles, FileText,
  FileSpreadsheet, Database, LineChart, Activity,
  Copy, ThumbsUp, ThumbsDown, RotateCcw,
  Plus, ChevronDown, MoreHorizontal,
  Table2, TrendingUp, Search, Zap,
  ChevronRight, Code2, BrainCircuit, FlaskConical,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
export interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  files?: File[];
  payload?: ExecutionPayload;
  timestamp: Date;
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
}

interface ChatLayoutProps {
  agentId?: string;
  agentName?: string;
}

// -----------------------------------------------------------------------------
// Markdown-lite renderer (Engineered Typography)
// -----------------------------------------------------------------------------
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-extrabold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-gray-200 text-[13px] font-mono font-bold text-rose-600"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// Step / Thinking Pill
// -----------------------------------------------------------------------------
function ThinkingStep({ label, done }: { label: string; done?: boolean }) {
  if (!label) return null;
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-[12px] font-bold text-slate-500 shadow-sm animate-in fade-in slide-in-from-bottom-2">
      {done ? (
        <div className="p-0.5 bg-emerald-100 rounded-full">
          <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <span className="w-3.5 h-3.5 flex items-center justify-center bg-blue-50 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
        </span>
      )}
      {label}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chain-of-Thought Panel (DuckDB Trace)
// -----------------------------------------------------------------------------
function ReasoningPanel({ plan, sql, insights, diagnostics }: {
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = plan || sql || insights || diagnostics;
  if (!hasContent) return null;

  return (
    <div className="mt-4 border border-gray-200/80 rounded-2xl overflow-hidden bg-white shadow-sm transition-all duration-300">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer text-left"
      >
        <div className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <BrainCircuit className="w-4 h-4 text-blue-500" />
        </div>
        <span className="font-bold text-xs uppercase tracking-widest text-slate-600">
          Engine Execution Trace
        </span>
        <ChevronRight className={`w-4 h-4 text-slate-400 ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="p-5 flex flex-col gap-5 border-t border-gray-100 bg-white animate-in fade-in slide-in-from-top-1">
          {plan && (
            <ReasoningBlock
              icon={<FlaskConical className="w-3.5 h-3.5 text-indigo-500" />}
              label="Semantic Plan"
              content={typeof plan === "string" ? plan : JSON.stringify(plan, null, 2)}
              mono={false}
            />
          )}
          {sql && (
            <ReasoningBlock
              icon={<Code2 className="w-3.5 h-3.5 text-emerald-500" />}
              label="Compiled DuckDB SQL"
              content={sql}
              mono
            />
          )}
          {insights && (
            <ReasoningBlock
              icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
              label="Statistical Insights"
              content={typeof insights === "string" ? insights : JSON.stringify(insights, null, 2)}
              mono={false}
            />
          )}
          {diagnostics && (
            <ReasoningBlock
              icon={<Activity className="w-3.5 h-3.5 text-rose-500" />}
              label="Diagnostics"
              content={typeof diagnostics === "string" ? diagnostics : JSON.stringify(diagnostics, null, 2)}
              mono
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReasoningBlock({ icon, label, content, mono }: { icon: React.ReactNode; label: string; content: string; mono: boolean; }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">
        {icon} {label}
      </div>
      <div className={`rounded-xl overflow-x-auto shadow-inner border ${mono ? 'bg-slate-900 border-slate-800 p-4' : 'bg-slate-50 border-gray-200 p-4'}`}>
        <code className={`whitespace-pre-wrap break-words block ${mono ? "text-[12px] font-mono text-emerald-400 leading-relaxed" : "text-[13px] font-medium text-slate-700 leading-relaxed"}`}>
          {content}
        </code>
      </div>
    </div>
  );
}
// -----------------------------------------------------------------------------
// Timestamp formatter
// -----------------------------------------------------------------------------
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const ChatLayout: React.FC<ChatLayoutProps> = ({
  agentId = "default-router",
  agentName = "Arcli",
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  const [activeDocumentIds, setActiveDocumentIds] = useState<string[]>([]);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, progressStatus, isProcessing]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard", duration: 2000 });
  };

  // ---------------------------------------------------------------------------
  // Upgraded Hybrid Upload Pipeline
  // ---------------------------------------------------------------------------
  const handleHybridUpload = async (file: File): Promise<{ id: string; isDoc: boolean }> => {
    setProgressStatus(`Ingesting ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dataset_name", file.name);

    const uploadRes = await fetch("/api/datasets/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Ingestion failed for ${file.name}`);

    const data = await uploadRes.json();
    const extractedId = data.storage_path?.split("/").pop() || data.dataset_id;
    const isDoc = file.name.match(/\.(pdf|txt|md|docx)$/i) !== null;

    return { id: extractedId, isDoc };
  };

  // ---------------------------------------------------------------------------
  // Orchestration (SSE Streaming Integration)
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, files: File[] = []) => {
    const userMsg: RichMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      files,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    setCompletedSteps([]);
    setProgressStatus("");

    try {
      let currentDatasetIds = [...activeDatasetIds];
      let currentDocumentIds = [...activeDocumentIds];

      if (files.length > 0) {
        setCompletedSteps((prev) => [...prev, "Uploading files…"]);
        const results = await Promise.all(files.map(handleHybridUpload));

        const newDatasets = results.filter((r) => !r.isDoc).map((r) => r.id);
        const newDocs = results.filter((r) => r.isDoc).map((r) => r.id);

        currentDatasetIds = [...new Set([...currentDatasetIds, ...newDatasets])];
        currentDocumentIds = [...new Set([...currentDocumentIds, ...newDocs])];

        setActiveDatasetIds(currentDatasetIds);
        setActiveDocumentIds(currentDocumentIds);
      }

      const history = messages
        .slice(-5)
        .map((m) => ({ role: m.role, content: m.content || "" }));

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      const res = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: text,
          active_dataset_ids: currentDatasetIds,
          active_document_ids: currentDocumentIds,
          history,
        }),
      });

      if (!res.ok || !res.body) throw new Error("The analytical engine encountered an error.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let doneReading = false;
      let streamedContent = "";

      while (!doneReading) {
        const { value, done } = await reader.read();
        if (done) { doneReading = true; break; }

        const chunkString = decoder.decode(value, { stream: true });
        const lines = chunkString.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              const { type, content, message } = parsed;

              switch (type) {
                case "status":
                  setProgressStatus((currentStatus) => {
                    if (currentStatus && !completedSteps.includes(currentStatus)) {
                      setCompletedSteps((prev) => [...prev, currentStatus]);
                    }
                    return content || message;
                  });
                  break;

                case "plan":
                case "sql":
                case "insights":
                case "diagnostics":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, [type]: content } : m
                    )
                  );
                  break;

                case "narrative":
                case "narrative_chunk":
                  streamedContent += content?.executive_summary || content || message || "";
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: streamedContent } : m
                    )
                  );
                  break;

                case "data":
                case "cache_hit":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, payload: content } : m
                    )
                  );
                  doneReading = true;
                  break;

                case "error":
                  toast({ title: "Error", description: content || message, variant: "destructive" });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: streamedContent + `\n\n**Error:** ${content || message}` }
                        : m
                    )
                  );
                  break;

                case "done":
                  doneReading = true;
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk:", dataStr);
            }
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages((prev) => {
        const hasAssistant = prev[prev.length - 1]?.role === "assistant";
        if (hasAssistant) {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: `**Error:** ${err.message}` } : m
          );
        }
        return [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `**Error:** ${err.message || "An unexpected error occurred."}`,
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  // ---------------------------------------------------------------------------
  // Suggestion Cards
  // ---------------------------------------------------------------------------
  const SUGGESTIONS = [
    {
      icon: <FileSpreadsheet className="w-4 h-4" />,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
      title: "Analyze a dataset",
      prompt: "I want to analyze a dataset",
    },
    {
      icon: <Database className="w-4 h-4" />,
      color: "text-blue-600 bg-blue-50 border-blue-100",
      title: "Query a database",
      prompt: "I want to query a database",
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      color: "text-violet-600 bg-violet-50 border-violet-100",
      title: "Forecast trends",
      prompt: "I want to forecast trends and predict future metrics",
    },
    {
      icon: <Search className="w-4 h-4" />,
      color: "text-rose-600 bg-rose-50 border-rose-100",
      title: "Detect anomalies",
      prompt: "I want to detect anomalies in my data",
    },
  ];

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden bg-[#fafafa] font-sans text-slate-900">
      
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200/80 sticky top-0 z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <button className="flex items-center gap-1.5 font-extrabold text-[15px] text-slate-900 hover:text-blue-600 transition-colors shrink-0 focus:outline-none">
            {agentName}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {/* Dataset & Doc Badges */}
          {activeDatasetIds.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700 uppercase tracking-widest ml-3 shrink-0 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeDatasetIds.length} <span className="hidden sm:inline">Dataset{activeDatasetIds.length > 1 ? "s" : ""}</span>
            </div>
          )}
          {activeDocumentIds.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-[10px] font-bold text-purple-700 uppercase tracking-widest ml-2 shrink-0 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {activeDocumentIds.length} <span className="hidden sm:inline">Doc{activeDocumentIds.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl h-9 w-9 transition-colors"><Plus className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl h-9 w-9 transition-colors"><Settings2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl h-9 w-9 transition-colors"><MoreHorizontal className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* ── Chat Body ── */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-4xl mx-auto w-full p-6 pb-24">
          
          {/* Empty / Welcome State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="w-14 h-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                <Zap className="w-6 h-6 text-blue-500" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
                {getGreeting()}
              </h1>
              <p className="text-slate-500 font-medium max-w-md mb-10 leading-relaxed text-[15px]">
                Ask a question, upload a file, or pick a task below to get started.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {SUGGESTIONS.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSendMessage(s.prompt)} 
                    className="flex items-center gap-4 p-4 bg-white border border-gray-200/80 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all text-left group shadow-sm"
                  >
                    <div className={`p-2.5 rounded-xl border shadow-sm group-hover:scale-110 transition-transform ${s.color}`}>
                      {s.icon}
                    </div>
                    <span className="font-bold text-[14px] text-slate-700 group-hover:text-blue-600 transition-colors">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Thread */}
          <div className="flex flex-col gap-8">
            {messages.map((msg, idx) => (
              <div 
                key={msg.id} 
                className="animate-in fade-in slide-in-from-bottom-2 duration-300" 
                onMouseEnter={() => setHoveredMsgId(msg.id)} 
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                
                {/* USER MESSAGE */}
                {msg.role === "user" && (
                  <div className="flex flex-col items-end gap-2">
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end mb-1">
                        {msg.files.map((f, i) => {
                          const isDoc = f.name.match(/\.(pdf|txt|md|docx)$/i) !== null;
                          return (
                            <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2.5 shadow-sm">
                              <div className={`p-2 rounded-lg border ${isDoc ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col text-left mr-2">
                                <span className="text-xs font-bold text-slate-700 max-w-[160px] truncate">{f.name}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {msg.content && (
                      <div className="max-w-[90%] sm:max-w-[75%] flex flex-col items-end">
                        <div className="bg-blue-600 text-white rounded-3xl rounded-br-sm px-5 py-3.5 shadow-sm text-[15px] font-medium leading-relaxed">
                          {msg.content}
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ASSISTANT MESSAGE */}
                {msg.role === "assistant" && (
                  <div className="flex gap-4 items-start max-w-[95%] sm:max-w-[85%]">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 mt-1">
                      <Zap className="w-4 h-4 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Streaming Status Pills */}
                      {isProcessing && idx === messages.length - 1 && (
                        <div className="flex flex-wrap gap-2 mb-4 pt-1">
                          {completedSteps.map((step) => (
                            <ThinkingStep key={step} label={step} done />
                          ))}
                          {progressStatus && !completedSteps.includes(progressStatus) && (
                            <ThinkingStep label={progressStatus} done={false} />
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      {msg.content && (
                        <div className="text-[15px] leading-relaxed text-slate-700 space-y-4">
                          {msg.content.split("\n").map((line, i) => (
                            <p key={i}>
                              <SimpleMarkdown text={line} />
                              {isProcessing && idx === messages.length - 1 && i === msg.content!.split("\n").length - 1 && (
                                <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 animate-pulse align-middle rounded-full" />
                              )}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Chain-of-thought Reasoning Panel */}
                      {(msg.plan || msg.sql || msg.insights || msg.diagnostics) && (
                        <ReasoningPanel
                          plan={msg.plan}
                          sql={msg.sql}
                          insights={msg.insights}
                          diagnostics={msg.diagnostics}
                        />
                      )}

                      {/* Chart / Data Payload */}
                      {msg.payload && (
                        <div className="mt-5 bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                              <Table2 className="w-4 h-4 text-slate-400" />
                              <span className="text-[12px] font-extrabold text-slate-600 uppercase tracking-widest">
                                Analysis Result
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 rounded-lg" onClick={() => copyToClipboard(JSON.stringify(msg.payload))}>
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 rounded-lg">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-5">
                            <DynamicChartFactory payload={msg.payload} />
                          </div>
                        </div>
                      )}

                      {/* Timestamp + Action bar */}
                      <div
                        className={`flex items-center justify-between mt-3 transition-opacity duration-200 ${hoveredMsgId === msg.id && !isProcessing ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {formatTime(msg.timestamp)}
                        </div>
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => copyToClipboard(msg.content || JSON.stringify(msg.payload))} title="Copy">
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Good response">
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Bad response">
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Retry">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Scroll anchor */}
            <div ref={scrollRef} className="h-4" />
          </div>
        </div>
      </ScrollArea>

      {/* ── Input Area ── */}
      <div className="p-4 bg-white border-t border-gray-200/80 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        <div className="max-w-4xl mx-auto">
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
          />
          <div className="text-center mt-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-center items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Arcli can make mistakes — verify critical outputs</span>
            <span className="text-slate-300">•</span>
            <a href="mailto:support@arcli.tech" className="hover:text-blue-600 transition-colors">
              Get help
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};