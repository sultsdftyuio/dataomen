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
// Modular Stat Card (Engineered Design)
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
    default: "text-slate-500 bg-slate-50 border-slate-200",
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    purple: "text-violet-600 bg-violet-50 border-violet-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100"
  };

  return (
    <Card className="border-gray-200/80 shadow-sm bg-white hover:border-blue-300 hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden group">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-6">
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</CardTitle>
        <div className={`p-2 rounded-xl border ${accentColors[accent]} transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {isLoading ? (
          <Skeleton className="h-8 w-24 rounded-lg" />
        ) : (
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</div>
        )}
      </CardContent>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Master Trend Chart (High-Performance Pulse View)
// -----------------------------------------------------------------------------
const MasterTrendChart = ({ data, isLoading }: { data: TimeSeriesDataPoint[], isLoading: boolean }) => {
  const maxRevenue = useMemo(() => {
    return data.length > 0 ? Math.max(...data.map(d => d.revenue), 1) : 1;
  }, [data]);
  
  if (isLoading) return <Skeleton className="w-full h-[320px] rounded-2xl col-span-1 md:col-span-2 lg:col-span-4" />;

  if (data.length === 0) {
    return (
      <Card className="border border-dashed border-gray-300 bg-slate-50/50 col-span-1 md:col-span-2 lg:col-span-4 h-[320px] flex flex-col items-center justify-center text-center rounded-2xl shadow-sm">
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm mb-4">
          <BarChart3 className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="font-bold text-slate-900">No Telemetry Available</h3>
        <p className="text-sm text-slate-500 font-medium mt-1">Deploy an agent to begin streaming analytical data.</p>
      </Card>
    );
  }

  return (
    <Card className="border-gray-200/80 shadow-sm bg-white col-span-1 md:col-span-2 lg:col-span-4 rounded-2xl overflow-hidden flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-4 pt-5 px-6 border-b border-gray-100 shrink-0">
        <div>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 className="h-4 w-4" />
            </div>
            30-Day Executive Pulse
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium mt-1">Real-time analytical telemetry across connected datasets.</CardDescription>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm py-1 px-2.5 font-bold">
          <RefreshCw className="h-3 w-3 mr-1.5 inline animate-spin" /> Live Engine
        </Badge>
      </CardHeader>
      <CardContent className="pt-6 px-6 pb-6 flex-1 bg-slate-50/30">
        <div className="h-[200px] w-full flex items-end gap-1.5 mt-2">
          {data.map((point, i) => (
            <div key={i} className="relative flex-1 group h-full flex items-end">
              <div 
                className="w-full bg-blue-200/50 group-hover:bg-blue-600 transition-all duration-300 rounded-t-sm cursor-pointer shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05)] group-hover:shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, 2)}%` }}
              >
                {/* Executive Hover Tooltip */}
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-xl border border-slate-800">
                  <span className="font-bold text-slate-400 block mb-0.5 text-[10px] uppercase tracking-widest">{point.date}</span>
                  <div className="font-mono font-bold text-sm text-emerald-400">${point.revenue.toLocaleString()}</div>
                  {/* Tooltip Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
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
      <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-5 bg-[#fafafa]">
        <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl shadow-sm">
          <AlertCircle className="h-10 w-10 text-rose-500" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Engine Connection Failed</h2>
          <p className="text-slate-500 font-medium max-w-md mt-1">{error}</p>
        </div>
        <Button onClick={fetchRealData} className="rounded-xl px-8 font-bold bg-slate-900 hover:bg-slate-800 shadow-sm">
          Retry Handshake
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12 bg-[#fafafa] min-h-screen px-4 md:px-8 pt-6">
      
      {/* C-Level Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 pb-5 border-b border-gray-200/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Command Center</h1>
            {!isLoading && (
              isAdmin ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 shadow-sm px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1.5" /> Admin
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-white text-slate-600 border-gray-200 shadow-sm px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                  <Lock className="h-3 w-3 mr-1.5" /> Standard
                </Badge>
              )
            )}
          </div>
          <p className="text-slate-500 mt-2 text-sm font-medium flex items-center gap-2">
            Operational orchestration for <span className="text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded-md text-xs border border-slate-200">arcli.tech</span>
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" size="icon" onClick={fetchRealData} disabled={isLoading} className="text-slate-500 hover:text-blue-600 rounded-xl border-gray-200 shadow-sm bg-white">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" className="rounded-xl font-bold bg-white shadow-sm border-gray-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50" asChild>
            <Link href="/datasets"><Database className="mr-2 h-4 w-4 text-blue-500" />Sources</Link>
          </Button>
          <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all" asChild>
            <Link href="/agents/create"><Sparkles className="mr-2 h-4 w-4" />Deploy</Link>
          </Button>
        </div>
      </div>

      {/* Bird's Eye Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
          <div className="flex items-center justify-between pb-3 border-b border-gray-200/80">
            <h2 className="text-xl font-extrabold flex items-center gap-2 text-slate-900">
              <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg shadow-sm">
                <Pin className="h-4 w-4" />
              </div>
              Pinned Executive Insights
            </h2>
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border-none">
              Auto-updating
            </Badge>
          </div>
          {/* Phase 5/7 Pulse Feed Component */}
          <InsightsFeed />
        </div>

        {/* Right Supporting Column: Operations & Workforce */}
        <div className="space-y-6">
          <Card className="border-gray-200/80 shadow-sm h-full flex flex-col bg-white rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-gray-100 bg-slate-900 pb-4 pt-5 px-6">
              <CardTitle className="flex items-center justify-between text-base text-white font-bold">
                <span className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-400" />
                  Agent Workforce
                </span>
                <Badge variant="outline" className="text-[10px] font-bold tracking-wider uppercase border-slate-700 bg-slate-800 text-slate-300">
                  {agents.length} Online
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-5 bg-slate-50/50">
              {!isLoading && agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                  <div className="p-4 bg-white border border-gray-200 shadow-sm rounded-full mb-4">
                    <Bot className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-base">No agents deployed</h3>
                  <p className="text-sm text-slate-500 font-medium mt-1 mb-5 max-w-[200px] leading-relaxed">Start by deploying an autonomous monitor.</p>
                  <Button size="sm" variant="outline" className="rounded-xl font-bold bg-white border-gray-200 shadow-sm hover:text-blue-600" asChild>
                    <Link href="/agents/create">Deploy Agent</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-1">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant="secondary" className="text-[9px] font-bold font-mono uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">
                          {agent.role}
                        </Badge>
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          {agent.status}
                        </span>
                      </div>
                      <Link href={`/agents/${agent.id}`}>
                        <h3 className="font-extrabold text-sm text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">{agent.name}</h3>
                      </Link>
                      <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">{agent.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Action: Chat */}
          <Card className="border-blue-200 bg-blue-50/50 shadow-sm rounded-2xl overflow-hidden group hover:bg-blue-50 transition-colors">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-sm flex items-center gap-2 text-blue-950">
                  <MessageSquare className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
                  Manual Query
                </h4>
                <p className="text-xs text-blue-700/70 font-medium mt-1">Talk to your data directly.</p>
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm" asChild>
                <Link href="/chat">Open Chat</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  )
}