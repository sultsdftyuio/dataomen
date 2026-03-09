// app/(dashboard)/dashboard/page.tsx
'use client'

import React from 'react'
import { 
  Activity, 
  Database, 
  Bot, 
  MessageSquare, 
  ArrowUpRight, 
  Sparkles,
  Zap
} from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// 1. Type Safety: Define our top-level metric structures
interface WorkspaceMetrics {
  totalDatasets: number;
  activeAgents: number;
  queriesRun: number;
  healthScore: number;
}

// 2. Mock State: Simulating data pulled from your analytical engine (DuckDB/Postgres)
const metrics: WorkspaceMetrics = {
  totalDatasets: 4,
  activeAgents: 2,
  queriesRun: 1284,
  healthScore: 98,
}

// 3. Helper Component: Modular Stat Card
const StatCard = ({ title, value, icon: Icon, trend, trendLabel }: { title: string, value: string | number, icon: React.ElementType, trend?: string, trendLabel?: string }) => (
  <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {trend && (
        <p className="text-xs text-emerald-600 mt-1 flex items-center font-medium">
          <ArrowUpRight className="h-3 w-3 mr-1" />
          {trend} <span className="text-muted-foreground font-normal ml-1">{trendLabel}</span>
        </p>
      )}
    </CardContent>
  </Card>
)

export default function DashboardOverviewPage() {
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
        <Button className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
          <Sparkles className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
      </div>

      {/* Top Level Metrics (Vectorized summary logic) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Connected Datasets" 
          value={metrics.totalDatasets} 
          icon={Database} 
          trend="+1" 
          trendLabel="this week" 
        />
        <StatCard 
          title="Active Agents" 
          value={metrics.activeAgents} 
          icon={Bot} 
          trend="+2" 
          trendLabel="deployed" 
        />
        <StatCard 
          title="Queries Executed" 
          value={(metrics.queriesRun).toLocaleString()} 
          icon={Activity} 
          trend="+14.2%" 
          trendLabel="vs last month" 
        />
        <StatCard 
          title="System Health" 
          value={`${metrics.healthScore}%`} 
          icon={Zap} 
          trend="Optimal" 
          trendLabel="latency < 50ms" 
        />
      </div>

      {/* Main Content Grid: Split between Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Deep Links & Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Autonomous Agents</CardTitle>
              <CardDescription>Your active data-driven assistants currently monitoring schemas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="group p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 rounded-md bg-blue-500/10 text-blue-600">
                    <Bot className="h-5 w-5" />
                  </div>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </div>
                <h3 className="font-semibold text-foreground">Revenue Forecaster</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">Analyzing Stripe API data to predict MRR churn and expansion.</p>
              </div>
              
              <div className="group p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 rounded-md bg-purple-500/10 text-purple-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </div>
                <h3 className="font-semibold text-foreground">Anomaly Detector</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">Scanning PostgreSQL for sudden drops in user telemetry events.</p>
              </div>
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