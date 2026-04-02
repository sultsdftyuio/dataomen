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
    <ScrollArea className="flex-1 w-full bg-[#fafafa]">
      <div className="max-w-4xl mx-auto p-6 pb-24 w-full">
        
        {/* --- EMPTY / WELCOME STATE --- */}
        {messages.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500 px-4">
            
            <div className="w-14 h-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <Zap size={24} className="text-blue-600" />
            </div>
            
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Hybrid AI Copilot</h2>
              <p className="text-[15px] font-medium text-slate-500 max-w-md mx-auto leading-relaxed">
                Upload CSVs, Parquet files, or PDFs, and ask complex analytical questions across your structured and unstructured data.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xl mx-auto">
              <button 
                onClick={() => onSuggestionClick("Show me revenue trends for the last 30 days")} 
                className="group bg-white hover:bg-slate-50 text-left p-4 rounded-2xl shadow-sm border border-gray-200/80 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all flex items-center gap-4 text-slate-700"
              >
                <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl group-hover:scale-110 transition-transform shadow-sm shrink-0">
                  <TrendingUp size={20} />
                </div>
                <span className="font-bold text-[14px] group-hover:text-blue-600 transition-colors">
                  Show me revenue trends for the last 30 days
                </span>
              </button>
              
              <button 
                onClick={() => onSuggestionClick("Summarize the main policies in my uploaded PDF")} 
                className="group bg-white hover:bg-slate-50 text-left p-4 rounded-2xl shadow-sm border border-gray-200/80 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all flex items-center gap-4 text-slate-700"
              >
                <div className="p-2.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-xl group-hover:scale-110 transition-transform shadow-sm shrink-0">
                  <FileText size={20} />
                </div>
                <span className="font-bold text-[14px] group-hover:text-blue-600 transition-colors">
                  Summarize the main policies in my uploaded PDF
                </span>
              </button>
            </div>
            
          </div>
        ) : (
          /* --- MESSAGE THREAD --- */
          <div className="flex flex-col gap-8">
            {messages.map((msg) => (
              <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
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