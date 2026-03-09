// app/(dashboard)/chat/page.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { 
  Send, 
  Bot, 
  User, 
  Paperclip, 
  Sparkles, 
  Database,
  Loader2,
  TerminalSquare
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

// 1. Type Safety: Strict interfaces for our Chat multi-tenant payload
type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  // Contextual RAG: Metadata tracking what data source the LLM used
  contextUsed?: string[]; 
  isQueryExecution?: boolean;
}

// 2. Initial State
const INITIAL_MESSAGE: Message = {
  id: 'msg_init',
  role: 'assistant',
  content: "Hello. I am your Autonomous Data Department. I have active connections to your PostgreSQL production database and your Stripe billing data. What would you like to analyze today?",
  timestamp: new Date(),
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // 3. Orchestration Integration
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const newUserMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, newUserMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      // Direct call to our backend Orchestration route
      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newUserMessage.content, history: messages }),
      });

      if (!response.ok) throw new Error("Failed to process request");

      const data = await response.json();

      const newAssistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: data.reply || "I've processed your request.",
        timestamp: new Date(),
        contextUsed: data.schemas || [], 
        isQueryExecution: data.isQueryExecution || false,
      }
      
      setMessages(prev => [...prev, newAssistantMessage])
    } catch (error) {
      console.error("Chat Error:", error)
      setMessages(prev => [
        ...prev, 
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: "I encountered an error trying to process that request. Please try again or verify your connection.",
          timestamp: new Date()
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto w-full animate-in fade-in duration-500">
      
      {/* Header Area */}
      <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Data Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask questions in plain English. We'll write the SQL and generate the insights.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
            <Database className="mr-1 h-3 w-3" /> Postgres Connected
          </Badge>
        </div>
      </div>

      {/* Main Chat Log */}
      <ScrollArea className="flex-1 pr-4 py-6" ref={scrollRef}>
        <div className="flex flex-col gap-6 pb-4">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8 shrink-0 border border-primary/20 bg-primary/10">
                  <AvatarFallback><Bot className="h-4 w-4 text-primary" /></AvatarFallback>
                </Avatar>
              )}
              
              <div className={`flex flex-col gap-2 max-w-[85%] sm:max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`rounded-2xl px-5 py-3.5 text-sm shadow-sm leading-relaxed ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                      : 'bg-card border border-border text-foreground rounded-tl-sm'
                  }`}
                >
                  {message.content}
                </div>

                {/* Contextual Meta-Data Tags (Perfectly spaced dynamically) */}
                {message.contextUsed && message.contextUsed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-xs font-medium text-muted-foreground flex items-center">
                      <TerminalSquare className="h-3 w-3 mr-1" /> Source Schema:
                    </span>
                    {message.contextUsed.map(ctx => (
                      <Badge key={ctx} variant="secondary" className="text-[10px] px-2 py-0.5 h-auto bg-muted/80 text-muted-foreground border border-border/50">
                        {ctx}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <Avatar className="h-8 w-8 shrink-0 bg-primary">
                  <AvatarFallback className="text-xs text-primary-foreground font-medium">AD</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2">
              <Avatar className="h-8 w-8 shrink-0 border border-primary/20 bg-primary/10">
                <AvatarFallback><Bot className="h-4 w-4 text-primary" /></AvatarFallback>
              </Avatar>
              <Card className="rounded-2xl rounded-tl-sm px-5 py-4 border border-border shadow-sm flex items-center gap-3 bg-card">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground font-medium">Querying analytical engine...</span>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Omni-Input Area */}
      <div className="pt-4 shrink-0">
        <div className="relative flex items-end gap-2 bg-card border border-border rounded-xl p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-lg text-muted-foreground hover:text-foreground">
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <Textarea
            placeholder="Ask about your MRR, user churn, or upload a dataset..."
            className="min-h-[44px] max-h-32 flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 px-2 py-3 text-sm shadow-none"
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          
          <Button 
            size="icon" 
            className="shrink-0 rounded-lg bg-primary hover:bg-primary/90 transition-all h-10 w-10"
            disabled={!inputValue.trim() || isLoading}
            onClick={handleSendMessage}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-3 font-medium">
          DataOmen AI can make mistakes. Verify critical financial or operational metrics.
        </p>
      </div>
      
    </div>
  )
}