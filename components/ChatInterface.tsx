// components/ChatInterface.tsx

"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Code2, AlertCircle } from 'lucide-react';

// Extended Message type to support the SSE Streaming Engine
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: string;
  error?: string;
  sql?: string;
  data?: any[];
  chartSpec?: any;
  executionTimeMs?: number;
}

interface ChatInterfaceProps {
  agentId: string;
}

/**
 * ARCLI.TECH - Interaction Layer
 * Upgraded for Phase 3: SSE Streaming & Grounded Intelligence
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({ agentId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive or stream updates
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
      content: '', // Will be progressively populated by SSE tokens
      status: 'Initializing...'
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

      // 3. Initiate the Streaming Connection (Phase 3: Semantic Router Endpoint)
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          message: userMessage.content,
          history: history
          // Note: Memory boundary IDs are intentionally omitted. 
          // The backend strictly enforces the 1-to-1 tethering from the database.
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to connect to the intelligence engine.');
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
            const dataStr = part.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            
            try {
              const packet = JSON.parse(dataStr);

              // 5. Progressively update the specific assistant message
              setMessages((prev) => prev.map(msg => {
                if (msg.id !== assistantId) return msg;

                const updatedMsg = { ...msg };
                
                switch (packet.type) {
                  case 'status':
                    updatedMsg.status = packet.message;
                    break;
                  case 'sql_generated':
                    updatedMsg.sql = packet.sql;
                    break;
                  case 'data_fetched':
                    updatedMsg.data = packet.data;
                    updatedMsg.chartSpec = packet.chart;
                    break;
                  case 'token':
                    // Progressive Text Streaming
                    updatedMsg.content += packet.content;
                    break;
                  case 'done':
                    updatedMsg.executionTimeMs = packet.execution_time_ms;
                    updatedMsg.status = 'Complete';
                    break;
                  case 'error':
                    updatedMsg.status = 'Error';
                    updatedMsg.error = packet.message;
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
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 my-4 relative">
      
      {/* Header */}
      <div className="bg-white px-8 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 tracking-tight text-lg">Grounded Intelligence</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Secure 1-to-1 Data Environment</p>
          </div>
        </div>
      </div>

      {/* Chat History Canvas */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth bg-[#fafafa]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 animate-in fade-in duration-700 max-w-lg mx-auto text-center">
            <div className="w-16 h-16 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center text-blue-600 mb-2">
              <Sparkles size={28} />
            </div>
            <p className="text-xl font-bold text-slate-800 tracking-tight">How can I help you analyze your data?</p>
            <div className="flex flex-col gap-3 w-full">
              <button onClick={() => setInput("Show me revenue trends for the last 30 days")} className="text-sm bg-white hover:border-blue-300 hover:shadow-md text-slate-700 text-left px-5 py-4 rounded-2xl shadow-sm border border-gray-200 transition-all font-medium">
                "Show me revenue trends for the last 30 days"
              </button>
              <button onClick={() => setInput("Identify anomalies in our ad spend this week")} className="text-sm bg-white hover:border-blue-300 hover:shadow-md text-slate-700 text-left px-5 py-4 rounded-2xl shadow-sm border border-gray-200 transition-all font-medium">
                "Identify anomalies in our ad spend this week"
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col mb-8 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-6 py-4 rounded-3xl max-w-[85%] ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none shadow-lg shadow-blue-500/20' 
                  : 'bg-white border border-gray-100 text-slate-900 rounded-bl-none shadow-sm'
              }`}>
                
                {/* Status Indicator for Assistant */}
                {msg.role === 'assistant' && msg.status && msg.status !== 'Complete' && msg.status !== 'Error' && (
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-3 bg-blue-50 w-fit px-3 py-1.5 rounded-full border border-blue-100">
                    <Loader2 size={14} className="animate-spin" /> {msg.status}
                  </div>
                )}

                {/* Progressive Text Content */}
                {msg.content && (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content}
                  </p>
                )}

                {/* Expandable SQL Code Block */}
                {msg.sql && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      <Code2 size={14} /> Compiled Query
                    </div>
                    <div className="p-4 bg-slate-900 text-slate-300 text-xs rounded-xl font-mono overflow-x-auto shadow-inner leading-relaxed">
                      {msg.sql}
                    </div>
                  </div>
                )}

                {/* Error State */}
                {msg.error && (
                  <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-xl flex items-start gap-2 border border-red-100">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p className="font-medium leading-relaxed">{msg.error}</p>
                  </div>
                )}
                
                {/* Execution Timing */}
                {msg.executionTimeMs && (
                  <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles size={10} /> Computed in {msg.executionTimeMs}ms
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        
        <div ref={endOfMessagesRef} className="h-4" />
      </div>

      {/* User Input Area */}
      <div className="p-6 bg-white border-t border-gray-100 shrink-0 z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        <form onSubmit={handleSend} className="relative flex items-center max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your connected schema..."
            className="w-full pl-6 pr-16 py-4 bg-slate-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-[15px] shadow-inner text-slate-900 font-medium placeholder:text-slate-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-all shadow-md shadow-blue-500/20 flex items-center justify-center"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className={input.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />}
          </button>
        </form>
      </div>
    </div>
  );
};