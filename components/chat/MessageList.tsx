// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { Message } from "@/types/chat";
import { MessageBubble } from "@/components/MessageBubble"; // Ensure path matches your structure
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, TrendingUp, Zap } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  onSuggestionClick: (text: string) => void;
}

export function MessageList({ messages, onSuggestionClick }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive or stream updates
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <ScrollArea className="flex-1 w-full bg-slate-50">
      <div className="mx-auto w-full max-w-3xl px-5 pb-32 pt-8 sm:px-6">
        
        {/* --- EMPTY / WELCOME STATE --- */}
        {messages.length === 0 ? (
          <div className="animate-in zoom-in-95 flex min-h-[60vh] flex-col items-center justify-center px-4 text-center fade-in duration-500">
            
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/85 shadow-sm backdrop-blur-sm">
              <Zap size={24} className="text-[#11284b]" />
            </div>
            
            <div className="mb-10 space-y-2 text-center">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Hybrid AI Copilot</h2>
              <p className="text-[15px] font-medium text-slate-500 max-w-md mx-auto leading-relaxed">
                Upload CSVs, Parquet files, or PDFs, and ask complex analytical questions across your structured and unstructured data.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xl mx-auto">
              <button 
                onClick={() => onSuggestionClick("Show me revenue trends for the last 30 days")} 
                className="group flex items-center gap-4 rounded-2xl bg-white/85 p-4 text-left text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50/90 p-2.5 text-emerald-600 shadow-sm transition-transform group-hover:scale-105">
                  <TrendingUp size={20} />
                </div>
                <span className="text-[14px] font-bold transition-colors group-hover:text-[#11284b]">
                  Show me revenue trends for the last 30 days
                </span>
              </button>
              
              <button 
                onClick={() => onSuggestionClick("Summarize the main policies in my uploaded PDF")} 
                className="group flex items-center gap-4 rounded-2xl bg-white/85 p-4 text-left text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="shrink-0 rounded-xl border border-blue-100 bg-blue-50/90 p-2.5 text-[#25436f] shadow-sm transition-transform group-hover:scale-105">
                  <FileText size={20} />
                </div>
                <span className="text-[14px] font-bold transition-colors group-hover:text-[#11284b]">
                  Summarize the main policies in my uploaded PDF
                </span>
              </button>
            </div>
            
          </div>
        ) : (
          /* --- MESSAGE THREAD --- */
          <div className="flex flex-col gap-8">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className="animate-in fade-in slide-in-from-bottom-2 duration-200"
                style={{ animationDelay: `${Math.min(idx, 6) * 24}ms` }}
              >
                <MessageBubble message={msg} />
              </div>
            ))}
          </div>
        )}

        {/* Invisible anchor to control auto-scrolling */}
        <div ref={bottomRef} className="h-4 w-full mt-4" />
      </div>
    </ScrollArea>
  );
}