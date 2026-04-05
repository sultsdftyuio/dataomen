/**
 * ARCLI Intelligence System
 * Phase 5: Omniscient Scratchpad
 * * The embedded AI interaction layer.
 * * Converts natural language into structured, rendered UI components dynamically.
 */

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Bot, User, ArrowRight, Loader2 } from "lucide-react";
import { AIResponse, AIResponseBlock, AIMapper } from "@/lib/intelligence/ai-mapper";
import { ExecutiveKPICard } from "./ExecutiveKPICard";
import { InsightsFeed } from "./InsightsFeed";
// Assuming ProgressiveChart exists from Phase 4
import { ProgressiveChart } from "./ProgressiveChart"; 
import { ChartOrchestrator } from "@/lib/intelligence/chart-orchestrator";

// -----------------------------------------------------------------------------
// Block Renderers (Translating AI JSON -> UI Components)
// -----------------------------------------------------------------------------

const AIBlockRenderer: React.FC<{ 
  block: AIResponseBlock; 
  orchestrator: ChartOrchestrator 
}> = ({ block, orchestrator }) => {
  switch (block.type) {
    case "stat":
      return (
        <div className="w-full max-w-sm my-3 animate-in slide-in-from-bottom-2 fade-in duration-500">
          <ExecutiveKPICard kpi={block.data} />
        </div>
      );
    
    case "insight":
      return (
        <div className="w-full max-w-md my-3 animate-in slide-in-from-bottom-2 fade-in duration-500">
          {/* Reusing the styling logic of the Insights Feed for a single item */}
          <div className={`p-4 rounded-lg border shadow-sm ${
            block.data.direction === "negative" ? "bg-red-50/50 border-red-100" :
            block.data.direction === "positive" ? "bg-blue-50/50 border-blue-100" :
            "bg-white border-slate-200"
          }`}>
            <h4 className="text-sm font-semibold text-slate-900">{block.data.title}</h4>
            <p className="text-xs text-slate-600 mt-1">{block.data.description}</p>
          </div>
        </div>
      );

    case "chart":
      // Dynamically register the chart job requested by the AI
      orchestrator.addJob({
        id: block.config.id,
        query: block.config.query,
        params: block.config.params,
        group: "ai_generated",
        priority: 100 // High priority for real-time user requests
      });

      return (
        <div className="w-full my-4 animate-in zoom-in-95 fade-in duration-500">
          <ProgressiveChart
            jobId={block.config.id}
            orchestrator={orchestrator}
            title={block.config.title}
            heightClass="h-[250px]"
          >
            {(data) => (
              <div className="w-full h-full flex items-center justify-center bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-xs font-medium text-slate-400">
                  [Render {block.config.type} chart with {data.length} points]
                </span>
              </div>
            )}
          </ProgressiveChart>
        </div>
      );

    case "table":
      const headers = block.data.length > 0 ? Object.keys(block.data[0]) : [];
      return (
        <div className="w-full overflow-auto rounded-md border border-slate-200 my-3 text-sm animate-in fade-in duration-500">
          <table className="w-full text-left bg-white">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>{headers.map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {block.data.map((row, i) => (
                <tr key={i}>
                  {headers.map(h => <td key={h} className="px-3 py-2 text-slate-700">{row[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "explanation":
      return (
        <div className="text-sm text-slate-700 leading-relaxed my-2">
          {block.text}
        </div>
      );
    
    default:
      return null;
  }
};

// -----------------------------------------------------------------------------
// Types & Main Component
// -----------------------------------------------------------------------------

type Message = {
  id: string;
  role: "user" | "ai";
  content?: string; // For simple user text
  blocks?: AIResponseBlock[]; // For structured AI UI
};

interface OmniscientScratchpadProps {
  activeConnector: string;
  orchestrator: ChartOrchestrator;
  initialContext?: string;
}

export const OmniscientScratchpad: React.FC<OmniscientScratchpadProps> = ({
  activeConnector,
  orchestrator,
  initialContext
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialContext || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    try {
      // 1. Build Context (In a real app, gather visible KPIs/Charts here)
      const contextPayload = AIMapper.buildContextSnapshot(activeConnector, [], []);

      // 2. Call your actual backend orchestration route
      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage.content, context: contextPayload }),
      });

      const rawJsonText = await response.text();
      
      // 3. Parse JSON into Deterministic UI Blocks
      const aiResponse: AIResponse = AIMapper.parseResponse(rawJsonText);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        blocks: aiResponse.blocks
      };

      setMessages(prev => [...prev, aiMessage]);

      // If the AI suggested follow-ups, we could store them in state to render as quick-action pills.
    } catch (error) {
      console.error("AI execution failed:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "ai",
        blocks: [{ type: "explanation", text: "I encountered an error processing that request." }]
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/50 border-b border-slate-100">
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Omniscient Scratchpad</h2>
          <p className="text-xs text-slate-500">Query your {activeConnector} data naturally.</p>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-4">
            <Bot className="w-10 h-10 opacity-20" />
            <p className="text-sm max-w-[250px]">
              Ask a question to dynamically generate charts, tables, and insights.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === "user" ? "bg-slate-900 text-white" : "bg-blue-50 text-blue-600 border border-blue-100"
            }`}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>

            {/* Content Area */}
            <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {msg.role === "user" ? (
                <div className="px-4 py-2 bg-slate-900 text-white text-sm rounded-2xl rounded-tr-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="flex flex-col w-full">
                  {msg.blocks?.map((block, i) => (
                    <AIBlockRenderer key={i} block={block} orchestrator={orchestrator} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="flex items-center px-4 py-2 bg-slate-50 rounded-2xl rounded-tl-sm text-xs text-slate-500">
              Analyzing metrics...
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-100">
        <form 
          onSubmit={handleSubmit}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="E.g., Show me MRR churn over the last 30 days..."
            className="w-full pl-4 pr-12 py-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 p-1.5 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-md transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

    </div>
  );
};