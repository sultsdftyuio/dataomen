"use client";

import React, { useState, useRef, useEffect } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, User, FileText, Settings2, Sparkles, 
  FileSpreadsheet, Database, LineChart, Activity 
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
  agentName = "Arcli Data Analyst" 
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  
  // Contextual RAG: Scoped to this specific chat room
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll mechanism
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // ---------------------------------------------------------------------------
  // Direct-to-R2 Upload Pipeline
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
  // Orchestration & Execution
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, files: File[] = []) => {
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

  // Julius-style intent suggestions
  const SUGGESTIONS = [
    { icon: <FileSpreadsheet className="w-5 h-5 text-emerald-500" />, title: "Analyze a Dataset", desc: "Upload a CSV, Excel, or Parquet file." },
    { icon: <Database className="w-5 h-5 text-blue-500" />, title: "Query Database", desc: "Connect to Postgres, Snowflake, or Stripe." },
    { icon: <LineChart className="w-5 h-5 text-purple-500" />, title: "Forecast Trends", desc: "Predict future MRR or user growth." },
    { icon: <Activity className="w-5 h-5 text-rose-500" />, title: "Detect Anomalies", desc: "Find statistical outliers in your metrics." }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] w-full bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
      
      {/* ── Chat Header ── */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-foreground tracking-tight">{agentName}</h2>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
              {activeDatasetIds.length} Sources Connected
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg">
          <Settings2 className="w-4 h-4" />
        </Button>
      </header>

      {/* ── Message Stream ── */}
      <ScrollArea className="flex-1 p-4 md:p-6 scroll-smooth bg-muted/10">
        <div className="max-w-4xl mx-auto space-y-8 pb-6">
          
          {/* Julius AI Style Empty State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-primary/20 rotate-3">
                <Bot className="w-8 h-8 text-primary -rotate-3" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-3 tracking-tight text-center">What do you want to analyze?</h2>
              <p className="text-muted-foreground mb-10 text-sm max-w-md text-center leading-relaxed">
                Drop a dataset, connect a database, or ask a question in plain English. I'll write the SQL, build the charts, and explain the insights.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {SUGGESTIONS.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSendMessage(`I want to ${s.title.toLowerCase()}`)}
                    className="flex items-start text-left gap-4 p-4 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all shadow-sm group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      {s.icon}
                    </div>
                    <div className="flex flex-col mt-0.5">
                      <span className="font-semibold text-sm text-foreground">{s.title}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{s.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-1 shadow-sm">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}

              <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                
                {/* Standard Text */}
                {msg.content && (
                  <div className={`px-5 py-3.5 text-sm shadow-sm leading-relaxed ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm" 
                      : "bg-card border border-border text-foreground rounded-2xl rounded-tl-sm"
                  }`}>
                    {msg.content}
                  </div>
                )}
                
                {/* Uploaded Files Indicator */}
                {msg.role === "user" && msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 justify-end">
                    {msg.files.map((f, i) => (
                      <div key={i} className="flex items-center space-x-1.5 bg-card px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground shadow-sm">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="max-w-[150px] truncate font-medium">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rich Factory Payload (Tables/Charts/Errors) */}
                {msg.role === "assistant" && msg.payload && (
                  <div className="w-full mt-3 animate-in fade-in slide-in-from-bottom-2">
                    <DynamicChartFactory payload={msg.payload} />
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center mt-1 shadow-sm">
                  <User className="w-4 h-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          
          <div ref={scrollRef} className="h-4" />
        </div>
      </ScrollArea>

      {/* ── Unified Omni-Input Bar ── */}
      <div className="flex-shrink-0 w-full bg-card p-4 border-t border-border z-10">
        <OmniMessageInput
          onSendMessage={handleSendMessage}
          isProcessing={isProcessing}
          progressStatus={progressStatus}
        />
      </div>
    </div>
  );
};