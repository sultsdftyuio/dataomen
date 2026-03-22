// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { Message } from "@/types/chat";
import { MessageBubble } from "@/components/MessageBubble"; // Ensure path matches your structure
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Sparkles, TrendingUp } from "lucide-react";

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
    <ScrollArea className="flex-1 w-full bg-gray-50/30">
      <div className="max-w-4xl mx-auto p-4 md:p-6 pb-8 w-full">
        
        {/* --- EMPTY / WELCOME STATE --- */}
        {messages.length === 0 ? (
          <div className="h-[65vh] flex flex-col items-center justify-center text-gray-400 space-y-6 animate-in fade-in zoom-in-95 duration-700 px-4">
            
            <div className="w-14 h-14 bg-blue-100/80 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-2 border border-blue-200/50">
              <Sparkles size={28} />
            </div>
            
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Hybrid AI Copilot</h2>
              <p className="text-[15px] font-medium text-gray-500 max-w-md mx-auto leading-relaxed">
                Upload CSVs, Parquet files, or PDFs, and ask complex analytical questions across your structured and unstructured data.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-lg mt-8">
              <button 
                onClick={() => onSuggestionClick("Show me revenue trends for the last 30 days")} 
                className="group bg-white hover:bg-gray-50 text-left p-4 rounded-2xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-4 text-gray-700"
              >
                <div className="p-2.5 bg-emerald-100/80 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                  <TrendingUp size={20} />
                </div>
                <span className="font-medium text-[15px]">"Show me revenue trends for the last 30 days"</span>
              </button>
              
              <button 
                onClick={() => onSuggestionClick("Summarize the main policies in my uploaded PDF")} 
                className="group bg-white hover:bg-gray-50 text-left p-4 rounded-2xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-4 text-gray-700"
              >
                <div className="p-2.5 bg-purple-100/80 text-purple-600 rounded-xl group-hover:scale-110 transition-transform">
                  <FileText size={20} />
                </div>
                <span className="font-medium text-[15px]">"Summarize the main policies in my uploaded PDF"</span>
              </button>
            </div>
            
          </div>
        ) : (
          /* --- MESSAGE THREAD --- */
          <div className="space-y-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}

        {/* Invisible anchor to control auto-scrolling */}
        <div ref={bottomRef} className="h-4 w-full" />
      </div>
    </ScrollArea>
  );
}