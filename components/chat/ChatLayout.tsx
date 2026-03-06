// components/chat/ChatLayout.tsx
"use client";

import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { createClient } from "@/utils/supabase/client";

export interface ChatAttachment {
  name: string;
  path: string;
  size: number;
}

export interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  isError?: boolean;
  attachments?: ChatAttachment[];
}

export function ChatLayout({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleSendMessage = async (content: string, files: File[]) => {
    setIsLoading(true);
    let uploadedAttachments: ChatAttachment[] = [];

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) throw new Error("Not authenticated");

      // 1. Upload files to Supabase Storage if present (Modular Data Movement)
      if (files.length > 0) {
        uploadedAttachments = await Promise.all(
          files.map(async (file) => {
            const fileExt = file.name.split(".").pop();
            const filePath = `${session.user.id}/chat-sessions/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            const { data, error } = await supabase.storage
              .from("datasets") // Assuming your standard analytical bucket
              .upload(filePath, file);

            if (error) throw error;
            return { name: file.name, path: data.path, size: file.size };
          })
        );
      }

      // 2. Append User Message instantly with attachment visual metadata
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
        attachments: uploadedAttachments,
      };
      setMessages((prev) => [...prev, userMessage]);

      // 3. Dispatch to Backend Analytical Engine
      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          query: content,
          session_files: uploadedAttachments.map(a => a.path), // Pass paths for DuckDB/RAG injection
        }),
      });

      if (!response.ok) throw new Error("Failed to communicate with analytical engine");

      const data = await response.json();
      
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: data.response || "Task completed successfully.",
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: "System alert: Encountered an anomaly executing your request.",
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4">
      <div className="flex-1 overflow-y-auto min-h-0 bg-transparent mb-4">
        <MessageList messages={messages} isLoading={isLoading} />
      </div>
      <div className="pt-2">
        <MessageInput onSend={handleSendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}