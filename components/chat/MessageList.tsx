// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { Message, Attachment } from "@/types/chat"; // FIX 1: Correctly import domain types
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, FileSpreadsheet, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive or loading state changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  return (
    <ScrollArea className="flex-1 w-full p-4">
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
              "h-8 w-8 flex-shrink-0",
              msg.role === "user" ? "bg-primary" : "bg-muted"
            )}>
              <AvatarFallback className={msg.role === "user" ? "bg-primary text-primary-foreground" : ""}>
                {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </AvatarFallback>
            </Avatar>

            {/* Message Bubble Container */}
            <div
              className={cn(
                "flex flex-col max-w-[80%] rounded-xl px-4 py-3 space-y-2 shadow-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-none"
                  : "bg-muted text-foreground rounded-tl-none border border-border"
              )}
            >
              {/* Message Text Content */}
              {msg.content && (
                <div className="whitespace-pre-wrap break-words text-sm">
                  {msg.content}
                </div>
              )}

              {/* Attachments Payload */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {/* FIX 2: Explicitly typing map parameters to avoid implicit 'any' */}
                  {msg.attachments.map((file: Attachment, idx: number) => (
                    <div
                      key={file.id || idx}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md text-xs border",
                        msg.role === "user" 
                          ? "bg-primary-foreground/10 border-primary-foreground/20"
                          : "bg-background border-border"
                      )}
                    >
                      {/* Smart icon mapping based on file type */}
                      {file.file?.name?.match(/\.(csv|xlsx?)$/i) ? (
                        <FileSpreadsheet size={14} />
                      ) : (
                        <Paperclip size={14} />
                      )}
                      <span className="truncate max-w-[150px] font-medium">
                        {file.file?.name || "Attachment"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex w-full gap-4 flex-row">
            <Avatar className="h-8 w-8 bg-muted flex-shrink-0">
              <AvatarFallback>
                <Bot size={16} />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col max-w-[80%] rounded-xl rounded-tl-none px-4 py-3 bg-muted text-foreground border border-border">
              <div className="flex space-x-1 items-center h-5">
                <div className="w-2 h-2 rounded-full bg-foreground/50 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 rounded-full bg-foreground/50 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 rounded-full bg-foreground/50 animate-bounce"></div>
              </div>
            </div>
          </div>
        )}
        {/* Invisible anchor to control auto-scrolling */}
        <div ref={bottomRef} className="h-1" />
      </div>
    </ScrollArea>
  );
}