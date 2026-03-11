"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory, ExecutionPayload } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Bot, FileText } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils"; // FIX: Imported the missing utility

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
}

interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  reasoning?: string;
  files?: File[];
  payload?: ExecutionPayload; 
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
  // Phase 3 & 4: Streaming Orchestration
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

                {msg.reasoning && (
                  <div className="mt-2 text-[13px] text-slate-500 italic bg-slate-900/30 px-4 py-2 rounded-xl border border-dashed border-slate-800">
                    {msg.reasoning}
                  </div>
                )}

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

                {msg.payload && (
                  <div className="w-full mt-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <DynamicChartFactory payload={msg.payload} />
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