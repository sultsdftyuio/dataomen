// app/(dashboard)/dashboard/page.tsx
'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Database, 
  Sparkles,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertCircle,
  Pin,
  Bot,
  MessageSquare,
  BarChart3,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { createClient } from '@/utils/supabase/client'
import { InsightsFeed } from "@/components/dashboard/InsightsFeed"
import { cn } from "@/lib/utils"

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
// Bespoke Duotone Icons (Replacing Generic Lucide)
// -----------------------------------------------------------------------------
const IconSources = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
    <path d="M8 8h8v2H8z" fill="currentColor" />
    <path d="M8 14h5v2H8z" fill="currentColor" />
    <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
    <circle cx="18" cy="15" r="1.5" fill="currentColor" />
  </svg>
)

const IconAgents = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 4L4 8l8 4 8-4-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M4 12l8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.3" />
    <path d="M4 16l8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.15" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
)

const IconQueries = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
    <rect x="6" y="12" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="6" width="4" height="14" rx="1" fill="currentColor" />
    <path d="M4 14l5-5 4 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="19" cy="5" r="1.5" fill="currentColor" />
  </svg>
)

const IconHealth = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.2" />
    <path d="M8 11.5L11 14l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.08" />
  </svg>
)

// -----------------------------------------------------------------------------
// Modular Stat Card (Refined Product-Grade UI)
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
  const accents = {
    default: {
      iconText: "text-slate-600",
      iconBg: "bg-slate-50/50 border-slate-200/60",
      glow: "group-hover:shadow-[0_8px_24px_-6px_rgba(100,116,139,0.12)]",
      borderHover: "hover:border-slate-300",
      bgGradient: "bg-gradient-to-br from-white to-slate-50/50",
      lineGradient: "from-slate-200/0 via-slate-400/20 to-slate-200/0"
    },
    blue: {
      iconText: "text-blue-600",
      iconBg: "bg-blue-50/50 border-blue-100",
      glow: "group-hover:shadow-[0_8px_24px_-6px_rgba(37,99,235,0.15)]",
      borderHover: "hover:border-blue-300",
      bgGradient: "bg-gradient-to-br from-white via-white to-blue-50/30",
      lineGradient: "from-blue-200/0 via-blue-500/20 to-blue-200/0"
    },
    emerald: {
      iconText: "text-emerald-600",
      iconBg: "bg-emerald-50/50 border-emerald-100",
      glow: "group-hover:shadow-[0_8px_24px_-6px_rgba(16,185,129,0.15)]",
      borderHover: "hover:border-emerald-300",
      bgGradient: "bg-gradient-to-br from-white via-white to-emerald-50/30",
      lineGradient: "from-emerald-200/0 via-emerald-500/20 to-emerald-200/0"
    },
    purple: {
      iconText: "text-violet-600",
      iconBg: "bg-violet-50/50 border-violet-100",
      glow: "group-hover:shadow-[0_8px_24px_-6px_rgba(139,92,246,0.15)]",
      borderHover: "hover:border-violet-300",
      bgGradient: "bg-gradient-to-br from-white via-white to-violet-50/30",
      lineGradient: "from-violet-200/0 via-violet-500/20 to-violet-200/0"
    },
    amber: {
      iconText: "text-amber-600",
      iconBg: "bg-amber-50/50 border-amber-100",
      glow: "group-hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.15)]",
      borderHover: "hover:border-amber-300",
      bgGradient: "bg-gradient-to-br from-white via-white to-amber-50/30",
      lineGradient: "from-amber-200/0 via-amber-500/20 to-amber-200/0"
    }
  };

  const style = accents[accent];

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-500 ease-out",
      "border border-slate-200/80 shadow-sm rounded-2xl group cursor-default",
      style.bgGradient,
      style.borderHover,
      style.glow
    )}>
      {/* Subtle top illuminating edge on hover */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        style.lineGradient
      )} />

      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-6 px-6">
        <CardTitle className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 group-hover:text-slate-600 transition-colors">
          {title}
        </CardTitle>
        <div className={cn(
          "p-2 rounded-xl border transition-all duration-500 ease-out",
          "group-hover:scale-[1.08] group-hover:-translate-y-[2px] shadow-sm",
          style.iconBg,
          style.iconText
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      
      <CardContent className="px-6 pb-6">
        {isLoading ? (
          <Skeleton className="h-10 w-24 rounded-lg bg-slate-100" />
        ) : (
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-extrabold text-slate-900 tracking-tighter tabular-nums drop-shadow-sm">
              {value}
            </div>
          </div>
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
  
  if (isLoading) return <Skeleton className="w-full h-[320px] rounded-2xl col-span-1 md:col-span-2 lg:col-span-4 bg-slate-100" />;

  if (data.length === 0) {
    return (
      <Card className="border border-slate-200/60 bg-gradient-to-b from-slate-50/50 to-white col-span-1 md:col-span-2 lg:col-span-4 h-[320px] flex flex-col items-center justify-center text-center rounded-2xl shadow-sm">
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm mb-4">
          <BarChart3 className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="font-extrabold tracking-tight text-slate-900">No Telemetry Available</h3>
        <p className="text-[13px] text-slate-500 font-medium mt-1">Deploy an agent to begin streaming analytical data.</p>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200/80 shadow-sm bg-gradient-to-b from-white to-slate-50/30 col-span-1 md:col-span-2 lg:col-span-4 rounded-2xl overflow-hidden flex flex-col hover:border-blue-200/80 hover:shadow-[0_8px_30px_-10px_rgba(37,99,235,0.1)] transition-all duration-500">
      <CardHeader className="flex flex-row items-center justify-between pb-4 pt-5 px-6 border-b border-slate-100 shrink-0">
        <div>
          <CardTitle className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100/50">
              <BarChart3 className="h-4 w-4" />
            </div>
            30-Day Executive Pulse
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium mt-1">Real-time analytical telemetry across connected datasets.</CardDescription>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider bg-emerald-50/80 text-emerald-700 border border-emerald-200/50 shadow-sm py-1 px-2.5 font-bold">
          <RefreshCw className="h-3 w-3 mr-1.5 inline animate-spin" /> Live Engine
        </Badge>
      </CardHeader>
      <CardContent className="pt-6 px-6 pb-6 flex-1">
        <div className="h-[200px] w-full flex items-end gap-1.5 mt-2">
          {data.map((point, i) => (
            <div key={i} className="relative flex-1 group h-full flex items-end">
              <div 
                className="w-full bg-blue-100/70 border border-blue-200/50 group-hover:bg-blue-600 group-hover:border-blue-500 transition-all duration-300 rounded-t-sm cursor-pointer shadow-[inset_0_-2px_4px_rgba(0,0,0,0.02)] group-hover:shadow-[0_4px_16px_rgba(37,99,235,0.4)]"
                style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, 2)}%` }}
              >
                {/* Executive Hover Tooltip */}
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0 pointer-events-none z-10 whitespace-nowrap shadow-xl border border-slate-800">
                  <span className="font-bold text-slate-400 block mb-0.5 text-[10px] uppercase tracking-widest">{point.date}</span>
                  <div className="font-mono font-bold text-sm text-emerald-400">${point.revenue.toLocaleString()}</div>
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
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Engine Connection Failed</h2>
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 pb-5 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900">Command Center</h1>
            {!isLoading && (
              isAdmin ? (
                <Badge variant="outline" className="bg-blue-50/50 text-blue-700 border-blue-200 shadow-sm px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1.5" /> Admin
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 shadow-sm px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                  <Lock className="h-3 w-3 mr-1.5" /> Standard
                </Badge>
              )
            )}
          </div>
          <p className="text-slate-500 mt-2 text-[13px] font-medium flex items-center gap-2">
            Operational orchestration for <span className="text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded-md text-xs border border-slate-200/60 shadow-sm">arcli.tech</span>
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" size="icon" onClick={fetchRealData} disabled={isLoading} className="text-slate-500 hover:text-blue-600 rounded-xl border-slate-200/80 shadow-sm bg-white transition-all hover:shadow-md">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="outline" className="rounded-xl font-bold bg-white shadow-sm border-slate-200/80 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all hover:shadow-md" asChild>
            <Link href="/datasets"><Database className="mr-2 h-4 w-4 text-blue-500" />Sources</Link>
          </Button>
          <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-[0_8px_16px_-6px_rgba(37,99,235,0.4)] hover:shadow-[0_12px_20px_-6px_rgba(37,99,235,0.5)] transition-all hover:-translate-y-0.5" asChild>
            <Link href="/agents/create"><Sparkles className="mr-2 h-4 w-4" />Deploy</Link>
          </Button>
        </div>
      </div>

      {/* Bird's Eye Metrics (Upgraded to Product-Grade UI with Bespoke Icons) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Connected Sources" value={metrics?.totalDatasets ?? 0} icon={IconSources} isLoading={isLoading} accent="blue" />
        <StatCard title="Active Agents" value={metrics?.activeAgents ?? 0} icon={IconAgents} isLoading={isLoading} accent="purple" />
        <StatCard title="Total Queries" value={(metrics?.queriesRun ?? 0).toLocaleString()} icon={IconQueries} isLoading={isLoading} accent="amber" />
        <StatCard title="System Health" value={`${metrics?.healthScore ?? 0}%`} icon={IconHealth} isLoading={isLoading} accent="emerald" />
        
        <MasterTrendChart data={chartData} isLoading={isLoading} />
      </div>

      {/* Structural Shift: Executive Insights feed takes priority (2 columns), Operations takes 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Priority Column: The Executive Insight Wall */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <h2 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
              <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg border border-rose-100/50 shadow-sm">
                <Pin className="h-4 w-4" />
              </div>
              Pinned Executive Insights
            </h2>
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-transparent border border-slate-200 shadow-sm">
              Auto-updating
            </Badge>
          </div>
          {/* Phase 5/7 Pulse Feed Component */}
          <InsightsFeed />
        </div>

        {/* Right Supporting Column: Operations & Workforce */}
        <div className="space-y-6">
          <Card className="border-slate-200/80 shadow-sm h-full flex flex-col bg-white rounded-2xl overflow-hidden">
            {/* Redesigned Header: Crisp, white, editorial */}
            <CardHeader className="border-b border-slate-100 bg-white/50 backdrop-blur-md pb-4 pt-5 px-6">
              <CardTitle className="flex items-center justify-between text-[15px] text-slate-900 font-extrabold tracking-tight">
                <span className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-violet-50 text-violet-600 rounded-lg border border-violet-100/50 shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>
                  Agent Workforce
                </span>
                <Badge variant="secondary" className="text-[10px] font-bold tracking-wider uppercase border-emerald-200/50 bg-emerald-50 text-emerald-700 shadow-sm">
                  {agents.length} Online
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 bg-slate-50/30">
              {!isLoading && agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center h-full px-6">
                  <div className="p-4 bg-white border border-slate-200/80 shadow-sm rounded-2xl mb-4">
                    <Bot className="h-8 w-8 text-slate-300 stroke-[1.5]" />
                  </div>
                  <h3 className="font-extrabold tracking-tight text-slate-900 text-base">No agents deployed</h3>
                  <p className="text-[13px] text-slate-500 font-medium mt-1 mb-6 max-w-[220px] leading-relaxed">Start by deploying an autonomous monitor to watch your metrics.</p>
                  <Button size="sm" variant="outline" className="rounded-xl font-bold bg-white border-slate-200 shadow-sm hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-all" asChild>
                    <Link href="/agents/create">Deploy Agent</Link>
                  </Button>
                </div>
              ) : (
                /* Redesigned List: Seamless, elegant divide, soft hover states */
                <div className="flex flex-col divide-y divide-slate-100/80">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-5 hover:bg-slate-50/80 transition-colors group relative flex flex-col cursor-pointer">
                      <div className="flex justify-between items-center mb-2.5">
                        <Badge variant="secondary" className="text-[9px] font-bold font-mono uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200/60 shadow-sm">
                          {agent.role}
                        </Badge>
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                          </span>
                          {agent.status}
                        </span>
                      </div>
                      <Link href={`/agents/${agent.id}`} className="absolute inset-0 z-10">
                        <span className="sr-only">View Agent {agent.name}</span>
                      </Link>
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold tracking-tight text-[14px] text-slate-900 mb-0.5 group-hover:text-blue-600 transition-colors">{agent.name}</h3>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-[12px] text-slate-500 font-medium line-clamp-1 leading-relaxed pr-6">{agent.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Redesigned Quick Action: Elegant glowing callout */}
          <Card className="border-blue-100/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 shadow-sm rounded-2xl overflow-hidden group hover:shadow-md hover:border-blue-200 transition-all duration-300">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold tracking-tight text-[14px] flex items-center gap-2 text-blue-950">
                  <MessageSquare className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform duration-300" />
                  Manual Query
                </h4>
                <p className="text-[12px] text-blue-800/70 font-medium mt-0.5">Talk to your data directly.</p>
              </div>
              <Button size="sm" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 shadow-sm font-bold rounded-xl transition-all" asChild>
                <Link href="/chat">Open Chat</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  )
}