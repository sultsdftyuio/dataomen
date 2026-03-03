"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataPreview } from './DataPreview';
import { DynamicChartFactory } from './DynamicChartFactory';
import { FileUploadZone } from '../ingestion/FileUploadZone';
import { Bot, Send, Settings, TerminalSquare, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { createBrowserClient } from '@supabase/ssr';
import axios from 'axios';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

interface ChartConfig {
  type: "bar" | "line" | "scatter" | "area" | "pie";
  xKey: string;
  yKeys: string[];
  data: any[];
}

// 1. Strict Type Safety: Use Named Export to resolve the missing member error
export function DashboardOrchestrator() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'assistant', content: 'Hello! Please upload a dataset to begin our analysis.' }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 2. Orchestration Layer: Centralized state for analytical context
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [globalFilters, setGlobalFilters] = useState<Record<string, string>>({});

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Auto-scroll chat to bottom smoothly
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleUploadSuccess = (fileId: string) => {
    setActiveFileId(fileId);
    setMessages(prev => [
      ...prev,
      { 
        id: Date.now().toString(), 
        role: 'assistant', 
        content: `Dataset ingested successfully. You can now ask me to analyze it, detect anomalies, or generate charts.` 
      }
    ]);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      if (!activeFileId) {
        throw new Error("Please upload a dataset first.");
      }

      // Analytical Efficiency: Route through semantic processing
      const response = await axios.post('/api/query', {
        query: userMessage.content,
        file_id: activeFileId
      });

      const data = response.data;
      
      const assistantMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: data.narrative || "Analysis complete."
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If the LLM determines a chart is mathematically optimal, update the visual canvas
      if (data.chart_config) {
        setChartConfig({
          type: data.chart_config.type,
          xKey: data.chart_config.xKey,
          yKeys: data.chart_config.yKeys,
          data: data.chart_config.data || data.data || []
        });
      }

    } catch (error: any) {
      console.error('Query Error:', error);
      setMessages(prev => [
        ...prev, 
        { 
          id: (Date.now() + 1).toString(), 
          role: 'assistant', 
          content: error.response?.data?.detail || error.message || "Failed to process query.",
          isError: true 
        }
      ]);
      toast.error('Query Execution Failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      
      {/* Left Panel: Chat Interface */}
      <div className="w-1/3 border-r flex flex-col bg-card/50">
        <div className="p-4 border-b bg-card flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm">AI Copilot</h2>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] px-4 py-2 rounded-lg text-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-br-none' 
                      : msg.isError 
                        ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-none'
                        : 'bg-muted rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start">
                <div className="bg-muted px-4 py-3 rounded-lg rounded-bl-none flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Analyzing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 bg-card border-t">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data..." 
              className="flex-1"
              disabled={isProcessing}
            />
            <Button type="submit" size="icon" disabled={isProcessing || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right Panel: Data Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-card">
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <TerminalSquare className="w-5 h-5 text-muted-foreground" />
            Analytical Canvas
          </h1>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Options
          </Button>
        </div>

        <ScrollArea className="flex-1 p-6 bg-muted/10">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Phase 1: Ingestion Layer */}
            {!activeFileId && (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <FileUploadZone onUploadSuccess={handleUploadSuccess} />
               </div>
            )}

            {/* Phase 2: Visual Computation Layer */}
            {activeFileId && chartConfig && chartConfig.data && chartConfig.data.length > 0 && (
              <div className="p-6 border rounded-xl bg-card shadow-sm animate-in fade-in duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Generated Visualization</h3>
                  <Button variant="ghost" size="icon" onClick={() => setChartConfig(null)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                {/* Dynamically renders via our functional chart factory */}
                <DynamicChartFactory 
                  type={chartConfig.type}
                  xKey={chartConfig.xKey}
                  yKeys={chartConfig.yKeys}
                  data={chartConfig.data}
                  globalFilters={globalFilters}
                  fileId={activeFileId}
                />
              </div>
            )}

            {/* Phase 3: Raw Data Fragment Layer */}
            {activeFileId && (
              <div className="animate-in fade-in duration-700">
                <DataPreview fileId={activeFileId} />
              </div>
            )}

          </div>
        </ScrollArea>
      </div>
    </div>
  );
}