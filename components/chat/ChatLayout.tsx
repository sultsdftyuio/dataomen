"use client";

import React, { useState, useRef, useEffect } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory, ExecutionPayload } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, FileText, Settings2 } from "lucide-react";
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
}

interface ChatLayoutProps {
  /**
   * The ID of the specific specialized agent this room is communicating with.
   * If omitted, it defaults to the standard Semantic Router.
   */
  agentId?: string;
  agentName?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const ChatLayout: React.FC<ChatLayoutProps> = ({ 
  agentId = "default-router", 
  agentName = "Analytical Agent" 
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  
  // Contextual RAG: Scoped to this specific chat room
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll mechanism for new messages and streaming progress
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // ---------------------------------------------------------------------------
  // Phase 2: Direct-to-R2 Upload Pipeline
  // ---------------------------------------------------------------------------
  const uploadDirectToR2 = async (file: File): Promise<string> => {
    const initRes = await fetch("/api/ingestion/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: file.name, content_type: file.type }),
    });
    
    if (!initRes.ok) throw new Error(`Failed to initialize upload for ${file.name}`);
    const { url, fields, object_key, dataset_id } = await initRes.json();

    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, value as string);
    });
    formData.append("file", file);

    const uploadRes = await fetch(url, { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error(`Storage upload failed for ${file.name}`);

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

      if (files.length > 0) {
        setProgressStatus("Uploading to secure analytical storage...");
        newlyUploadedIds = await Promise.all(files.map(file => uploadDirectToR2(file)));
        setActiveDatasetIds((prev) => [...new Set([...prev, ...newlyUploadedIds])]);
      }

      setProgressStatus("Analyzing semantics & generating execution plan...");
      const currentActiveIds = [...new Set([...activeDatasetIds, ...newlyUploadedIds])];
      const historyContext = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));

      // Call the Orchestrator, passing the agentId if we want to bypass the Semantic Router
      // and target a specialized prompt/agent.
      const queryRes = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: text,
          active_dataset_ids: currentActiveIds,
          history: historyContext,
        }),
      });

      if (!queryRes.ok) throw new Error("The Analytical Engine encountered an error.");
      
      const payload: ExecutionPayload = await queryRes.json();

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
    <div className="flex flex-col h-full bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Standalone Chat Header */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-slate-100 tracking-tight">{agentName}</h2>
            <p className="text-[10px] text-slate-400 font-medium">{activeDatasetIds.length} Data Sources Active</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100 h-8 w-8 rounded-lg">
          <Settings2 className="w-4 h-4" />
        </Button>
      </header>

      {/* Message Stream */}
      <ScrollArea className="flex-1 p-4 scroll-smooth bg-slate-950/30">
        <div className="max-w-4xl mx-auto space-y-6 pb-6">
          
          {/* Empty State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[40vh] text-slate-500 space-y-3">
              <Bot className="w-12 h-12 text-emerald-500/20" />
              <p className="text-sm font-medium">Hello! Drop a dataset here or ask me a question.</p>
            </div>
          )}

          {/* Message Bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full space-x-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-1">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
              )}

              <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                
                {/* Standard Text */}
                {msg.role === "user" && msg.content && (
                  <div className="bg-slate-800 text-slate-200 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm border border-slate-700 shadow-md">
                    {msg.content}
                  </div>
                )}
                
                {/* Uploaded Files Indicator */}
                {msg.role === "user" && msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1.5 justify-end">
                    {msg.files.map((f, i) => (
                      <div key={i} className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs text-slate-300">
                        <FileText className="w-3 h-3 text-emerald-400" />
                        <span className="max-w-[120px] truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rich Factory Payload (Tables/Charts/Errors) */}
                {msg.role === "assistant" && msg.payload && (
                  <div className="w-full mt-1">
                    <DynamicChartFactory payload={msg.payload} />
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mt-1 shadow-sm">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
              )}
            </div>
          ))}
          
          {/* Invisible ref to snap to bottom */}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Unified Omni-Input Bar */}
      <div className="flex-shrink-0 w-full bg-slate-950 p-4 border-t border-slate-800">
        <OmniMessageInput
          onSendMessage={handleSendMessage}
          isProcessing={isProcessing}
          progressStatus={progressStatus}
        />
      </div>
    </div>
  );
};