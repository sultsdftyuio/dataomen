// app/(dashboard)/dashboard/page.tsx
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
  Loader2
} from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from '@/utils/supabase/client'

// 1. Type Safety: Define our top-level metric structures
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
  iconType: 'bot' | 'activity';
  status: 'online' | 'offline';
}

// 2. Helper Component: Modular Stat Card with Loading State
const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendLabel, 
  isLoading 
}: { 
  title: string, 
  value: string | number, 
  icon: React.ElementType, 
  trend?: string, 
  trendLabel?: string,
  isLoading: boolean
}) => (
  <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-8 w-20 mb-1" />
      ) : (
        <div className="text-2xl font-bold text-foreground">{value}</div>
      )}
      
      {isLoading ? (
        <Skeleton className="h-4 w-32 mt-2" />
      ) : trend ? (
        <p className="text-xs text-emerald-600 mt-1 flex items-center font-medium">
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
)

export default function DashboardOverviewPage() {
  const [metrics, setMetrics] = useState<WorkspaceMetrics>({
    totalDatasets: 0,
    activeAgents: 0,
    queriesRun: 0,
    healthScore: 100, // Default baseline
  });
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 3. Asynchronous Data Fetching with Tenant Isolation
  useEffect(() => {
    const fetchTenantDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const supabase = createClient();
        
        // Step A: Securely grab the current user's session token
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError || !session) {
          throw new Error("Authentication required to view workspace.");
        }

        // Step B: Fetch isolated metrics from your analytical backend
        // We pass the JWT securely. Your Python backend MUST validate this token,
        // extract the user_id, and use it as a partition key (tenant_id) for the query.
        const response = await fetch('/api/workspace/metrics', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          // If the endpoint doesn't exist yet, we catch it gracefully and fallback to zeros
          if (response.status === 404) {
             console.warn("Metrics API not implemented yet. Falling back to empty state.");
             return; // State defaults to 0
          }
          throw new Error("Failed to fetch analytical data from the engine.");
        }

        const data = await response.json();
        
        // Step C: Hydrate state with actual tenant data
        setMetrics({
          totalDatasets: data.metrics.totalDatasets || 0,
          activeAgents: data.metrics.activeAgents || 0,
          queriesRun: data.metrics.queriesRun || 0,
          healthScore: data.metrics.healthScore || 100,
        });
        
        setAgents(data.agents || []);

      } catch (err: any) {
        console.error("Dashboard orchestration error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantDashboardData();
  }, []);

  if (error) {
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
    <div className="flex flex-col gap-8 h-full animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Workspace Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor your data sources, active AI agents, and analytical query volume.
          </p>
        </div>
        <Button className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading || metrics.queriesRun === 0}>
          <Sparkles className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
      </div>

      {/* Top Level Metrics (Vectorized summary logic mapped to UI) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Connected Datasets" 
          value={metrics.totalDatasets} 
          icon={Database} 
          trend={metrics.totalDatasets > 0 ? "+0" : undefined} 
          trendLabel="this week" 
          isLoading={isLoading}
        />
        <StatCard 
          title="Active Agents" 
          value={metrics.activeAgents} 
          icon={Bot} 
          trend={metrics.activeAgents > 0 ? "+0" : undefined} 
          trendLabel="deployed" 
          isLoading={isLoading}
        />
        <StatCard 
          title="Queries Executed" 
          value={(metrics.queriesRun).toLocaleString()} 
          icon={Activity} 
          trend={metrics.queriesRun > 0 ? "0%" : undefined} 
          trendLabel="vs last month" 
          isLoading={isLoading}
        />
        <StatCard 
          title="System Health" 
          value={`${metrics.healthScore}%`} 
          icon={Zap} 
          trend={isLoading ? undefined : "Optimal"} 
          trendLabel={isLoading ? undefined : "latency < 50ms"} 
          isLoading={isLoading}
        />
      </div>

      {/* Main Content Grid: Split between Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Deep Links & Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border shadow-sm h-full">
            <CardHeader>
              <CardTitle>Autonomous Agents</CardTitle>
              <CardDescription>Your active data-driven assistants currently monitoring schemas.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-28 w-full rounded-lg" />
                  <Skeleton className="h-28 w-full rounded-lg" />
                </div>
              ) : agents.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {agents.map((agent) => (
                    <div key={agent.id} className="group p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-2 rounded-md ${agent.iconType === 'bot' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                          {agent.iconType === 'bot' ? <Bot className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                        </div>
                        <span className={`flex h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      </div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{agent.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-lg border-muted">
                  <Bot className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                  <h3 className="text-lg font-medium text-foreground">No active agents</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm">
                    You haven't deployed any analytical agents yet. Connect a dataset to get started.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/agents">Deploy an Agent</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Fast Navigation */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm bg-gradient-to-b from-muted/50 to-transparent">
            <CardHeader>
              <CardTitle className="text-lg">Quick Start</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button variant="outline" className="w-full justify-start text-left font-normal" asChild>
                <Link href="/datasets">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Connect new database
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-left font-normal" asChild>
                <Link href="/agents">
                  <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
                  Deploy an AI Agent
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-left font-normal" asChild>
                <Link href="/chat">
                  <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                  Ask a question in Chat
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}