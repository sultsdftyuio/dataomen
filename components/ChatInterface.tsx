// components/ChatInterface.tsx

"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Message, ChatRequestPayload, ChatResponsePayload } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface ChatInterfaceProps {
  agentId: string;
}

/**
 * ARCLI.TECH - Interaction Layer
 * The main orchestrator component for the Zero-ETL AI Assistant.
 * Handles state management, API synchronization, and layout rendering.
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({ agentId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive or loading state changes
  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    // 1. Optimistic UI Update
    const userMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: input.trim() 
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 2. Build contextual history (sliding window of last 5 messages to save tokens)
      const history = messages.slice(-5).map(m => ({ 
        role: m.role === 'user' ? 'user' : 'assistant', 
        content: m.content 
      }));

      const payload: ChatRequestPayload = {
        agent_id: agentId,
        message: userMessage.content,
        history: history
      };

      // Ensure NEXT_PUBLIC_API_URL is configured in your .env.local
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // 3. Execute the Zero-ETL Pipeline
      const response = await fetch(`${apiUrl}/api/chat/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${yourAuthToken}` // Uncomment when adding NextAuth/Supabase JWTs
        },
        body: JSON.stringify(payload)
      });

      const data: ChatResponsePayload & { detail?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to communicate with the Dataomen Engine.');
      }

      // 4. Append the Agent's response payload
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response_text,
        data: data.data,
        chartSpec: data.chart_spec,
        sql: data.generated_sql,
        executionTimeMs: data.execution_time_ms,
        status: data.status as any
      };

      setMessages((prev) => [...prev, agentMessage]);

    } catch (error: any) {
      // 5. Graceful Error Handling
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Connection Error: ${error.message}`,
        status: "error"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto bg-gray-50 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 my-4">
      
      {/* Header / Branding */}
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
          <Sparkles size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-gray-800 tracking-tight">Dataomen Intelligence</h2>
          <p className="text-xs text-gray-500 font-medium">Zero-ETL Analytical Agent</p>
        </div>
      </div>

      {/* Chat History Canvas */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 animate-in fade-in duration-700">
            <p className="text-lg font-medium text-gray-500">How can I help you analyze your data today?</p>
            <p className="text-sm bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
              Try asking: <span className="italic text-gray-600">"Show me Shopify revenue vs Meta Ads spend for the last 30 days"</span>
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start mb-6 animate-in fade-in duration-300">
            <div className="bg-white border border-gray-200 px-5 py-4 rounded-2xl rounded-bl-none flex items-center gap-3 text-gray-500 text-sm shadow-sm">
              <Loader2 className="animate-spin text-blue-500" size={18} />
              <span className="font-medium">Synthesizing execution plan...</span>
            </div>
          </div>
        )}
        
        {/* Invisible div for auto-scrolling anchor */}
        <div ref={endOfMessagesRef} className="h-4" />
      </div>

      {/* User Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your connected sources..."
            className="w-full pl-6 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-sm flex items-center justify-center"
          >
            <Send 
              size={18} 
              className={input.trim() && !isLoading ? "translate-x-0.5 -translate-y-0.5 transition-transform" : "transition-transform"} 
            />
          </button>
        </form>
      </div>
    </div>
  );
};