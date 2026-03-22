// components/ChatInterface.tsx

"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Database, FileText } from 'lucide-react';

// Extended Message type to support the new Hybrid Engine payloads
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: string;
  error?: string;
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
  data?: any[];
  chartSpec?: any;
  executionTimeMs?: number;
}

interface ChatInterfaceProps {
  agentId: string;
  // Passing the active context from the parent Orchestrator/FileUploadZone
  activeDatasetIds?: string[];
  activeDocumentIds?: string[];
}

/**
 * ARCLI.TECH - Interaction Layer
 * Upgraded for Phase 8: Hybrid Streaming Engine (DuckDB + Qdrant RAG)
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  agentId, 
  activeDatasetIds = [], 
  activeDocumentIds = [] 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive
  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    // 1. Optimistic UI Update for User
    const userMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: input.trim() 
    };
    
    // 2. Placeholder for Streaming Assistant Response
    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'Connecting to Hybrid Engine...'
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build contextual history (sliding window of last 5 messages)
      const history = messages.slice(-5).map(m => ({ 
        role: m.role === 'user' ? 'user' : 'assistant', 
        content: m.content 
      }));

      // 3. Initiate the Streaming Connection
      const response = await fetch('/api/chat/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: userMessage.content,
          history: history,
          active_dataset_ids: activeDatasetIds,
          active_document_ids: activeDocumentIds
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to connect to the Orchestration API.');
      }

      // 4. Server-Sent Events (SSE) Reader Loop
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        
        // Keep the last chunk if it's incomplete
        buffer = parts.pop() || ""; 

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const dataStr = part.slice(6);
            if (dataStr.trim() === '[DONE]') continue;
            
            try {
              const packet = JSON.parse(dataStr);

              // 5. Progressively update the specific assistant message
              setMessages((prev) => prev.map(msg => {
                if (msg.id !== assistantId) return msg;

                const updatedMsg = { ...msg };
                
                switch (packet.type) {
                  case 'status':
                    updatedMsg.status = packet.content;
                    break;
                  case 'plan':
                    updatedMsg.plan = packet.content;
                    break;
                  case 'sql':
                    updatedMsg.sql = packet.content;
                    break;
                  case 'insights':
                    updatedMsg.insights = packet.content;
                    break;
                  case 'diagnostics':
                    updatedMsg.diagnostics = packet.content;
                    break;
                  case 'narrative':
                    // Append or set the generated text
                    updatedMsg.content = packet.content.executive_summary || packet.content;
                    break;
                  case 'data':
                    updatedMsg.data = packet.content.data;
                    updatedMsg.chartSpec = packet.content.chart_spec;
                    updatedMsg.executionTimeMs = packet.content.execution_time_ms;
                    updatedMsg.status = 'Complete';
                    break;
                  case 'error':
                    updatedMsg.status = 'Error';
                    updatedMsg.error = packet.content;
                    break;
                }
                
                return updatedMsg;
              }));
            } catch (err) {
              console.error("Error parsing stream packet:", err);
            }
          }
        }
      }

    } catch (error: any) {
      setMessages((prev) => prev.map(msg => 
        msg.id === assistantId 
          ? { ...msg, status: 'Error', error: error.message || 'Connection lost.' } 
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto bg-gray-50 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 my-4 relative">
      
      {/* Header / Branding & Active Context Indicators */}
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 tracking-tight">Hybrid Intelligence</h2>
            <p className="text-xs text-gray-500 font-medium">DuckDB + Vector RAG Engine</p>
          </div>
        </div>
        
        {/* Dynamic Context Status */}
        <div className="flex gap-3 text-xs font-medium text-gray-500">
          {activeDatasetIds.length > 0 && (
            <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-100">
              <Database size={12} /> {activeDatasetIds.length} Datasets
            </span>
          )}
          {activeDocumentIds.length > 0 && (
            <span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md border border-purple-100">
              <FileText size={12} /> {activeDocumentIds.length} Documents
            </span>
          )}
        </div>
      </div>

      {/* Chat History Canvas */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 animate-in fade-in duration-700">
            <p className="text-lg font-medium text-gray-500">How can I help you analyze your data today?</p>
            <div className="flex flex-col gap-2 mt-4 w-full max-w-md">
              <button onClick={() => setInput("Show me revenue trends for the last 30 days")} className="text-sm bg-white hover:bg-gray-50 text-left px-4 py-3 rounded-xl shadow-sm border border-gray-100 transition-colors">
                📊 "Show me revenue trends for the last 30 days"
              </button>
              <button onClick={() => setInput("Summarize the main policies in my uploaded PDF")} className="text-sm bg-white hover:bg-gray-50 text-left px-4 py-3 rounded-xl shadow-sm border border-gray-100 transition-colors">
                📄 "Summarize the main policies in my uploaded PDF"
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            // Note: Ensure your MessageBubble component maps the new fields (status, plan, sql) cleanly!
            <div key={msg.id} className={`flex flex-col mb-6 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-5 py-3.5 rounded-2xl max-w-[85%] ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none shadow-md' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
              }`}>
                {msg.content ? (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : msg.status && msg.status !== 'Complete' ? (
                  <div className="flex items-center gap-2 text-blue-600 font-medium text-sm">
                    <Loader2 size={16} className="animate-spin" /> {msg.status}
                  </div>
                ) : null}

                {/* Optional UI expansions for rendering the streamed data */}
                {msg.error && <p className="text-red-500 text-sm mt-2 flex items-center gap-1.5 font-medium">⚠️ {msg.error}</p>}
                {msg.sql && <div className="mt-3 p-3 bg-gray-900 text-gray-300 text-xs rounded-lg font-mono overflow-x-auto">{msg.sql}</div>}
              </div>
            </div>
          ))
        )}
        
        <div ref={endOfMessagesRef} className="h-4" />
      </div>

      {/* User Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your connected data or documents..."
            className="w-full pl-6 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-sm flex items-center justify-center"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className={input.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />}
          </button>
        </form>
      </div>
    </div>
  );
};