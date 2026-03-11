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
  CheckCircle2
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface AgentDetails {
  id: string;
  name: string;
  role: string;
  description: string;
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
  const agentId = params.id as string;

  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Data Orchestration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchAgentData = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/agents/${agentId}/memory`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });

        if (!response.ok) {
          throw new Error("API not ready, falling back to simulation.");
        }

        const data = await response.json();
        setAgent(data.agent);
        setInvestigations(data.investigations);
      } catch (err) {
        console.warn("Falling back to simulated Agent Memory data.");
        simulateBackendData();
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgentData();
  }, [agentId]);

  const simulateBackendData = () => {
    setTimeout(() => {
      setAgent({
        id: agentId,
        name: 'Stripe Revenue Watchdog',
        role: 'Financial Analyst',
        description: 'Autonomously monitors MRR, Churn velocity, and failed payment rates across EU and NA regions. Applies Exponential Moving Average (EMA) to filter weekend noise.',
        status: 'online',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
        datasets_monitored: ['stripe_subscriptions_prod', 'stripe_invoices_ytd'],
        metrics: {
          anomaliesFound: 14,
          queriesExecuted: 8430,
          uptime: '99.9%',
        }
      });
      setInvestigations([
        {
          id: 'inv_1',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          metric: 'MRR (EU Region)',
          variance_pct: -12.4,
          status: 'investigating',
          ai_narrative: 'Detected a sharp 12.4% drop in EU MRR starting at 08:00 UTC. Analyzing the underlying cohorts reveals that 85% of the churned revenue originates from the "Pro Tier" annual renewals failing due to expired credit cards (SCA mandate impact). Recommending immediate review of Dunning workflows for EU clients.',
          underlying_sql: "SELECT\n  date_trunc('hour', created_at) as cohort,\n  sum(mrr_amount) as total_mrr,\n  reason\nFROM stripe_subscriptions_prod\nWHERE status = 'canceled'\n  AND region = 'EU'\nGROUP BY 1, 3\nORDER BY 1 DESC;"
        },
        {
          id: 'inv_2',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
          metric: 'New Upgrades (NA)',
          variance_pct: 22.8,
          status: 'resolved',
          ai_narrative: 'Observed a highly positive variance (+22.8%) in North American upgrades. Cross-referencing with product logs indicates this correlates strongly with the release of the "Advanced Export" feature. Most upgrades occurred within 15 minutes of users hitting the export paywall.',
          underlying_sql: "SELECT\n  user_id,\n  upgrade_tier,\n  timestamp\nFROM stripe_invoices_ytd\nWHERE upgrade_tier = 'Premium'\n  AND region = 'NA'\n  AND timestamp >= current_date - interval '3 days';"
        }
      ]);
    }, 800);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 h-full">
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

            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    Agent Directives
                  </CardTitle>
                  <CardDescription>Adjust the sensitivity and instructions for this autonomous agent.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-muted/20 border rounded-lg text-sm text-muted-foreground text-center">
                    Settings configuration module goes here (Sensitivity sliders, cron schedules, Slack webhook mappings).
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  )
}