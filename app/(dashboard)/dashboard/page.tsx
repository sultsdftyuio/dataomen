// app/(dashboard)/dashboard/page.tsx
'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Activity, 
  Database, 
  Bot, 
  MessageSquare, 
  Sparkles,
  Zap,
  BrainCircuit,
  BarChart3,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  Pin
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { createClient } from '@/utils/supabase/client'
import { InsightsFeed } from "@/components/dashboard/InsightsFeed"

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

interface TimeSeriesDataPoint {
  date: string;
  revenue: number;
  queries: number;
}

// -----------------------------------------------------------------------------
// Modular Stat Card
// -----------------------------------------------------------------------------
const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  isLoading,
  accent = "default"
}: { 
  title: string, 
  value: string | number, 
  icon: React.ElementType, 
  isLoading: boolean,
  accent?: "default" | "blue" | "emerald" | "purple" | "amber"
}) => {
  const accentColors = {
    default: "text-muted-foreground",
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    purple: "text-purple-500",
    amber: "text-amber-500"
  };

  return (
    <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md transition-all hover:bg-muted/10">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-md bg-muted/50 ${accentColors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
        )}
      </CardContent>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Master Trend Chart
// -----------------------------------------------------------------------------
const MasterTrendChart = ({ data, isLoading }: { data: TimeSeriesDataPoint[], isLoading: boolean }) => {
  const maxRevenue = useMemo(() => {
    return data.length > 0 ? Math.max(...data.map(d => d.revenue), 1) : 1;
  }, [data]);
  
  if (isLoading) return <Skeleton className="w-full h-[280px] rounded-xl" />;

  if (data.length === 0) {
    return (
      <Card className="border-border bg-background/50 col-span-1 md:col-span-2 lg:col-span-4 h-[280px] flex flex-col items-center justify-center text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">No telemetry data available for this period.</p>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md col-span-1 md:col-span-2 lg:col-span-4 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b bg-muted/5">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            30-Day Executive Overview
          </CardTitle>
          <CardDescription>Real-time analytical telemetry.</CardDescription>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
          <RefreshCw className="h-3 w-3 mr-1 inline animate-pulse text-emerald-500" /> Live Engine Data
        </Badge>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="h-[180px] w-full flex items-end gap-1.5 pt-4">
          {data.map((point, i) => (
            <div key={i} className="relative flex-1 group h-full flex items-end">
              <div 
                className="w-full bg-primary/20 group-hover:bg-primary transition-all rounded-t-[2px] cursor-pointer"
                style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, 2)}%` }}
              >
                {/* Executive Hover Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-md border">
                  <span className="font-medium text-muted-foreground">{point.date}</span>
                  <div className="font-bold">${point.revenue.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Main Dashboard Component (The Executive Wall)
// -----------------------------------------------------------------------------
export default function DashboardOverviewPage() {
  const router = useRouter();
  
  // FIX 1: Memoize Supabase Client to prevent multiple instances & memory leaks on re-renders
  const supabase = useMemo(() => createClient(), []);
  
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [chartData, setChartData] = useState<TimeSeriesDataPoint[]>([]);
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRealData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push('/login');
        return;
      }

      const role = user.app_metadata?.role || 'user';
      setIsAdmin(role === 'admin');

      const { data: { session } } = await supabase.auth.getSession();
      
      // FIX 2: Point to the correct physical routing architecture
      const response = await fetch('/api/chat/orchestrate/workspace/metrics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (!response.ok) throw new Error("Could not connect to the analytical engine.");

      const data = await response.json();
      setMetrics(data.metrics);
      setAgents(data.agents || []);
      setChartData(data.chartData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [router, supabase.auth]);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive/50" />
        <h2 className="text-xl font-bold text-foreground">Engine Connection Failed</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <Button variant="outline" onClick={fetchRealData}>Retry Handshake</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full animate-in fade-in duration-700 pb-10">
      
      {/* C-Level Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
            {!isLoading && (
              isAdmin ? (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-2 py-0.5">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Admin
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground px-2 py-0.5">
                  <Lock className="h-3.5 w-3.5 mr-1" /> Standard
                </Badge>
              )
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Operational orchestration for <span className="text-foreground font-medium">arcli.tech</span>.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="ghost" size="icon" onClick={fetchRealData} disabled={isLoading} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/datasets"><Database className="mr-2 h-4 w-4" />Sources</Link>
          </Button>
          <Button className="bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-all" size="sm" asChild>
            <Link href="/agents/create"><Sparkles className="mr-2 h-4 w-4" />Deploy</Link>
          </Button>
        </div>
      </div>

      {/* Bird's Eye Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Connected Sources" value={metrics?.totalDatasets ?? 0} icon={Database} isLoading={isLoading} accent="blue" />
        <StatCard title="Active Agents" value={metrics?.activeAgents ?? 0} icon={BrainCircuit} isLoading={isLoading} accent="purple" />
        <StatCard title="Total Queries" value={(metrics?.queriesRun ?? 0).toLocaleString()} icon={Activity} isLoading={isLoading} accent="amber" />
        <StatCard title="System Health" value={`${metrics?.healthScore ?? 0}%`} icon={Zap} isLoading={isLoading} accent="emerald" />
        
        <MasterTrendChart data={chartData} isLoading={isLoading} />
      </div>

      {/* Structural Shift: Executive Insights feed takes priority (2 columns), Operations takes 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Priority Column: The Executive Insight Wall */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Pin className="h-5 w-5 text-primary" />
              Pinned Executive Insights
            </h2>
            <p className="text-xs text-muted-foreground">Auto-updating intelligence wall</p>
          </div>
          <InsightsFeed />
        </div>

        {/* Right Supporting Column: Operations & Workforce */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm h-full flex flex-col bg-background/50">
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="flex items-center justify-between text-md">
                <span className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Agent Workforce
                </span>
                <Badge variant="outline" className="text-[10px]">{agents.length} Online</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-4">
              {!isLoading && agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="p-3 bg-muted/50 rounded-full mb-3">
                    <Bot className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <h3 className="font-medium text-sm">No agents deployed</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Start by deploying an autonomous monitor.</p>
                  <Button size="sm" variant="outline" asChild><Link href="/agents/create">Deploy Agent</Link></Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-1">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-3 border rounded-lg bg-background/80 hover:bg-muted/10 transition-colors">
                      <div className="flex justify-between items-center mb-1.5">
                        <Badge variant="secondary" className="text-[9px] font-mono uppercase tracking-wider">{agent.role}</Badge>
                        <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          {agent.status}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm mb-0.5">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Action: Chat */}
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />Manual Query</h4>
                <p className="text-xs text-muted-foreground">Talk to your data directly.</p>
              </div>
              <Button size="sm" asChild><Link href="/chat">Open Chat</Link></Button>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  )
}