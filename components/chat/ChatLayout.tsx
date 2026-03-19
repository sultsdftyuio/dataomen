// components/chat/ChatLayout.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, FileText, Settings2, Sparkles, 
  FileSpreadsheet, Database, LineChart, Activity,
  ChevronDown, CheckCircle2, Copy, ThumbsUp, ThumbsDown, RotateCcw,
  TerminalSquare
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
  agentId?: string;
  agentName?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const ChatLayout: React.FC<ChatLayoutProps> = ({ 
  agentId = "default-router", 
  agentName = "Dataomen Omni-Engine" 
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll mechanism
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, progressStatus]);

  // Dynamic Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Copy to clipboard utility
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard", duration: 2000 });
  };

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

    setProgressStatus(`Profiling ${file.name}...`);
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

  // Suggestions
  const SUGGESTIONS = [
    { icon: <FileSpreadsheet className="w-5 h-5 text-emerald-500" />, title: "Analyze a Dataset", desc: "Upload a CSV, Excel, or Parquet file" },
    { icon: <Database className="w-5 h-5 text-blue-500" />, title: "Query Database", desc: "Connect Postgres, Snowflake, or Stripe" },
    { icon: <LineChart className="w-5 h-5 text-purple-500" />, title: "Forecast Trends", desc: "Predict future MRR or user growth" },
    { icon: <Activity className="w-5 h-5 text-rose-500" />, title: "Detect Anomalies", desc: "Find statistical outliers in your metrics" }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full bg-[#FAFAFA] dark:bg-[#0E0E10] relative overflow-hidden font-sans">
      
      {/* ── Top Navigation Bar ── */}
      <header className="absolute top-0 w-full flex-shrink-0 h-14 flex items-center justify-between px-4 md:px-6 z-20 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center space-x-2">
          {/* Agent Selector Dropdown (Visual) */}
          <button className="flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-muted/60 transition-colors group">
            <span className="text-sm font-medium text-foreground tracking-tight">{agentName}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
          
          {/* Active Context Badge */}
          {activeDatasetIds.length > 0 && (
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                {activeDatasetIds.length} Sources Connected
              </span>
            </div>
          )}
        </div>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg">
          <Settings2 className="w-4.5 h-4.5" />
        </Button>
      </header>

      {/* ── Main Chat Area ── */}
      <ScrollArea className="flex-1 w-full scroll-smooth pt-14">
        <div className="max-w-3xl mx-auto w-full px-4 md:px-6 py-8 space-y-12 pb-40">
          
          {/* ── Welcome / Empty State ── */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in-95 duration-700 mt-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 shadow-sm border border-primary/10">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-medium text-foreground mb-3 tracking-tight text-center">
                {getGreeting()}
              </h1>
              <p className="text-muted-foreground text-sm max-w-[420px] text-center leading-relaxed mb-10">
                I am your high-performance data assistant. Drop a file, connect a database, or ask an analytical question to get started.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {SUGGESTIONS.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSendMessage(`I want to ${s.title.toLowerCase()}`)}
                    className="flex items-start text-left gap-4 p-4 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-200 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-sm">
                      {s.icon}
                    </div>
                    <div className="flex flex-col mt-0.5">
                      <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{s.title}</span>
                      <span className="text-xs text-muted-foreground mt-1 line-clamp-1">{s.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Conversation Thread ── */}
          {messages.map((msg) => (
            <div key={msg.id} className="group flex flex-col w-full animate-in fade-in slide-in-from-bottom-3 duration-500">
              
              {/* USER MESSAGE */}
              {msg.role === "user" && (
                <div className="flex flex-col items-end w-full ml-auto max-w-[75%] md:max-w-[70%] space-y-2">
                  {/* File Attachments */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-end w-full">
                      {msg.files.map((f, i) => (
                        <div key={i} className="flex items-center space-x-2.5 bg-card px-3 py-2 rounded-xl border border-border/80 shadow-sm">
                          <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                            <FileText className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <div className="flex flex-col">
                            <span className="max-w-[150px] truncate text-[13px] font-medium text-foreground leading-tight">{f.name}</span>
                            <span className="text-[11px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Text Content */}
                  {msg.content && (
                    <div className="px-5 py-3.5 text-[15px] shadow-sm leading-relaxed bg-[#ececec] dark:bg-[#2f2f31] text-foreground rounded-3xl rounded-br-sm border border-transparent dark:border-white/5">
                      {msg.content}
                    </div>
                  )}
                </div>
              )}

              {/* ASSISTANT MESSAGE */}
              {msg.role === "assistant" && (
                <div className="flex gap-4 md:gap-5 w-full max-w-full">
                  {/* Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-1 shadow-sm">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  
                  {/* Response Content */}
                  <div className="flex flex-col flex-1 min-w-0 pt-1.5 space-y-4">
                    
                    {/* Text block */}
                    {msg.content && (
                      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-foreground leading-relaxed">
                        {msg.content}
                      </div>
                    )}
                    
                    {/* Dynamic Chart / Data Payload block */}
                    {msg.payload && (
                      <div className="w-full bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                        <DynamicChartFactory payload={msg.payload} />
                      </div>
                    )}

                    {/* AI Feedback Action Bar (Appears on Hover) */}
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(msg.content || JSON.stringify(msg.payload))}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-emerald-500">
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-500">
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Processing Indicator ── */}
          {isProcessing && (
            <div className="flex gap-4 md:gap-5 w-full animate-in fade-in duration-300">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center mt-1">
                <TerminalSquare className="w-4 h-4 text-muted-foreground animate-pulse" />
              </div>
              <div className="flex flex-col pt-2.5">
                <div className="flex items-center space-x-3 text-[15px] font-medium text-foreground/80">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                  </div>
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground animate-pulse">
                    {progressStatus || "Orchestrating engines..."}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={scrollRef} className="h-8" />
        </div>
      </ScrollArea>

      {/* ── Unified Omni-Input Bar (Floating w/ Gradient Mask) ── */}
      <div className="absolute bottom-0 w-full z-10">
        {/* Gradient Mask to smoothly hide scrolling text */}
        <div className="h-12 w-full bg-gradient-to-t from-[#FAFAFA] dark:from-[#0E0E10] to-transparent pointer-events-none" />
        
        <div className="bg-[#FAFAFA] dark:bg-[#0E0E10] pb-6 pt-2 px-4 md:px-6">
          <div className="max-w-3xl mx-auto w-full">
            <OmniMessageInput
              onSendMessage={handleSendMessage}
              isProcessing={isProcessing}
              progressStatus={progressStatus}
            />
            <div className="text-center mt-3 text-[11px] text-muted-foreground/60 font-medium tracking-wide">
              Dataomen AI can make mistakes. Consider verifying important metrics.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};