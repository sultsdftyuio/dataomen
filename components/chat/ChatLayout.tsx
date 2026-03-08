// components/chat/ChatLayout.tsx
"use client";

import { useState, useCallback, DragEvent, useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ChatMessage, Attachment } from "@/types/chat";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner"; 

interface ChatLayoutProps {
  agentId?: string; // Preserve your existing agent logic
  initialMessages?: ChatMessage[]; // If you fetch history on the server or parent
}

export function ChatLayout({ agentId, initialMessages = [] }: ChatLayoutProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  // ---------------------------------------------------------------------------
  // Global Drag & Drop Logistics (UI Feature)
  // ---------------------------------------------------------------------------
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const newAttachments: Attachment[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending",
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
      }));
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Phase 2: Ingestion Pipeline & Chat Integration
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!text.trim() && attachments.length === 0) return;

    // 1. Construct Optimistic User Message
    const userMessageId = crypto.randomUUID();
    const newMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: text,
      attachments: attachments,
      status: attachments.length > 0 ? "uploading" : "executing",
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setPendingAttachments([]); // Reset input
    setIsLoading(true);

    try {
      // 2. Get Auth Session (Supabase JWT used for backend verification)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized: Please log in again.");

      const activeContextMetadata = [];

      // 3. Process Attachments via Direct-to-Object Pipeline
      for (const attachment of attachments) {
        updateMessageStatus(userMessageId, "uploading");
        
        // A. Request Presigned URL from Backend
        const presignedRes = await fetch('/api/datasets/presigned-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'X-Tenant-ID': session.user.id // Or grab from user metadata if scoped differently
            },
            body: JSON.stringify({ file_name: attachment.file.name })
        });
        
        if (!presignedRes.ok) throw new Error(`Failed to secure upload link for ${attachment.file.name}`);
        const { upload_url, object_key } = await presignedRes.json();

        // B. Upload Bytes Direct to Cloudflare R2 (Bypassing Vercel API limits)
        const uploadRes = await fetch(upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: attachment.file
        });
        
        if (!uploadRes.ok) throw new Error(`Direct upload failed for ${attachment.file.name}`);

        // C. Trigger DuckDB Parquet Conversion & Profiling worker
        updateMessageStatus(userMessageId, "profiling");
        const processRes = await fetch('/api/datasets/process-file', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'X-Tenant-ID': session.user.id
            },
            body: JSON.stringify({ object_key, dataset_name: attachment.file.name })
        });
        
        if (!processRes.ok) throw new Error(`Data profiling failed for ${attachment.file.name}`);
        const processData = await processRes.json();
        
        // D. Collect the generated schema to feed the LLM Contextual RAG
        activeContextMetadata.push(processData);
      }

      // 4. Semantic Routing & SQL Generation (Hitting the Core Chat Engine)
      updateMessageStatus(userMessageId, "generating_sql");
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          agent_id: agentId,
          message: text,
          // Pass the extracted schema metadata as context, NOT the raw files
          active_datasets: activeContextMetadata 
        })
      });

      if (!response.ok) throw new Error('Failed to send message to Agent.');

      const data = await response.json();

      // 5. Resolve User Message Status
      updateMessageStatus(userMessageId, "complete");

      // 6. Append Assistant Response
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || data.message, 
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

    } catch (error: any) {
      console.error("Chat error:", error);
      updateMessageStatus(userMessageId, "error");
      toast.error(error.message || "Failed to process request. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateMessageStatus = (id: string, status: ChatMessage['status']) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  };

  return (
    <div 
      className="relative flex flex-col h-full w-full overflow-hidden bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Absolute Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg m-4 pointer-events-none animate-in fade-in">
          <div className="flex flex-col items-center p-8 bg-card rounded-2xl shadow-xl">
             <div className="text-2xl font-bold tracking-tight text-primary">Drop to analyze</div>
             <p className="text-muted-foreground mt-2">Data will be securely streamed to your Workspace context.</p>
          </div>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="flex-1 overflow-y-auto scroll-smooth">
        <MessageList messages={messages} />
      </div>

      {/* Unified Omni-Input */}
      <div className="p-4 pt-2 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="max-w-4xl mx-auto">
          <MessageInput 
              onSendMessage={handleSendMessage} 
              pendingAttachments={pendingAttachments}
              setPendingAttachments={setPendingAttachments}
          />
        </div>
      </div>
    </div>
  );
}