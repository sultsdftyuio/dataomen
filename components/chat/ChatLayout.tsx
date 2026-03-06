// components/chat/ChatLayout.tsx
"use client";

import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { createClient } from "@/utils/supabase/client";

export interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  isError?: boolean;
}

export function ChatLayout({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) throw new Error("Not authenticated");

      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`, // Inject Auth for tenant routing
        },
        body: JSON.stringify({
          agent_id: agentId,
          query: content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with analytical engine");
      }

      const data = await response.json();
      
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: data.response || "Task completed successfully without narrative.",
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
      <div className="flex-1 overflow-y-auto min-h-0 border rounded-t-xl bg-card text-card-foreground shadow-sm">
        <MessageList messages={messages} isLoading={isLoading} />
      </div>
      <div className="p-4 border-x border-b rounded-b-xl bg-muted/40">
        <MessageInput onSend={handleSendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}