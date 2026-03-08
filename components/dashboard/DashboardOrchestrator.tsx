"use client";

import React, { useState, useRef, useEffect } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory, ExecutionPayload } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Bot, FileText, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  files?: File[];
  payload?: ExecutionPayload; // Binds to Phase 5: Dynamic Render Factory
  timestamp: Date;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const DashboardOrchestrator: React.FC = () => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  
  // Maintains Contextual RAG state: Which datasets are active in this session?
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // ---------------------------------------------------------------------------
  // Phase 2: Direct-to-R2 Upload Pipeline (Bandwidth Optimization)
  // ---------------------------------------------------------------------------
  const uploadDirectToR2 = async (file: File): Promise<string> => {
    // 1. Fetch pre-signed conditions from the Python backend
    const initRes = await fetch("/api/ingestion/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: file.name, content_type: file.type }),
    });
    
    if (!initRes.ok) throw new Error("Failed to initialize secure upload.");
    const { url, fields, object_key, dataset_id } = await initRes.json();

    // 2. Direct upload to Cloudflare R2 bypassing Vercel/Render limits
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, value as string);
    });
    formData.append("file", file); // File must strictly be the last appended field

    const uploadRes = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Storage upload failed for ${file.name}`);

    // 3. Trigger Event-Driven Profiling Worker (CSV -> Parquet & Schema Extraction)
    setProgressStatus(`Profiling and compressing ${file.name}...`);
    const workerRes = await fetch("/api/ingestion/process-parquet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id, object_key }),
    });

    if (!workerRes.ok) throw new Error("Data profiling worker failed.");

    return dataset_id;
  };

  // ---------------------------------------------------------------------------
  // Phase 3 & 4: Orchestration & Execution 
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, files: File[]) => {
    // 1. Optimistic UI Update
    const newUserMsg: RichMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      files: files,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, newUserMsg]);
    setIsProcessing(true);

    try {
      let newlyUploadedIds: string[] = [];

      // 2. Execute Upload Pipeline if files are dropped
      if (files.length > 0) {
        setProgressStatus("Uploading to secure analytical storage...");
        newlyUploadedIds = await Promise.all(files.map(file => uploadDirectToR2(file)));
        
        // Update context with strictly verified Parquet datasets
        setActiveDatasetIds((prev) => [...new Set([...prev, ...newlyUploadedIds])]);
      }

      // 3. Route to Semantic Router (Contextual RAG)
      setProgressStatus("Analyzing semantics & generating execution plan...");
      
      const currentActiveIds = [...new Set([...activeDatasetIds, ...newlyUploadedIds])];
      
      // Strip payload bloat: Send only role and text history to the LLM
      const historyContext = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

      const queryRes = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          active_dataset_ids: currentActiveIds,
          history: historyContext,
        }),
      });

      if (!queryRes.ok) throw new Error("The Analytical Engine encountered a routing error.");
      
      // 4. Receive Structured Payload from DuckDB / Python execution
      const payload: ExecutionPayload = await queryRes.json();

      // 5. Append Factory Payload to UI
      const assistantMsg: RichMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        payload: payload,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMsg]);

    } catch (error: any) {
      toast({
        title: "Execution Error",
        description: error.message || "An unexpected analytical error occurred.",
        variant: "destructive",
      });
      
      // Graceful error state injection into the chat stream
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          payload: { type: "error", message: error.message },
          timestamp: new Date(),
        }
      ]);
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Navbar / Header (Optional context indicator) */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md z-10">
        <div className="flex items-center space-x-3">
          <Bot className="w-5 h-5 text-emerald-400" />
          <h1 className="font-semibold text-sm tracking-tight">Dataomen Analytical Engine</h1>
        </div>
        <div className="text-xs text-slate-500 font-medium bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
          {activeDatasetIds.length} Active Datasets
        </div>
      </header>

      {/* Main Chat & Execution Stream */}
      <ScrollArea className="flex-1 px-4 py-6 md:px-8 lg:px-12 scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
          
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500 space-y-4">
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
                <Bot className="w-10 h-10 text-emerald-500/50" />
              </div>
              <p className="text-sm font-medium">Drop a CSV or type a query to spin up the engine.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full space-x-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {/* Avatar for Assistant */}
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-1">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
              )}

              {/* Message Bubble Container */}
              <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                
                {/* User Text Bubble */}
                {msg.role === "user" && msg.content && (
                  <div className="bg-slate-800 text-slate-200 px-5 py-3 rounded-2xl rounded-tr-sm text-sm border border-slate-700 shadow-md">
                    {msg.content}
                  </div>
                )}
                
                {/* User Uploaded File Pills */}
                {msg.role === "user" && msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 justify-end">
                    {msg.files.map((f, i) => (
                      <div key={i} className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="max-w-[150px] truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Assistant Output: Delegated entirely to Phase 5 Factory */}
                {msg.role === "assistant" && msg.payload && (
                  <div className="w-full mt-1">
                    <DynamicChartFactory payload={msg.payload} />
                  </div>
                )}
              </div>

              {/* Avatar for User */}
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mt-1 shadow-sm">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
              )}
            </div>
          ))}
          
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Phase 1: Omni-Input Container */}
      <div className="flex-shrink-0 w-full bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-6 pb-6">
        <OmniMessageInput
          onSendMessage={handleSendMessage}
          isProcessing={isProcessing}
          progressStatus={progressStatus}
        />
      </div>
    </div>
  );
};