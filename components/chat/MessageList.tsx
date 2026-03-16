// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { Message, Attachment } from "@/types/chat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Bot, 
  User, 
  FileSpreadsheet, 
  Paperclip, 
  CheckCircle2, 
  Loader2,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  /**
   * Phase 4.2: Granular Streaming UX
   * An array of status strings emitted by the Orchestrator's SSE pipeline.
   * e.g., ["🔍 Consulting vector semantic memory...", "🚀 Executing parallel scans..."]
   */
  streamingSteps?: string[]; 
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export function MessageList({ messages, isLoading = false, streamingSteps = [] }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive or loading state changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, streamingSteps]);

  return (
    <ScrollArea className="flex-1 w-full p-4 bg-slate-950">
      <div className="space-y-6 max-w-4xl mx-auto pb-4">
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={cn(
              "flex w-full gap-4",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar Profile */}
            <Avatar className={cn(
              "h-8 w-8 flex-shrink-0 border",
              msg.role === "user" 
                ? "bg-blue-600 border-blue-500" 
                : "bg-slate-900 border-slate-700"
            )}>
              <AvatarFallback className="bg-transparent text-white">
                {msg.role === "user" ? <User size={15} /> : <Bot size={15} className="text-emerald-400" />}
              </AvatarFallback>
            </Avatar>

            {/* Message Bubble Container */}
            <div
              className={cn(
                "flex flex-col max-w-[85%] rounded-2xl px-5 py-4 space-y-3 shadow-sm",
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-[#0B1120] text-slate-200 rounded-tl-sm border border-slate-800 shadow-xl"
              )}
            >
              {/* Message Text Content */}
              {msg.content && (
                <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                  {msg.content}
                </div>
              )}

              {/* Attachments Payload */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/50">
                  {msg.attachments.map((file: Attachment, idx: number) => (
                    <div
                      key={file.id || idx}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg text-xs border transition-colors",
                        msg.role === "user" 
                          ? "bg-blue-700/50 border-blue-500 hover:bg-blue-700"
                          : "bg-slate-900 border-slate-700 hover:bg-slate-800"
                      )}
                    >
                      {/* Smart icon mapping based on file type */}
                      {file.file?.name?.match(/\.(csv|xlsx?|parquet)$/i) ? (
                        <FileSpreadsheet size={14} className={msg.role === "user" ? "text-blue-200" : "text-emerald-400"} />
                      ) : (
                        <Paperclip size={14} className="text-slate-400" />
                      )}
                      <span className="truncate max-w-[150px] font-medium">
                        {file.file?.name || "Dataset"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Phase 4.2: Psychological Speed Loading Indicator */}
        {isLoading && (
          <div className="flex w-full gap-4 flex-row">
            <Avatar className="h-8 w-8 bg-slate-900 border border-slate-700 flex-shrink-0">
              <AvatarFallback className="bg-transparent text-emerald-400">
                <Bot size={15} />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-[300px] max-w-[80%] rounded-2xl rounded-tl-sm px-5 py-4 bg-[#0B1120] text-slate-200 border border-slate-800 shadow-xl">
              
              {/* If we have granular streaming steps from the Orchestrator, show the sleek terminal log */}
              {streamingSteps && streamingSteps.length > 0 ? (
                <div className="flex flex-col gap-3 font-mono text-[12px]">
                  <div className="flex items-center gap-2 pb-2 mb-1 border-b border-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                    <Activity size={12} className="text-emerald-500 animate-pulse" />
                    Execution Pipeline
                  </div>
                  
                  {streamingSteps.map((step, idx) => {
                    const isLast = idx === streamingSteps.length - 1;
                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-start gap-3 transition-all duration-300", 
                          isLast ? "text-emerald-400 scale-100 opacity-100" : "text-slate-500 scale-95 opacity-60"
                        )}
                      >
                        <div className="mt-[2px] shrink-0">
                          {isLast ? (
                            <Loader2 size={14} className="animate-spin text-emerald-400" />
                          ) : (
                            <CheckCircle2 size={14} className="text-slate-600" />
                          )}
                        </div>
                        <span className={cn(isLast && "animate-pulse font-medium")}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback generic bouncing dots before the first SSE packet arrives */
                <div className="flex space-x-1.5 items-center h-5 px-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"></div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Invisible anchor to control auto-scrolling */}
        <div ref={bottomRef} className="h-4" />
      </div>
    </ScrollArea>
  );
}