// components/dashboard/OmniscientScratchpad.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, TerminalSquare, Sparkles, LineChart, Database, BrainCircuit, 
  ArrowRight, X, Lock, MessageSquare, BarChart3, TrendingUp, TrendingDown, Minus
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";

// Core Intelligence Imports
import { AIMapper, AIResponseBlock, AIResponse } from "@/lib/intelligence/ai-mapper";
import { ExecutiveKPICard } from "@/components/dashboard/ExecutiveKPICard";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface ScratchpadMessage {
  id: string;
  role: "user" | "agent";
  raw_content?: string;
  blocks?: AIResponseBlock[];
  sql_used?: string;
  suggestedFollowUps?: string[];
}

const SUGGESTED_QUERIES = [
  { icon: LineChart, label: "Revenue Churn vs. Support Tickets", desc: "Omni-Graph correlation" },
  { icon: Database, label: "EU Enterprise Cohort Raw Rows", desc: "Deep data extraction" },
  { icon: Sparkles, label: "Forecast Next 30 Days MRR", desc: "Vectorized OLS projection" },
];

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export function OmniscientScratchpad({ context }: { context?: any }) {
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
      raw_content: query.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsExecuting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Inject deterministic context snapshot so AI knows what the user is looking at
      const contextSnapshot = AIMapper.buildContextSnapshot(
        context?.activeConnector || "Global Sandbox",
        context?.kpiStates || [],
        []
      );

      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { "Authorization": `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ 
          prompt: query,
          context_snapshot: contextSnapshot, 
          history: messages.slice(-4).map(m => ({ role: m.role, content: m.raw_content })) 
        }),
      });

      if (!response.ok) throw new Error("Scratchpad execution failed.");

      const data = await response.json();
      
      // FIREWALL: Parse non-deterministic LLM string into strict UI blocks
      const parsedIntelligence = AIMapper.parseResponse(data.reply || data.content);

      const agentMsg: ScratchpadMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        blocks: parsedIntelligence.blocks,
        sql_used: parsedIntelligence.sql_used || data.sql_used,
        suggestedFollowUps: parsedIntelligence.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, agentMsg]);

    } catch (error: any) {
      console.error("Scratchpad Error:", error);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "agent",
        blocks: [{ 
          type: "explanation", 
          text: "The analytical engine encountered a critical error executing this global query. Check your data warehouse connection." 
        }]
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[900px] p-0 bg-slate-50 border-gray-200/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col h-[85vh] max-h-[850px]">
        <DialogTitle className="sr-only">Omniscient Scratchpad</DialogTitle>

        {/* --- Header --- */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <TerminalSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-base tracking-tight flex items-center gap-2">
                Omniscient Scratchpad
                {context?.activeConnector && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] px-2 py-0.5">
                    Context: {context.activeConnector}
                  </Badge>
                )}
              </h2>
              <p className="text-slate-400 text-[11px] font-bold tracking-widest uppercase">Conversational Analytical Canvas</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-colors">
                Clear Canvas
              </Button>
            )}
            <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 font-mono text-[10px]">ESC</Badge>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* --- Canvas / Chat Area --- */}
        <ScrollArea className="flex-1 px-6 py-8" ref={scrollRef}>
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
                  <div className={`w-full max-w-[85%] flex flex-col gap-4 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    
                    {/* User Message */}
                    {msg.role === "user" && (
                      <div className="p-4 px-6 bg-blue-600 text-white rounded-3xl rounded-br-sm shadow-md">
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                          {msg.raw_content}
                        </p>
                      </div>
                    )}

                    {/* Agent Message (Dynamically Rendered UI Blocks) */}
                    {msg.role === "agent" && msg.blocks && (
                      <div className="flex flex-col gap-4 w-full">
                        {msg.blocks.map((block, idx) => (
                          <div key={idx} className="animate-in slide-in-from-bottom-4 fade-in duration-500 w-full" style={{ animationDelay: `${idx * 150}ms`, animationFillMode: "both" }}>
                            <BlockRenderer block={block} />
                          </div>
                        ))}

                        {/* DuckDB SQL Trace Component */}
                        {msg.sql_used && (
                          <div className="w-full bg-slate-900 rounded-2xl p-5 shadow-inner border border-slate-800 animate-in fade-in">
                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3 block flex items-center gap-1.5">
                              <Database className="h-3 w-3" /> Canonical Query Trace
                            </span>
                            <code className="text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all">
                              {msg.sql_used}
                            </code>
                          </div>
                        )}

                        {/* Follow-up Prompts */}
                        {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {msg.suggestedFollowUps.map((q, qIdx) => (
                              <button 
                                key={qIdx}
                                onClick={() => handleExecute(q)}
                                className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 shadow-sm transition-colors flex items-center gap-1.5"
                              >
                                <Sparkles className="h-3 w-3 text-blue-500" /> {q}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              ))}
              
              {/* Calculating State */}
              {isExecuting && (
                <div className="flex justify-start animate-in fade-in">
                  <div className="bg-white border border-gray-200/80 rounded-2xl rounded-bl-sm p-5 shadow-sm flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <BrainCircuit className="h-5 w-5 animate-spin text-blue-600" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-extrabold text-slate-900">Engine is calculating...</span>
                      <span className="text-xs font-medium text-slate-500">Evaluating heuristics and semantic models.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* --- Input Area --- */}
        <div className="p-6 bg-white border-t border-gray-100 shrink-0 z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
          <form onSubmit={(e) => { e.preventDefault(); handleExecute(inputValue); }} className="relative flex items-center">
            <div className="absolute left-5 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <Input 
              autoFocus
              placeholder="Ask anything, spawn a chart, or request a deep dive... (e.g., 'Why did churn spike?')" 
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
              <Lock className="h-3 w-3" /> All queries are sandboxed and read-only
            </span>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component UI Router (The Core of the Conversational UI)
// -----------------------------------------------------------------------------
const BlockRenderer = ({ block }: { block: AIResponseBlock }) => {
  switch (block.type) {
    case "explanation":
      return (
        <div className="p-5 bg-white border border-gray-200/80 rounded-2xl shadow-sm">
          <p className="text-sm text-slate-800 leading-relaxed font-medium">
            {block.text}
          </p>
        </div>
      );
      
    case "stat":
      return (
        <div className="w-full max-w-[320px]">
          {/* Re-uses the Phase 3 component natively inside the chat! */}
          <ExecutiveKPICard kpi={block.data} />
        </div>
      );

    case "insight":
      const isCritical = block.data.urgency === "critical";
      const StatusIcon = block.data.direction === "negative" ? TrendingDown : TrendingUp;
      return (
        <div className={`p-5 rounded-2xl border bg-white shadow-sm flex items-start gap-4 ${isCritical ? 'border-rose-200' : 'border-blue-200'}`}>
          <div className={`p-2.5 rounded-xl border shadow-sm shrink-0 ${isCritical ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
            <StatusIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-base mb-1">{block.data.title}</h4>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">{block.data.description}</p>
          </div>
        </div>
      );

    case "chart":
      return (
        <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-gray-200/80">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-1.5 mb-1">
                <BarChart3 className="h-3 w-3 text-blue-500" /> Transient Canvas
              </span>
              <h4 className="font-extrabold text-slate-900 text-sm">{block.config.title}</h4>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
              Pin to Main Board
            </Button>
          </div>
          <div className="h-[250px] w-full">
             {/* Instead of VegaChart, we pass the generic payload to DynamicChartFactory */}
            <DynamicChartFactory payload={{ type: "chart", data: [], sql_used: block.config.query }} />
          </div>
        </div>
      );

    default:
      return null;
  }
};