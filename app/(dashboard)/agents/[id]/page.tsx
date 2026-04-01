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
  Save
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
  const varianceColor = isDrop ? 'text-destructive' : 'text-emerald-500';
  const varianceBg = isDrop ? 'bg-destructive/10' : 'bg-emerald-500/10';

  return (
    <Card className="mb-4 border-border shadow-sm hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`border-transparent font-mono ${varianceBg} ${varianceColor}`}>
              {isDrop ? <TrendingDown className="mr-1 h-3 w-3" /> : <TrendingUp className="mr-1 h-3 w-3" />}
              {Math.abs(record.variance_pct)}% Variance
            </Badge>
            <span className="text-xs text-muted-foreground font-mono flex items-center">
              <Clock className="mr-1 h-3 w-3" />
              {new Date(record.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <CardTitle className="text-base">{record.metric} Anomaly Detected</CardTitle>
        </div>
        <Badge variant={record.status === 'resolved' ? "default" : "secondary"} className={record.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : ''}>
          {record.status === 'resolved' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Search className="mr-1 h-3 w-3" />}
          {record.status.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2 uppercase tracking-wider">
            <BrainCircuit className="h-4 w-4 text-primary" />
            AI Root Cause Synthesis
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {record.ai_narrative}
          </p>
        </div>
      </CardContent>
      {record.underlying_sql && (
        <CardFooter className="bg-muted/10 border-t py-2 px-4">
          <details className="w-full group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center font-mono transition-colors">
              <FileText className="h-3 w-3 mr-2" />
              View execution trace (SQL)
            </summary>
            <div className="mt-2 p-3 bg-black/90 dark:bg-black rounded-md overflow-x-auto">
              <code className="text-[10px] text-emerald-400 font-mono whitespace-pre-wrap">
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
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) throw new Error("Unauthorized. Please log in.");

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
  }, [agentId]);

  // ---------------------------------------------------------------------------
  // Phase 5: Patching the Backend
  // ---------------------------------------------------------------------------
  const handleSaveSettings = async () => {
    setIsUpdating(true);
    try {
      const supabase = createClient();
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
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 h-full max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-start">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="md:col-span-2 h-[600px] w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Failed to load agent memory</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
        <Button variant="outline" onClick={() => router.push('/dashboard')} className="mt-4">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 pb-10 max-w-7xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Bot className="h-8 w-8 text-primary" />
                {agent.name}
              </h1>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                {agent.role}
              </Badge>
              {agent.status === 'online' && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-transparent">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                  Active
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
              {agent.description}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/chat/${agent.id}`)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat with Agent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Sidebar: Agent Profile & KPIs */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="bg-muted/20 border-b pb-4">
              <CardTitle className="text-sm font-medium">Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Anomalies Detected</span>
                </div>
                <span className="font-mono font-bold text-foreground">{agent.metrics.anomaliesFound}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm">Queries Executed</span>
                </div>
                <span className="font-mono font-bold text-foreground">{(agent.metrics.queriesExecuted).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">System Uptime</span>
                </div>
                <span className="font-mono font-bold text-emerald-500">{agent.metrics.uptime}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="bg-muted/20 border-b pb-4">
              <CardTitle className="text-sm font-medium">Monitored Datasets</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-2">
              {agent.datasets_monitored.map(ds => (
                <Badge key={ds} variant="secondary" className="font-mono text-xs py-1 justify-start font-normal bg-muted/50">
                  {ds}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Main Area: AI Memory Timeline & Tabs */}
        <div className="lg:col-span-8">
          <Tabs defaultValue="investigations" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto mb-6">
              <TabsTrigger 
                value="investigations" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 font-medium"
              >
                Investigation History
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 font-medium text-muted-foreground"
              >
                Configuration
              </TabsTrigger>
            </TabsList>

            <TabsContent value="investigations" className="m-0">
              {investigations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl border-muted bg-muted/10">
                  <Search className="h-10 w-10 text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-medium text-foreground">Memory Log Empty</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    The agent hasn't found any significant anomalies that break the configured thresholds yet.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[650px] pr-4">
                  <div className="relative border-l border-muted-foreground/20 ml-3 pl-6 space-y-6 pb-4">
                    {/* Timeline Node styling */}
                    {investigations.map((record) => (
                      <div key={record.id} className="relative">
                        <div className="absolute -left-[31px] top-4 h-4 w-4 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />
                        <InvestigationCard record={record} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Phase 5: State Mutation & Settings */}
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    Agent Directives
                  </CardTitle>
                  <CardDescription>Adjust the sensitivity and core instructions for this autonomous agent.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  <div className="space-y-3">
                    <Label htmlFor="directives" className="font-semibold text-foreground">System Prompts & Directives</Label>
                    <Textarea 
                      id="directives"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="e.g. You are an expert data analyst. Cross-reference Shopify sales with Meta Ad spend..."
                      className="min-h-[120px] bg-muted/20"
                    />
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex justify-between items-center">
                      <Label className="font-semibold text-foreground">Analytical Sensitivity (Temperature)</Label>
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{temperature[0]}</span>
                    </div>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      max={1.0}
                      min={0.0}
                      step={0.1}
                      className="py-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower values (0.0 - 0.2) result in strict, deterministic logic. Higher values allow more creative narrative synthesis.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="font-semibold text-foreground">Execution Schedule</Label>
                    <Select value={schedule} onValueChange={setSchedule}>
                      <SelectTrigger className="w-full sm:w-[280px] bg-muted/20">
                        <SelectValue placeholder="Select a schedule" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly (High Priority Monitoring)</SelectItem>
                        <SelectItem value="daily">Daily (EOD Digest)</SelectItem>
                        <SelectItem value="weekly">Weekly (Long-term Reporting)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
                <CardFooter className="bg-muted/10 border-t py-4 flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={isUpdating} className="gap-2">
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isUpdating ? "Saving..." : "Save Configuration"}
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