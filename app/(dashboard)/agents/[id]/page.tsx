'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Bot, 
  BrainCircuit, 
  Activity, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  Search,
  MessageSquare,
  FileText,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Cpu,
  Database
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface AgentDetails {
  id: string;
  name: string;
  role: string;
  description: string;
  role_description?: string;
  temperature?: number;
  schedule?: string;
  status: 'online' | 'analyzing' | 'offline';
  created_at: string;
  datasets_monitored: string[];
  metrics: {
    anomaliesFound: number;
    queriesExecuted: number;
    uptime: string;
  };
}

interface InvestigationRecord {
  id: string;
  timestamp: string;
  metric: string;
  variance_pct: number;
  status: 'resolved' | 'investigating' | 'flagged';
  ai_narrative: string;
  underlying_sql?: string;
}

// -----------------------------------------------------------------------------
// Modular Component: Investigation Timeline Card
// -----------------------------------------------------------------------------
const InvestigationCard = ({ record }: { record: InvestigationRecord }) => {
  const isDrop = record.variance_pct < 0;
  const varianceColor = isDrop ? 'text-rose-600' : 'text-emerald-600';
  const varianceBorder = isDrop ? 'border-rose-200' : 'border-emerald-200';
  const varianceBg = isDrop ? 'bg-rose-50' : 'bg-emerald-50';

  return (
    <Card className="mb-6 border-gray-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all duration-300 bg-white rounded-2xl overflow-hidden group">
      <CardHeader className="pb-4 pt-5 px-6 flex flex-row items-start justify-between border-b border-gray-100 bg-slate-50/50">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className={`font-bold font-mono px-2.5 py-0.5 shadow-sm ${varianceBg} ${varianceBorder} ${varianceColor}`}>
              {isDrop ? <TrendingDown className="mr-1.5 h-3 w-3" /> : <TrendingUp className="mr-1.5 h-3 w-3" />}
              {Math.abs(record.variance_pct)}% Variance
            </Badge>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider flex items-center">
              <Clock className="mr-1.5 h-3 w-3 text-slate-300" />
              {new Date(record.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <CardTitle className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
            {record.metric} Anomaly Detected
          </CardTitle>
        </div>
        <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest shadow-sm ${
          record.status === 'resolved' 
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
            : 'bg-amber-50 text-amber-600 border-amber-200'
        }`}>
          {record.status === 'resolved' ? <CheckCircle2 className="mr-1.5 h-3 w-3" /> : <Search className="mr-1.5 h-3 w-3" />}
          {record.status}
        </Badge>
      </CardHeader>
      
      <CardContent className="pt-5 px-6 pb-6 bg-white">
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 shadow-inner">
          <h4 className="text-[10px] font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-widest">
            <BrainCircuit className="h-3.5 w-3.5 text-blue-500" />
            AI Root Cause Synthesis
          </h4>
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            {record.ai_narrative}
          </p>
        </div>
      </CardContent>

      {record.underlying_sql && (
        <CardFooter className="bg-slate-900 border-t border-slate-800 py-3 px-6">
          <details className="w-full group/code">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-white flex items-center font-mono font-bold tracking-widest uppercase transition-colors select-none">
              <FileText className="h-3.5 w-3.5 mr-2 text-blue-400" />
              View execution trace (SQL)
            </summary>
            <div className="mt-3 p-4 bg-black/50 rounded-xl overflow-x-auto shadow-inner border border-slate-800">
              <code className="text-xs text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed block">
                {record.underlying_sql}
              </code>
            </div>
          </details>
        </CardFooter>
      )}
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Main Page Component
// -----------------------------------------------------------------------------
export default function AgentMemoryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const agentId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 5: Settings State Mutation
  const [isUpdating, setIsUpdating] = useState(false);
  const [temperature, setTemperature] = useState<number[]>([0.0]);
  const [roleDescription, setRoleDescription] = useState("");
  const [schedule, setSchedule] = useState("hourly");

  // ---------------------------------------------------------------------------
  // Phase 4: Data Orchestration (Real Backend Wiring)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchAgentData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.push('/login');
          return;
        }

        const response = await fetch(`/api/agents/${agentId}/memory`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to load agent memory from core engine.");
        }

        const data = await response.json();
        setAgent(data.agent);
        setInvestigations(data.investigations || []);

        // Hydrate Phase 5 Settings State
        setTemperature([data.agent.temperature ?? 0.0]);
        setRoleDescription(data.agent.role_description || data.agent.description || "");
        setSchedule(data.agent.schedule || "hourly");

      } catch (err: any) {
        console.error("Agent memory hydration failed:", err);
        setError(err.message || "An unexpected error occurred while fetching agent memory.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgentData();
  }, [agentId, router, supabase.auth]);

  // ---------------------------------------------------------------------------
  // Phase 5: Patching the Backend
  // ---------------------------------------------------------------------------
  const handleSaveSettings = async () => {
    setIsUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) throw new Error("Unauthorized.");

      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          role_description: roleDescription,
          temperature: temperature[0],
          schedule: schedule
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to patch agent settings.");
      }

      toast({
        title: "Configuration Saved",
        description: "Agent directives and parameters have been updated successfully.",
      });

      // Update local state to reflect changes without full reload
      if (agent) {
        setAgent({
          ...agent,
          temperature: temperature[0],
          role_description: roleDescription,
          schedule: schedule
        });
      }

    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-500 min-h-screen bg-[#fafafa] p-6 md:p-10">
        <div className="flex justify-between items-start">
          <Skeleton className="h-12 w-1/3 rounded-2xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mt-4">
          <div className="xl:col-span-4 space-y-6">
            <Skeleton className="h-[250px] w-full rounded-3xl" />
            <Skeleton className="h-[200px] w-full rounded-3xl" />
          </div>
          <div className="xl:col-span-8">
            <Skeleton className="h-[600px] w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 animate-in fade-in duration-500 bg-[#fafafa] p-6">
        <div className="p-5 rounded-3xl bg-rose-50 border border-rose-100 shadow-sm text-rose-500">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900">Engine Disconnected</h2>
        <p className="text-sm font-medium text-slate-500 max-w-md text-center leading-relaxed">{error}</p>
        <Button onClick={() => router.push('/agents')} className="mt-4 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 px-8 py-6 shadow-md">
          Return to Agent Registry
        </Button>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="flex flex-col gap-8 min-h-screen bg-[#fafafa] p-6 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 pb-6 border-b border-gray-200/60">
        <div className="flex items-center gap-5">
          <Button variant="outline" size="icon" onClick={() => router.push('/agents')} className="shrink-0 rounded-xl bg-white border-gray-200 shadow-sm hover:text-blue-600 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                <Bot className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                {agent.name}
              </h1>
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-none font-bold uppercase tracking-wider text-[10px] ml-1">
                {agent.role}
              </Badge>
            </div>
            <p className="text-slate-500 mt-2 text-sm font-medium max-w-2xl">
              {agent.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {agent.status === 'online' && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm font-bold uppercase tracking-wider text-[10px] px-3 py-1">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              Active Watchdog
            </Badge>
          )}
          <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all flex-1 md:flex-none" onClick={() => router.push(`/chat/${agent.id}`)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Query Agent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start pb-12">
        
        {/* ── LEFT SIDEBAR: Agent Profile & KPIs ── */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="border-gray-200/80 shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-900 border-b border-slate-800 pb-4 pt-5 px-6">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-400" /> Operational Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 px-6 pb-6 space-y-5 bg-slate-50/50">
              <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-rose-50 text-rose-500 rounded-lg"><AlertTriangle className="h-4 w-4" /></div>
                  Anomalies Found
                </div>
                <span className="font-extrabold text-xl text-slate-900">{agent.metrics.anomaliesFound}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Activity className="h-4 w-4" /></div>
                  Queries Executed
                </div>
                <span className="font-extrabold text-xl text-slate-900">{(agent.metrics.queriesExecuted).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg"><CheckCircle2 className="h-4 w-4" /></div>
                  System Uptime
                </div>
                <span className="font-extrabold text-xl text-emerald-600">{agent.metrics.uptime}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200/80 shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-gray-100 pb-4 pt-5 px-6">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-500" /> Monitored Datasets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 px-6 pb-6">
              <div className="flex flex-col gap-2.5">
                {agent.datasets_monitored.length === 0 ? (
                  <p className="text-xs text-slate-500 font-medium">Unrestricted Global Access</p>
                ) : (
                  agent.datasets_monitored.map(ds => (
                    <div key={ds} className="flex items-center gap-2 p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                      <Database className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="font-bold text-sm text-indigo-950 truncate">{ds}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT MAIN AREA: AI Memory Timeline & Tabs ── */}
        <div className="xl:col-span-8">
          <Tabs defaultValue="investigations" className="w-full">
            <TabsList className="w-full justify-start border-b border-gray-200 rounded-none bg-transparent p-0 h-auto mb-8 flex-nowrap overflow-x-auto custom-scrollbar">
              <TabsTrigger 
                value="investigations" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-6 py-3 font-extrabold text-slate-500 hover:text-slate-900 transition-colors"
              >
                Deep Memory Timeline
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-6 py-3 font-extrabold text-slate-500 hover:text-slate-900 transition-colors"
              >
                Agent Directives
              </TabsTrigger>
            </TabsList>

            {/* TAB: Investigations */}
            <TabsContent value="investigations" className="m-0 focus-visible:outline-none">
              {investigations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-white/50 shadow-sm">
                  <div className="p-4 bg-slate-50 rounded-full border border-gray-100 mb-5">
                    <Search className="h-10 w-10 text-slate-300" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Memory Log Clean</h3>
                  <p className="text-sm text-slate-500 font-medium mt-2 max-w-sm leading-relaxed">
                    The agent is actively monitoring but has not detected any statistically significant anomalies yet.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[750px] pr-6 -mr-6">
                  {/* Engineered Timeline Connector */}
                  <div className="relative border-l-2 border-gray-100 ml-4 pl-8 space-y-2 pb-6 pt-2">
                    {investigations.map((record) => (
                      <div key={record.id} className="relative">
                        {/* Timeline Node */}
                        <div className="absolute -left-[41px] top-6 h-5 w-5 rounded-full border-4 border-[#fafafa] bg-blue-500 shadow-sm" />
                        <InvestigationCard record={record} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* TAB: Phase 5 State Mutation & Settings */}
            <TabsContent value="settings" className="m-0 focus-visible:outline-none">
              <Card className="border-gray-200/80 shadow-sm bg-white rounded-3xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                <CardHeader className="border-b border-gray-100 bg-slate-50/50 pb-5 pt-6 px-8">
                  <CardTitle className="text-xl font-extrabold flex items-center gap-3 text-slate-900">
                    <div className="p-2 bg-slate-900 text-white rounded-lg shadow-sm">
                      <Settings className="h-5 w-5" />
                    </div>
                    Agent Directives
                  </CardTitle>
                  <CardDescription className="text-slate-500 font-medium mt-1">
                    Hot-swap the sensitivity, persona, and schedule of this autonomous agent.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-8 pt-8 px-8 pb-8 bg-white">
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="directives" className="font-extrabold text-slate-900">System Prompts & Directives</Label>
                      <Badge variant="outline" className="bg-slate-50 text-slate-500 border-none font-bold uppercase tracking-wider text-[10px]">LLM Persona</Badge>
                    </div>
                    <Textarea 
                      id="directives"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="e.g. You are an expert data analyst. Cross-reference Shopify sales with Meta Ad spend..."
                      className="min-h-[160px] bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 text-[15px] font-medium shadow-inner rounded-xl leading-relaxed"
                    />
                  </div>

                  <div className="space-y-5 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <Label className="font-extrabold text-slate-900">Analytical Sensitivity (Temperature)</Label>
                      <span className="text-sm font-mono font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-lg border border-blue-100 shadow-sm">{temperature[0].toFixed(1)}</span>
                    </div>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      max={1.0}
                      min={0.0}
                      step={0.1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-[11px] font-bold tracking-widest uppercase text-slate-400">
                      <span>Strict / Math</span>
                      <span>Creative / Narrative</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-gray-100">
                    <Label className="font-extrabold text-slate-900">Execution Schedule</Label>
                    <Select value={schedule} onValueChange={setSchedule}>
                      <SelectTrigger className="w-full sm:w-[320px] h-12 bg-slate-50 border-gray-200 font-medium rounded-xl shadow-inner focus:ring-blue-500/20">
                        <SelectValue placeholder="Select a schedule" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200 rounded-xl shadow-xl">
                        <SelectItem value="hourly" className="font-medium cursor-pointer focus:bg-blue-50 focus:text-blue-700">Hourly (High Priority)</SelectItem>
                        <SelectItem value="daily" className="font-medium cursor-pointer focus:bg-blue-50 focus:text-blue-700">Daily (EOD Digest)</SelectItem>
                        <SelectItem value="weekly" className="font-medium cursor-pointer focus:bg-blue-50 focus:text-blue-700">Weekly (Long-term Trends)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
                
                <CardFooter className="bg-slate-50/80 border-t border-gray-100 py-5 px-8 flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertCircle className="h-3.5 w-3.5" /> Changes apply immediately
                  </p>
                  <Button 
                    onClick={handleSaveSettings} 
                    disabled={isUpdating} 
                    className="gap-2 rounded-xl font-bold px-8 py-6 bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all"
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Save className="h-4 w-4" />}
                    {isUpdating ? "Compiling..." : "Save Configuration"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

          </Tabs>
        </div>

      </div>
    </div>
  )
}