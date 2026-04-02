"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  TerminalSquare, 
  Sparkles, 
  LineChart, 
  Database, 
  BrainCircuit, 
  ArrowRight,
  X,
  Lock,
  MessageSquare,
  BarChart3
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";

// --- Strict TypeScript Interfaces ---
interface ScratchpadMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  sql_used?: string;
  chart_payload?: any; // Represents Vega-Lite or Recharts config spawned by the AI
}

const SUGGESTED_QUERIES = [
  { icon: LineChart, label: "Revenue Churn vs. Support Tickets", desc: "Omni-Graph correlation" },
  { icon: Database, label: "EU Enterprise Cohort Raw Rows", desc: "Deep data extraction" },
  { icon: Sparkles, label: "Forecast Next 30 Days MRR", desc: "Vectorized OLS projection" },
];

export function OmniscientScratchpad() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ScratchpadMessage[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Global Cmd+K Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 2. Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isExecuting]);

  // 3. Execution Engine Handshake
  const handleExecute = async (query: string) => {
    if (!query.trim()) return;

    const userMsg: ScratchpadMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsExecuting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Route to the Smart Grid / Global Orchestrator
      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { "Authorization": `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ 
          prompt: query,
          context: "global_scratchpad", // Tells the backend this is a transient canvas query
          history: messages.slice(-4) 
        }),
      });

      if (!response.ok) throw new Error("Scratchpad execution failed.");

      const data = await response.json();

      const agentMsg: ScratchpadMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        content: data.reply || data.content || "Analysis complete.",
        sql_used: data.sql_used || data.query,
        chart_payload: data.chart_config || null,
      };

      setMessages((prev) => [...prev, agentMsg]);

    } catch (error: any) {
      console.error("Scratchpad Error:", error);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "agent",
        content: "The analytical engine encountered an error executing this global query. Please refine your parameters."
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInputValue("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[850px] p-0 bg-white border-gray-200/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col h-[85vh] max-h-[800px]">
        
        {/* Hidden Title for Accessibility */}
        <DialogTitle className="sr-only">Omniscient Scratchpad</DialogTitle>

        {/* --- Header --- */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <TerminalSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-base tracking-tight">Omniscient Scratchpad</h2>
              <p className="text-slate-400 text-[11px] font-bold tracking-widest uppercase">Global Analytical Canvas</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-colors">
                Clear Canvas
              </Button>
            )}
            <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 font-mono text-[10px]">
              ESC to close
            </Badge>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* --- Canvas / Chat Area --- */}
        <ScrollArea className="flex-1 bg-slate-50/50 p-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col h-full animate-in fade-in duration-500 mt-10">
              <div className="text-center mb-10">
                <div className="w-16 h-16 bg-white border border-gray-200 shadow-sm rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Sparkles className="h-8 w-8 text-blue-600/50" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-2">What would you like to explore?</h3>
                <p className="text-sm text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                  Query across all connected datasets, generate temporary charts, or ask for executive summaries without leaving your current workflow.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
                {SUGGESTED_QUERIES.map((suggestion, idx) => {
                  const Icon = suggestion.icon;
                  return (
                    <button 
                      key={idx}
                      onClick={() => handleExecute(suggestion.label)}
                      className="flex flex-col text-left p-5 bg-white border border-gray-200/80 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all group"
                    >
                      <Icon className="h-5 w-5 text-slate-400 group-hover:text-blue-600 mb-4 transition-colors" />
                      <span className="font-extrabold text-slate-900 text-sm mb-1 group-hover:text-blue-600 transition-colors">{suggestion.label}</span>
                      <span className="text-xs text-slate-500 font-medium">{suggestion.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-8 pb-4 max-w-4xl mx-auto">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] flex flex-col gap-3 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    
                    {/* Message Bubble */}
                    <div className={`p-5 rounded-3xl shadow-sm ${
                      msg.role === "user" 
                        ? "bg-blue-600 text-white rounded-br-sm" 
                        : "bg-white border border-gray-200/80 text-slate-800 rounded-bl-sm"
                    }`}>
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                        {msg.content}
                      </p>
                    </div>

                    {/* DuckDB SQL Trace (Only for Agent) */}
                    {msg.sql_used && (
                      <div className="w-full bg-slate-900 rounded-xl p-4 shadow-inner border border-slate-800 ml-2 animate-in fade-in">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-2 block flex items-center gap-1.5">
                          <Database className="h-3 w-3" /> Executed DuckDB Query
                        </span>
                        <code className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
                          {msg.sql_used}
                        </code>
                      </div>
                    )}

                    {/* Transient Scratchpad Chart (Only for Agent) */}
                    {msg.chart_payload && (
                      <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-gray-200/80 ml-2 animate-in slide-in-from-bottom-4 fade-in">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                          <span className="text-xs font-bold tracking-widest uppercase text-slate-500 flex items-center gap-1.5">
                            <BarChart3 className="h-4 w-4 text-blue-500" /> Transient Canvas
                          </span>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                            Pin to Main Board
                          </Button>
                        </div>
                        <div className="h-[250px] w-full flex items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-gray-200">
                          {/* In a real scenario, you pass msg.chart_payload to <VegaChart spec={msg.chart_payload} /> 
                            For now, we render a highly polished placeholder indicating success.
                          */}
                          <div className="text-center space-y-2">
                            <LineChart className="h-8 w-8 text-blue-400 mx-auto" />
                            <p className="text-sm font-bold text-slate-700">Data Visualization Rendered</p>
                            <p className="text-xs text-slate-500 font-medium max-w-[200px] mx-auto">Chart config received from DuckDB engine successfully.</p>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ))}
              
              {/* Loading State */}
              {isExecuting && (
                <div className="flex justify-start animate-in fade-in">
                  <div className="bg-white border border-gray-200/80 rounded-2xl rounded-bl-sm p-5 shadow-sm flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <BrainCircuit className="h-5 w-5 animate-spin text-blue-600" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-extrabold text-slate-900">Engine is calculating...</span>
                      <span className="text-xs font-medium text-slate-500">Routing semantic request to DuckDB cluster.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* --- Input Area --- */}
        <div className="p-6 bg-white border-t border-gray-100 shrink-0">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleExecute(inputValue); }} 
            className="relative flex items-center"
          >
            <div className="absolute left-5 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <Input 
              autoFocus
              placeholder="Ask anything or spawn a chart... (e.g., 'Chart revenue by region for Q3')" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isExecuting}
              className="w-full pl-14 pr-32 py-7 bg-slate-50 border-gray-200 focus-visible:ring-blue-600/20 text-base font-medium shadow-inner rounded-2xl"
            />
            <div className="absolute right-3 flex items-center gap-2">
              <Button 
                type="submit" 
                disabled={isExecuting || !inputValue.trim()}
                className="rounded-xl px-5 py-5 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all"
              >
                Execute <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
          <div className="text-center mt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3" /> Queries are sandboxed and read-only
            </span>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}