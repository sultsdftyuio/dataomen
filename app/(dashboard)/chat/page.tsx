// app/(dashboard)/chat/page.tsx
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Send, 
  Bot, 
  User, 
  Paperclip, 
  Sparkles, 
  Database,
  Loader2,
  TerminalSquare,
  RefreshCcw,
  AlertCircle
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/components/ui/use-toast"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  contextUsed?: string[]; 
  isQueryExecution?: boolean;
}

const INITIAL_MESSAGE: Message = {
  id: 'msg_init',
  role: 'assistant',
  content: "Hello. I am your Autonomous Data Department. I have active connections to your PostgreSQL production database and your Stripe billing data. What would you like to analyze today?",
  timestamp: new Date(),
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll logic leveraging ScrollArea viewport
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, isLoading])

  // Dynamic textarea height adjustment
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`
    }
  }, [inputValue])

  const handleSendMessage = useCallback(async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || isLoading) return

    const newUserMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, newUserMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      // The Orchestrator expects 'prompt' and stripped 'history'
      const historyContext = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": session?.access_token ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify({ 
          prompt: newUserMessage.content, 
          history: historyContext,
          agent_id: "default-router" 
        }),
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        throw new Error(errPayload.message || "The Analytical Engine encountered a routing error.")
      }

      const data = await response.json()

      const newAssistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        // Support both standard response and narrative results
        content: data.response || data.reply || (data.type === 'error' ? data.message : "Analysis complete."),
        timestamp: new Date(),
        contextUsed: data.schemas || data.contextUsed || [], 
        isQueryExecution: data.route_taken === 'analytical' || !!data.payload
      }
      
      setMessages(prev => [...prev, newAssistantMessage])
    } catch (error: any) {
      console.error("Chat Execution Error:", error)
      toast({
        title: "Execution Error",
        description: error.message,
        variant: "destructive"
      })
      
      setMessages(prev => [
        ...prev, 
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: "I encountered an error trying to process that request. Please verify your data connections or try a different query.",
          timestamp: new Date()
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, messages, isLoading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const clearChat = () => setMessages([INITIAL_MESSAGE])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto w-full animate-in fade-in duration-500">
      
      {/* Header Area */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            Data Assistant
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Hybrid Analytical Engine: SQL Generation & Contextual RAG.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearChat}
            className="text-slate-400 hover:text-slate-100 hidden sm:flex"
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-2" /> Reset
          </Button>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            <Database className="mr-1.5 h-3 w-3" /> Postgres + Stripe Active
          </Badge>
        </div>
      </div>

      {/* Main Chat Log */}
      <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
        <div className="flex flex-col gap-8 py-8">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-emerald-400" />
                </div>
              )}
              
              <div className={`flex flex-col gap-2 max-w-[85%] sm:max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`rounded-2xl px-5 py-3.5 text-sm shadow-md leading-relaxed ${
                    message.role === 'user' 
                      ? 'bg-emerald-600 text-white rounded-tr-sm' 
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {message.content}
                </div>

                {/* Contextual RAG Metadata */}
                {message.contextUsed && message.contextUsed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 animate-in slide-in-from-top-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center">
                      <TerminalSquare className="h-3 w-3 mr-1" /> Engines Involved:
                    </span>
                    {message.contextUsed.map(ctx => (
                      <Badge key={ctx} variant="secondary" className="text-[10px] px-2 py-0 h-4 bg-slate-800 text-slate-400 border-slate-700">
                        {ctx}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2">
              <div className="h-8 w-8 rounded-full border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-emerald-400" />
              </div>
              <Card className="rounded-2xl rounded-tl-sm px-5 py-4 border border-slate-800 shadow-xl flex items-center gap-3 bg-slate-900/50 backdrop-blur-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span className="text-sm text-slate-400 font-medium italic">Synthesizing execution plan...</span>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Omni-Input Area */}
      <div className="pt-4 shrink-0">
        <div className="relative flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl focus-within:border-emerald-500/50 transition-all">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-xl text-slate-500 hover:text-slate-100 hover:bg-slate-800">
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <Textarea
            ref={textareaRef}
            placeholder="Compute MRR churn or query custom datasets..."
            className="min-h-[44px] max-h-32 flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 px-2 py-3 text-sm shadow-none text-slate-200 placeholder:text-slate-600"
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          
          <Button 
            size="icon" 
            className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all h-10 w-10 shadow-lg disabled:opacity-30"
            disabled={!inputValue.trim() || isLoading}
            onClick={handleSendMessage}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-4 font-medium uppercase tracking-widest">
          Secure Tenant Isolation • Vectorized Analytical Execution
        </p>
      </div>
    </div>
  )
}