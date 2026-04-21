// app/(dashboard)/agents/[id]/page.tsx

'use client'

import React, { useState, useEffect } from 'react'
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
import { useToast } from "@/hooks/use-toast"
import { createClient } from '@/utils/supabase/client'

// Integrated Creation Components
import { CreateAgentForm, AgentCreatePayload as UIAgentCreatePayload, Asset } from '@/components/agents/CreateAgentForm'
import { AgentCreatePayload as ApiAgentCreatePayload } from '@/types/agent'
import { useAgents } from '@/hooks/useAgents'

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
  cron_schedule?: string;
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
  const varianceColor = isDrop ? 'text-rose-600' : 'text-blue-600';
  const varianceBorder = isDrop ? 'border-rose-200/60' : 'border-blue-200/60';
  const varianceBg = isDrop ? 'bg-rose-50/50' : 'bg-blue-50/50';

  return (
    <Card className="mb-6 border border-slate-200/60 shadow-sm hover:border-blue-300/50 hover:shadow-md transition-all duration-300 bg-white rounded-2xl overflow-hidden group">
      <CardHeader className="pb-4 pt-5 px-6 flex flex-row items-start justify-between border-b border-slate-100/50 bg-gradient-to-b from-slate-50/50 to-white">
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
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200/60' 
            : 'bg-slate-800 text-white border-slate-900'
        }`}>
          {record.status === 'resolved' ? <CheckCircle2 className="mr-1.5 h-3 w-3 text-emerald-500" /> : <Search className="mr-1.5 h-3 w-3 text-blue-400" />}
          {record.status}
        </Badge>
      </CardHeader>
      
      <CardContent className="pt-5 px-6 pb-6 bg-white">
        <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-100 shadow-inner">
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
            <div className="mt-3 p-4 bg-black/60 rounded-xl overflow-x-auto shadow-inner border border-slate-800/80">
              <code className="text-xs text-blue-400 font-mono whitespace-pre-wrap leading-relaxed block">
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
  
  // Create client directly. Our wrapper strictly implements a singleton memory cache.
  // Using useMemo triggers "Multiple GoTrueClient instances" warnings in React StrictMode.
  const supabase = createClient();
  const { createAgent } = useAgents();

  // State Management
  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Creation State
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Settings State Mutation
  const [isUpdating, setIsUpdating] = useState(false);
  const [temperature, setTemperature] = useState<number[]>([0.0]);
  const [roleDescription, setRoleDescription] = useState("");
  const [schedule, setSchedule] = useState("hourly");

  // ---------------------------------------------------------------------------
  // Data Orchestration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Pipeline 1: Creation Mode Intercept
    if (agentId === 'create') {
      const fetchAssets = async () => {
        setIsLoading(true);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.push('/login'); return; }

          const dsRes = await fetch('/api/datasets', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          
          if (dsRes.ok) {
            const data = await dsRes.json();
            setAssets(data.map((d: any) => ({
              id: d.id,
              name: d.name,
              type: 'dataset',
              sourceType: d.source_type,
              isConnected: true
            })));
          }
        } catch(e) {
          console.error("Asset hydration skipped.", e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAssets();
      return;
    }

    // Pipeline 2: Standard Hydration
    const fetchAgentData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }

        // Parallel resolution resolves the backend mapping bug where 
        // the memory endpoint purely returns an array, not an aggregated object.
        const [agentRes, memoryRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`, { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
          fetch(`/api/agents/${agentId}/memory`, { headers: { 'Authorization': `Bearer ${session.access_token}` } })
        ]);

        if (!agentRes.ok) throw new Error("Agent configuration could not be located.");
        
        const agentData = await agentRes.json();
        const memoryData = memoryRes.ok ? await memoryRes.json() : [];

        setAgent({
          ...agentData,
          metrics: agentData.metrics || {
            anomaliesFound: memoryData.length || 0,
            queriesExecuted: 0,
            uptime: '100%'
          }
        });
        
        setInvestigations(memoryData);

        // Hydrate Settings State
        setTemperature([agentData.temperature ?? 0.0]);
        setRoleDescription(agentData.role_description || agentData.description || "");
        setSchedule(agentData.cron_schedule || "hourly");

      } catch (err: any) {
        setError(err.message || "An unexpected error occurred while fetching agent memory.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgentData();
  }, [agentId, router, supabase.auth]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const handleCreateSubmit = async (payload: UIAgentCreatePayload) => {
    setIsCreating(true);
    try {
      // Cast the payload if the internal service expects the Api variation,
      // or directly pass it if useAgents adapts it.
      const newAgent = await createAgent(payload as any);
      router.push(`/agents/${newAgent.id}`);
    } catch (e) {
      // Toast handled internally by useAgents hook
    } finally {
      setIsCreating(false);
    }
  };

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
          cron_schedule: schedule
        })
      });

      if (!response.ok) throw new Error("Failed to patch agent directives.");

      toast({
        title: "Configuration Saved",
        description: "Agent directives and parameters have been structurally updated.",
      });

      if (agent) {
        setAgent({ ...agent, temperature: temperature[0], role_description: roleDescription, cron_schedule: schedule });
      }
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render Loading / Error States
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-500 min-h-screen bg-[#f8fafc] p-6 md:p-10">
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
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 animate-in fade-in duration-500 bg-[#f8fafc] p-6">
        <div className="p-5 rounded-3xl bg-rose-50 border border-rose-100 shadow-sm text-rose-500">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900">Engine Disconnected</h2>
        <p className="text-sm font-medium text-slate-500 max-w-md text-center leading-relaxed">{error}</p>
        <Button onClick={() => router.push('/agents')} className="mt-4 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 px-8 py-6 shadow-md">
          Return to Registry
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Intercept Creation Route
  // ---------------------------------------------------------------------------
  if (agentId === 'create') {
    return (
      <div className="flex flex-col gap-8 min-h-screen bg-[#f8fafc] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-slate-100/50 to-slate-50 p-6 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 pb-6 border-b border-slate-200/60">
          <div className="flex items-center gap-5">
            <Button variant="outline" size="icon" onClick={() => router.push('/agents')} className="shrink-0 rounded-xl bg-white border-slate-200 shadow-sm hover:text-blue-600 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                Deploy Autonomous Copilot
              </h1>
              <p className="text-slate-500 mt-1 text-sm font-medium">
                Configure a specialized AI agent with strict environmental boundaries.
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto w-full">
          <CreateAgentForm 
            onSubmit={handleCreateSubmit} 
            isLoading={isCreating}
            availableAssets={assets} 
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Standard Memory Profile
  // ---------------------------------------------------------------------------
  if (!agent) return null;

  return (
    <div className="flex flex-col gap-8 min-h-screen bg-[#f8fafc] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-slate-100/50 to-slate-50 p-6 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-5">
          <Button variant="outline" size="icon" onClick={() => router.push('/agents')} className="shrink-0 rounded-xl bg-white border-slate-200 shadow-sm hover:text-blue-600 transition-colors">
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
                {agent.role || 'Agent'}
              </Badge>
            </div>
            <p className="text-slate-500 mt-2 text-sm font-medium max-w-2xl">
              {agent.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {agent.status === 'online' && (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200/60 shadow-sm font-bold uppercase tracking-wider text-[10px] px-3 py-1">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
              Active Watchdog
            </Badge>
          )}
          <Button className="rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all flex-1 md:flex-none" onClick={() => router.push(`/chat/${agent.id}`)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Execute Query
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start pb-12">
        
        {/* ── LEFT SIDEBAR: Agent Profile & KPIs ── */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="border border-slate-200/60 shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-900 border-b border-slate-800 pb-4 pt-5 px-6">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-400" /> Operational Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 px-6 pb-6 space-y-5 bg-slate-50/50">
              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><AlertTriangle className="h-4 w-4" /></div>
                  Anomalies Caught
                </div>
                <span className="font-extrabold text-xl text-slate-900">{agent.metrics.anomaliesFound}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Activity className="h-4 w-4" /></div>
                  Queries Handled
                </div>
                <span className="font-extrabold text-xl text-slate-900">{(agent.metrics.queriesExecuted).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 text-slate-600 font-bold text-sm">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 className="h-4 w-4" /></div>
                  System Integrity
                </div>
                <span className="font-extrabold text-xl text-emerald-600">{agent.metrics.uptime}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200/60 shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-100 pb-4 pt-5 px-6">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-600" /> Boundary Access
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 px-6 pb-6">
              <div className="flex flex-col gap-2.5">
                {!agent.datasets_monitored || agent.datasets_monitored.length === 0 ? (
                  <p className="text-xs text-slate-500 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">Open Global Context</p>
                ) : (
                  agent.datasets_monitored.map(ds => (
                    <div key={ds} className="flex items-center gap-3 p-3 bg-blue-50/50 border border-blue-100/60 rounded-xl">
                      <Database className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="font-bold text-sm text-blue-950 truncate">{ds}</span>
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
            <TabsList className="w-full justify-start border-b border-slate-200/60 rounded-none bg-transparent p-0 h-auto mb-8 flex-nowrap overflow-x-auto custom-scrollbar">
              <TabsTrigger 
                value="investigations" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-6 py-3 font-extrabold text-slate-500 hover:text-slate-900 transition-colors"
              >
                Deep Memory Cache
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
                <div className="flex flex-col items-center justify-center py-20 text-center border border-slate-200/60 rounded-3xl bg-white shadow-sm">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-5">
                    <Search className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Event Horizon Clear</h3>
                  <p className="text-sm text-slate-500 font-medium mt-2 max-w-sm leading-relaxed">
                    The watchdog process is actively iterating, but no statistical deviations require analysis at this time.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[750px] pr-6 -mr-6">
                  {/* Engineered Timeline Connector */}
                  <div className="relative border-l-2 border-slate-100 ml-4 pl-8 space-y-2 pb-6 pt-2">
                    {investigations.map((record) => (
                      <div key={record.id} className="relative">
                        <div className="absolute -left-[41px] top-6 h-5 w-5 rounded-full border-4 border-[#f8fafc] bg-slate-900 shadow-sm" />
                        <InvestigationCard record={record} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* TAB: Settings & Parameters */}
            <TabsContent value="settings" className="m-0 focus-visible:outline-none">
              <Card className="border border-slate-200/60 shadow-sm bg-white rounded-3xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-5 pt-6 px-8">
                  <CardTitle className="text-xl font-extrabold flex items-center gap-3 text-slate-900">
                    <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
                      <Settings className="h-5 w-5" />
                    </div>
                    System Architecture
                  </CardTitle>
                  <CardDescription className="text-slate-500 font-medium mt-1">
                    Hot-swap the behavioral parameters and lifecycle loops of this entity.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-8 pt-8 px-8 pb-8 bg-white">
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="directives" className="font-extrabold text-slate-900">Core Directives</Label>
                      <Badge variant="outline" className="bg-slate-50 text-slate-500 border-none font-bold uppercase tracking-wider text-[10px]">LLM Vector</Badge>
                    </div>
                    <Textarea 
                      id="directives"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="e.g. Enforce rigorous SQL formulation. Only query tables X and Y..."
                      className="min-h-[160px] bg-slate-50 border-slate-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 text-[15px] font-medium shadow-inner rounded-xl leading-relaxed"
                    />
                  </div>

                  <div className="space-y-5 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <Label className="font-extrabold text-slate-900">Compute Fluidity (Temperature)</Label>
                      <span className="text-sm font-mono font-bold bg-slate-900 text-white px-3 py-1 rounded-lg shadow-sm">{temperature[0].toFixed(1)}</span>
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
                      <span>Strict Formulation (0.0)</span>
                      <span>Creative Inference (1.0)</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-slate-100">
                    <Label className="font-extrabold text-slate-900">Execution Cadence</Label>
                    <Select value={schedule} onValueChange={setSchedule}>
                      <SelectTrigger className="w-full sm:w-[320px] h-12 bg-slate-50 border-slate-200 font-medium rounded-xl shadow-inner focus:ring-blue-500/20">
                        <SelectValue placeholder="Select an interval" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 rounded-xl shadow-xl">
                        <SelectItem value="hourly" className="font-medium cursor-pointer focus:bg-slate-50">Hourly Chron</SelectItem>
                        <SelectItem value="daily" className="font-medium cursor-pointer focus:bg-slate-50">Daily Aggregation</SelectItem>
                        <SelectItem value="weekly" className="font-medium cursor-pointer focus:bg-slate-50">Weekly Analysis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
                
                <CardFooter className="bg-slate-50/80 border-t border-slate-100 py-5 px-8 flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertCircle className="h-3.5 w-3.5" /> Deploys instantly
                  </p>
                  <Button 
                    onClick={handleSaveSettings} 
                    disabled={isUpdating} 
                    className="gap-2 rounded-xl font-bold px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all"
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin text-blue-200" /> : <Save className="h-4 w-4" />}
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