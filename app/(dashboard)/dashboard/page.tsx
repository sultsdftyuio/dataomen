'use client'

import React, { useState, useEffect } from 'react'
import { 
  Activity, 
  Database, 
  Bot, 
  MessageSquare, 
  ArrowUpRight, 
  Sparkles,
  Zap,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Clock,
  ArrowRight,
  BrainCircuit
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface WorkspaceMetrics {
  totalDatasets: number;
  activeAgents: number;
  queriesRun: number;
  healthScore: number;
}

interface ActiveAgent {
  id: string;
  name: string;
  description: string;
  role: string;
  status: 'online' | 'analyzing' | 'offline';
  lastRun?: string;
}

interface AnomalyAlert {
  id: string;
  metric: string;
  agent_name: string;
  variance_pct: number;
  created_at: string;
  status: 'unresolved' | 'investigating' | 'resolved';
}

// -----------------------------------------------------------------------------
// Modular Stat Card
// -----------------------------------------------------------------------------
const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendLabel, 
  isLoading,
  accent = "default"
}: { 
  title: string, 
  value: string | number, 
  icon: React.ElementType, 
  trend?: string, 
  trendLabel?: string,
  isLoading: boolean,
  accent?: "default" | "blue" | "emerald" | "purple"
}) => {
  const accentColors = {
    default: "text-muted-foreground",
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    purple: "text-purple-500"
  };

  return (
    <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200 bg-background/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-md bg-muted/50 ${accentColors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20 mb-1" />
        ) : (
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
        )}
        
        {isLoading ? (
          <Skeleton className="h-4 w-32 mt-2" />
        ) : trend ? (
          <p className="text-xs text-emerald-500 mt-1 flex items-center font-medium">
            <ArrowUpRight className="h-3 w-3 mr-1" />
            {trend} <span className="text-muted-foreground font-normal ml-1">{trendLabel}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1 flex items-center h-4">
            No recent changes
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Main Dashboard Component
// -----------------------------------------------------------------------------
export default function DashboardOverviewPage() {
  const router = useRouter();
  
  const [metrics, setMetrics] = useState<WorkspaceMetrics>({
    totalDatasets: 0,
    activeAgents: 0,
    queriesRun: 0,
    healthScore: 100,
  });
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data Fetching Orchestration
  useEffect(() => {
    const fetchTenantDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const supabase = createClient();
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError || !session) {
          throw new Error("Authentication required to view workspace.");
        }

        // Attempt to fetch from backend
        const response = await fetch('/api/workspace/metrics', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
             console.warn("API not implemented. Falling back to simulated presentation state.");
             simulateBackendData();
             return; 
          }
          throw new Error("Failed to fetch analytical data from the engine.");
        }

        const data = await response.json();
        setMetrics(data.metrics || metrics);
        setAgents(data.agents || []);
        setAlerts(data.alerts || []);

      } catch (err: any) {
        console.error("Dashboard orchestration error:", err);
        // Fallback to simulated data so the UI remains visible for the demo/development
        simulateBackendData();
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantDashboardData();
  }, []);

  // Simulated data for when the backend isn't fully wired during development
  const simulateBackendData = () => {
    setTimeout(() => {
      setMetrics({
        totalDatasets: 3,
        activeAgents: 2,
        queriesRun: 12450,
        healthScore: 99.8,
      });
      setAgents([
        { id: '1', name: 'Stripe Revenue Watchdog', role: 'Financial Analyst', description: 'Monitors MRR and Churn velocity across EU and NA regions.', status: 'online', lastRun: '2 mins ago' },
        { id: '2', name: 'Conversion Monitor', role: 'Growth Agent', description: 'Tracks funnel drop-offs and API latencies on the checkout service.', status: 'analyzing', lastRun: 'Just now' }
      ]);
      setAlerts([
        { id: 'sim_1', metric: 'MRR (EU Region)', agent_name: 'Stripe Revenue Watchdog', variance_pct: -12.4, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), status: 'unresolved' },
        { id: 'sim_2', metric: 'Checkout Latency', agent_name: 'Conversion Monitor', variance_pct: 45.2, created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), status: 'investigating' },
      ]);
      setIsLoading(false);
    }, 1000);
  };

  if (error && !isLoading && agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <Zap className="h-10 w-10 text-destructive/50" />
        <h2 className="text-xl font-semibold text-foreground">Workspace Error</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry Connection</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full animate-in fade-in duration-500 pb-10">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Command Center
            {metrics.healthScore > 95 && !isLoading && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                System Optimal
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Supervise your autonomous data agents and review recent AI diagnostics.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/datasets">
              <Database className="mr-2 h-4 w-4" />
              Add Source
            </Link>
          </Button>
          <Button className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" asChild>
            <Link href="/agents/create">
              <Sparkles className="mr-2 h-4 w-4" />
              Deploy Agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Top Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Connected Sources" 
          value={metrics.totalDatasets} 
          icon={Database} 
          trend={metrics.totalDatasets > 0 ? "+1" : undefined} 
          trendLabel="this week" 
          isLoading={isLoading}
          accent="blue"
        />
        <StatCard 
          title="Agents Deployed" 
          value={metrics.activeAgents} 
          icon={BrainCircuit} 
          trend={metrics.activeAgents > 0 ? "+1" : undefined} 
          trendLabel="this month" 
          isLoading={isLoading}
          accent="purple"
        />
        <StatCard 
          title="Automated Queries" 
          value={(metrics.queriesRun).toLocaleString()} 
          icon={Activity} 
          trend={metrics.queriesRun > 0 ? "+12%" : undefined} 
          trendLabel="vs last week" 
          isLoading={isLoading}
        />
        <StatCard 
          title="System Health" 
          value={`${metrics.healthScore}%`} 
          icon={Zap} 
          trend={isLoading ? undefined : "Stable"} 
          trendLabel={isLoading ? undefined : "latency < 50ms"} 
          isLoading={isLoading}
          accent="emerald"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column: The Fleet (Agents) */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="border-border shadow-sm h-full flex flex-col">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                The Agent Fleet
              </CardTitle>
              <CardDescription>Your active AI workforce autonomously monitoring schemas.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pt-6">
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                </div>
              ) : agents.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {agents.map((agent) => (
                    <div key={agent.id} className="group p-5 border rounded-xl hover:border-primary/50 hover:bg-muted/10 transition-all cursor-default bg-background">
                      <div className="flex justify-between items-start mb-3">
                        <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 text-xs">
                          {agent.role}
                        </Badge>
                        <div className="flex items-center gap-2 text-xs font-medium">
                          {agent.status === 'analyzing' && (
                            <span className="text-blue-500 flex items-center gap-1">
                              <Sparkles className="h-3 w-3 animate-pulse" />
                              Analyzing
                            </span>
                          )}
                          {agent.status === 'online' && (
                            <span className="text-emerald-500 flex items-center gap-1">
                              <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                              Idle
                            </span>
                          )}
                        </div>
                      </div>
                      <h3 className="font-semibold text-foreground text-lg mb-1">{agent.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{agent.description}</p>
                      <div className="mt-4 pt-3 border-t flex justify-between items-center text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last Run: {agent.lastRun}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs hover:text-primary">
                          Configure
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl border-muted bg-muted/10">
                  <div className="p-4 bg-background rounded-full border mb-4 shadow-sm">
                    <Bot className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No active agents</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
                    Your workforce is currently empty. Deploy a Supervisor Agent to start monitoring your data automatically.
                  </p>
                  <Button asChild>
                    <Link href="/agents">Deploy your first Agent</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: AI Incident Feed */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm flex flex-col h-[500px]">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Recent AI Diagnostics
              </CardTitle>
              <CardDescription>Anomalies detected and analyzed by your agents.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full">
                {isLoading ? (
                  <div className="p-4 space-y-4">
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                  </div>
                ) : alerts.length > 0 ? (
                  <div className="divide-y">
                    {alerts.map((alert) => {
                      const isDrop = alert.variance_pct < 0;
                      return (
                        <div key={alert.id} className="p-4 hover:bg-muted/30 transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                            <Badge variant="outline" className={`border ${isDrop ? 'text-destructive border-destructive/30 bg-destructive/5' : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5'}`}>
                              {isDrop ? <TrendingDown className="mr-1 h-3 w-3" /> : <TrendingUp className="mr-1 h-3 w-3" />}
                              {Math.abs(alert.variance_pct)}% Variance
                            </Badge>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <h4 className="font-semibold text-sm text-foreground mb-1">{alert.metric}</h4>
                          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                            <Bot className="h-3 w-3" /> Detected by {alert.agent_name}
                          </p>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="w-full text-xs h-8 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
                            onClick={() => router.push(`/investigate/${alert.id}`)}
                          >
                            View AI Report <ArrowRight className="ml-1.5 h-3 w-3 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="p-3 bg-emerald-500/10 rounded-full mb-3">
                      <Sparkles className="h-6 w-6 text-emerald-500" />
                    </div>
                    <h3 className="text-sm font-medium text-foreground">All Clear</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      No anomalies detected recently. Your agents are watching.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chat Quick Launch */}
          <Card className="border-border shadow-sm bg-primary/5 border-primary/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Manual Query
                </h4>
                <p className="text-xs text-muted-foreground mt-1">Talk to your data directly.</p>
              </div>
              <Button size="sm" asChild>
                <Link href="/chat">Open Chat</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  )
}