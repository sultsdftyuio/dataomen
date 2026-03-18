// app/(dashboard)/dashboard/page.tsx
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { 
  Activity, 
  Database, 
  Bot, 
  MessageSquare, 
  Sparkles,
  Zap,
  Clock,
  BrainCircuit,
  BarChart3,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle
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
  accent?: "default" | "blue" | "emerald" | "purple"
}) => {
  const accentColors = {
    default: "text-muted-foreground",
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    purple: "text-purple-500"
  };

  return (
    <Card className="border-border shadow-sm bg-background/50 backdrop-blur-md">
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
          <RefreshCw className="h-3 w-3 mr-1 inline" /> Live Engine Data
        </Badge>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="h-[180px] w-full flex items-end gap-1.5 pt-4">
          {data.map((point, i) => (
            <div key={i} className="relative flex-1 group h-full flex items-end">
              <div 
                className="w-full bg-primary/20 group-hover:bg-primary/50 transition-all rounded-t-[2px]"
                style={{ height: `${(point.revenue / maxRevenue) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Main Dashboard Component (No Simulation / Real Data Only)
// -----------------------------------------------------------------------------
export default function DashboardOverviewPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [chartData, setChartData] = useState<TimeSeriesDataPoint[]>([]);
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRealData = async () => {
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
        const response = await fetch('/api/workspace/metrics', {
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
    };

    fetchRealData();
  }, [router, supabase.auth]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive/50" />
        <h2 className="text-xl font-bold text-foreground">Engine Connection Failed</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry Handshake</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full animate-in fade-in duration-700 pb-10">
      
      {/* Header */}
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
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/datasets"><Database className="mr-2 h-4 w-4" />Sources</Link>
          </Button>
          <Button className="bg-primary text-primary-foreground" size="sm" asChild>
            <Link href="/agents/create"><Sparkles className="mr-2 h-4 w-4" />Deploy</Link>
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Connected Sources" value={metrics?.totalDatasets ?? 0} icon={Database} isLoading={isLoading} accent="blue" />
        <StatCard title="Active Agents" value={metrics?.activeAgents ?? 0} icon={BrainCircuit} isLoading={isLoading} accent="purple" />
        <StatCard title="Total Queries" value={(metrics?.queriesRun ?? 0).toLocaleString()} icon={Activity} isLoading={isLoading} />
        <StatCard title="System Health" value={`${metrics?.healthScore ?? 0}%`} icon={Zap} isLoading={isLoading} accent="emerald" />
        
        <MasterTrendChart data={chartData} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="border-border shadow-sm h-full flex flex-col bg-background/50">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-md">
                <Bot className="h-5 w-5 text-primary" />
                Agent Workforce
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-6">
              {!isLoading && agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 bg-muted/50 rounded-full mb-4">
                    <Bot className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="font-medium">No agents deployed</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-6">Start by deploying an autonomous monitor.</p>
                  <Button size="sm" asChild><Link href="/agents/create">Deploy Agent</Link></Button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-4 border rounded-xl bg-background/80">
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant="secondary" className="text-[10px]">{agent.role}</Badge>
                        <span className="text-[10px] text-emerald-500 font-bold">● {agent.status}</span>
                      </div>
                      <h3 className="font-bold text-sm mb-1">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <InsightsFeed />
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" />Manual Query</h4>
                <p className="text-[11px] text-muted-foreground">Talk to your data directly.</p>
              </div>
              <Button size="sm" asChild><Link href="/chat">Open</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}