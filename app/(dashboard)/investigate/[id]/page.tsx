'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { 
  ArrowLeft, AlertTriangle, TrendingDown, TrendingUp, 
  Activity, MessageSquare, BrainCircuit, Database, LineChart 
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Interfaces (Aligned with Phase 1 backend models: InvestigationRecord)
// -----------------------------------------------------------------------------
interface AnomalyState {
  id: string;
  metric: string;
  agent_name: string;
  agent_id?: string;
  dataset_id?: string | null;
  created_at: string;
  temporal_context: string; // Maps to `headline`
  root_cause: string;       // Maps to `executive_summary`
  forecast: string;         // Maps to `recommended_action`
  variance_pct: number;     // Extracted from payload if available
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  sql_used?: string;
}

export default function InvestigationDashboard() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const anomalyId = params.id as string;

  const [anomaly, setAnomaly] = useState<AnomalyState | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Localized Deep-Dive State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);

  // 1. Fetch the Anomaly State from the Postgres Memory Endpoint
  useEffect(() => {
    let isMounted = true;

    const fetchAnomaly = async () => {
      try {
        const response = await fetch(`/api/insights/${anomalyId}/read`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch the investigation record from the database.');
        }

        const data = await response.json();

        if (isMounted) {
          const inferredDatasetId = data.dataset_id || data.payload?.dataset_id || data.payload?.datasetId || null;

          // Map the database `InvestigationRecord` schema to the UI AnomalyState
          setAnomaly({
            id: data.id || anomalyId,
            metric: data.metric_column || data.metric_name || 'Governed Metric',
            agent_name: data.agent?.name || 'Autonomous Watchdog',
            agent_id: data.agent?.id || data.agent_id || undefined,
            dataset_id: inferredDatasetId,
            created_at: data.created_at || new Date().toISOString(),
            variance_pct: data.payload?.variance_pct || data.impact_score || 0,
            temporal_context: data.headline || 'Anomaly context retrieved successfully.',
            root_cause: data.executive_summary || data.description || 'Analyzing primary drivers...',
            forecast: data.recommended_action || 'Review the data points below to take action.'
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('Data Hydration Error:', error);
        if (isMounted) {
          toast({
            title: "Fetch Failed",
            description: "Unable to load the anomaly diagnostic record.",
            variant: "destructive"
          });
          setLoading(false);
        }
      }
    };

    fetchAnomaly();

    return () => {
      isMounted = false;
    };
  }, [anomalyId, toast]);

  // 2. The Deep-Dive Execution Loop (Talk to DuckDB & Orchestrator)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg: ChatMessage = { role: 'user', content: inputMessage.trim() };
    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
    setIsQuerying(true);

    try {
      const datasetIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const scopedDatasetId = anomaly?.dataset_id && datasetIdRegex.test(anomaly.dataset_id)
        ? anomaly.dataset_id
        : undefined;

      // Send the analytical intent directly to the Semantic Router / Orchestrator
      const res = await fetch('/api/chat/orchestrate', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: newMsg.content, 
          agent_id: anomaly?.agent_id,
          active_dataset_ids: scopedDatasetId ? [scopedDatasetId] : undefined,
          contextId: anomalyId,
          history: messages.slice(-4) // Pass sliding window of context
        }) 
      });

      if (!res.ok) {
        throw new Error(`Orchestrator responded with status: ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev, 
        { 
          role: 'agent', 
          content: data.reply || data.content || 'Data retrieved successfully.',
          sql_used: data.sql_used || data.query 
        }
      ]);
    } catch (error) {
      console.error("Execution Engine Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: 'I encountered an error executing that deep dive against the analytical warehouse. Please try rephrasing your query or checking your compute budget.'
        }
      ]);
      toast({
        title: "Execution Error",
        description: "The Semantic Router failed to compile the query.",
        variant: "destructive"
      });
    } finally {
      setIsQuerying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-slate-50/50">
        <div className="animate-pulse flex flex-col items-center gap-5">
          <div className="p-4 bg-blue-600/10 rounded-2xl border border-blue-600/20">
            <BrainCircuit className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
          <p className="text-slate-500 font-semibold tracking-wider uppercase text-xs">Hydrating Diagnostics...</p>
        </div>
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <Database className="h-12 w-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Anomaly Not Found</h2>
          <p className="text-slate-500 text-sm">The investigation record may have been deleted or expired.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  const isDrop = anomaly.variance_pct < 0;

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#fafafa] p-6 lg:p-10 space-y-6">
      {/* Top Navigation & Status */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200/60">
        <div className="flex items-center gap-5">
          <Button variant="outline" size="icon" className="rounded-xl border-gray-200 hover:bg-white shadow-sm" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
              <div className={`p-2 rounded-lg shadow-sm ${isDrop ? 'bg-red-50 border border-red-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                <AlertTriangle className={`h-5 w-5 ${isDrop ? 'text-red-600' : 'text-emerald-600'}`} />
              </div>
              Incident Investigation
            </h1>
            <p className="text-slate-500 font-medium text-sm mt-1 flex items-center gap-2">
              <BrainCircuit className="w-3.5 h-3.5" /> 
              Captured by <span className="font-bold text-slate-700">{anomaly.agent_name}</span> at {new Date(anomaly.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        
        {/* Render variance badge safely only if it exists */}
        {anomaly.variance_pct !== 0 && (
          <Badge variant={isDrop ? "destructive" : "default"} className={`text-base py-1.5 px-4 shadow-sm font-bold ${isDrop ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {isDrop ? <TrendingDown className="mr-2 h-4 w-4" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            {Math.abs(anomaly.variance_pct)}% Variance
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left Column: The AI Supervisor Report */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-gray-200 shadow-md shadow-slate-200/20 rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-900 pb-5 pt-6 border-b border-slate-800">
              <CardTitle className="flex items-center gap-2 text-lg text-white font-bold">
                <BrainCircuit className="h-5 w-5 text-blue-400" />
                Diagnostic Trace
              </CardTitle>
              <CardDescription className="text-slate-400 font-medium text-xs tracking-wider uppercase">
                Synthesized by Multi-Agent Supervisor
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-7">
              
              {/* Phase 1/3: Deep Memory Context mapped to UI */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-slate-500">
                  <Activity className="h-3.5 w-3.5 text-blue-500" />
                  TL;DR / Timeline
                </h3>
                <p className="text-sm text-slate-800 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl shadow-inner">
                  {anomaly.temporal_context}
                </p>
              </div>

              <Separator className="bg-slate-100" />

              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-slate-500">
                  <Database className="h-3.5 w-3.5 text-indigo-500" />
                  Executive Summary
                </h3>
                <p className="text-sm text-slate-800 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl shadow-inner">
                  {anomaly.root_cause}
                </p>
              </div>

              <Separator className="bg-slate-100" />

              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-slate-500">
                  <LineChart className="h-3.5 w-3.5 text-emerald-500" />
                  Recommended Action
                </h3>
                <p className="text-sm text-slate-800 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl shadow-inner">
                  {anomaly.forecast}
                </p>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Right Column: Deep Dive Chat (NL2SQL Interface) */}
        <div className="lg:col-span-2 flex flex-col">
          <Card className="flex flex-col flex-1 border-gray-200 shadow-md shadow-slate-200/20 rounded-2xl bg-white overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-white pb-4 pt-5 px-6 shrink-0">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <MessageSquare className="h-4 w-4" />
                </div>
                Deep Dive Console
              </CardTitle>
              <CardDescription className="text-slate-500 font-medium">
                Ask the agent to execute specific DuckDB queries to break down this incident.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="flex-1 p-0 flex flex-col h-[550px] bg-slate-50/50">
              <ScrollArea className="flex-1 p-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 mt-24">
                    <div className="w-16 h-16 bg-white border border-gray-200 shadow-sm rounded-2xl flex items-center justify-center">
                      <Database className="h-8 w-8 text-blue-600/50" />
                    </div>
                    <p className="text-sm font-medium text-center max-w-sm leading-relaxed">
                      Need raw data? Ask the agent to pull specific rows, group by different dimensions, or verify the underlying Parquet files.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-slate-800 rounded-bl-none'}`}>
                          <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</p>
                          
                          {/* Code Block for SQL Evidence */}
                          {msg.sql_used && (
                            <div className="mt-4 pt-4 border-t border-slate-200/50">
                              <span className="text-[10px] font-bold tracking-widest uppercase opacity-60 block mb-2 font-mono flex items-center gap-1.5">
                                Compiled Execution Plan
                              </span>
                              <div className="bg-slate-900 p-3 rounded-xl shadow-inner overflow-x-auto">
                                <code className="text-xs font-mono text-emerald-400 block whitespace-pre-wrap">
                                  {msg.sql_used}
                                </code>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isQuerying && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-none p-4 flex items-center gap-3">
                          <BrainCircuit className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm font-semibold text-slate-500">Routing to DuckDB execution engine...</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
              
              <div className="p-5 border-t border-gray-100 bg-white shrink-0">
                <form onSubmit={handleSendMessage} className="flex gap-3">
                  <Input 
                    placeholder="e.g., 'Show me the raw rows for the users that caused this drop...'" 
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isQuerying}
                    className="flex-1 bg-slate-50 border-gray-200 focus-visible:ring-blue-600/20 py-6 text-[15px] font-medium shadow-inner rounded-xl"
                  />
                  <Button 
                    type="submit" 
                    disabled={isQuerying || !inputMessage.trim()}
                    className="py-6 px-6 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20"
                  >
                    Analyze
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}