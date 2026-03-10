// app/(dashboard)/agents/page.tsx
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { 
  Bot, 
  Search, 
  Plus, 
  Activity, 
  Settings, 
  Play, 
  Square,
  Database,
  Clock,
  Trash2,
  Sparkles
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// 1. Strict Type Definitions
interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: 'Active' | 'Paused' | 'Training' | 'Failed';
  dataSources: string[];
  lastActive: string;
  themeColor: string;
}

// Agent Templates for Quick Deployment
const AGENT_TEMPLATES = {
  custom: { name: "", prompt: "" },
  revenue: { 
    name: "Revenue Analyst", 
    prompt: "Monitor Stripe MRR and churn metrics. Generate weekly forecasts and flag sudden downgrades in enterprise tiers." 
  },
  telemetry: { 
    name: "Telemetry Watchdog", 
    prompt: "Continuously scan PostgreSQL event logs. Alert immediately if core session activity drops by >10% within a 1-hour window." 
  },
  support: { 
    name: "Sentiment Engine", 
    prompt: "Analyze incoming customer support data. Classify tickets by sentiment and auto-route high-risk churn threats to human managers." 
  }
}

const THEME_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500']

export default function AgentsPage() {
  // Start with an empty fleet instead of the 4 mock agents
  const [agents, setAgents] = useState<Agent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeployOpen, setIsDeployOpen] = useState(false)

  // Deploy Form State
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof AGENT_TEMPLATES>('custom')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [sources, setSources] = useState({ postgres: true, stripe: false, duckdb: false })

  // Auto-fill form when a template is selected
  useEffect(() => {
    if (selectedTemplate !== 'custom') {
      setNewName(AGENT_TEMPLATES[selectedTemplate].name)
      setNewDescription(AGENT_TEMPLATES[selectedTemplate].prompt)
      
      // Smart source toggling based on template
      if (selectedTemplate === 'revenue') setSources({ postgres: false, stripe: true, duckdb: true })
      if (selectedTemplate === 'telemetry') setSources({ postgres: true, stripe: false, duckdb: false })
    }
  }, [selectedTemplate])

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery, agents])

  const handleDeployAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newDescription.trim()) return

    const randomColor = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)]
    
    // Count active data sources
    const activeSources = Object.entries(sources).filter(([_, isActive]) => isActive).map(([name]) => name)

    const newAgent: Agent = {
      id: `agt_${Date.now()}`,
      name: newName.trim(),
      description: newDescription.trim(),
      model: 'gpt-5-nano',
      status: 'Training', 
      dataSources: activeSources,
      lastActive: 'Initializing...',
      themeColor: randomColor,
    }

    setAgents(prev => [newAgent, ...prev])
    
    // Reset Form
    setSelectedTemplate('custom')
    setNewName('')
    setNewDescription('')
    setSources({ postgres: true, stripe: false, duckdb: false })
    setIsDeployOpen(false)
  }

  const toggleAgentStatus = (id: string, currentStatus: string) => {
    if (currentStatus === 'Training' || currentStatus === 'Failed') return; 
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
  }

  const deleteAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  const getStatusBadge = (status: Agent['status']) => {
    switch (status) {
      case 'Active':
        return <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200 shadow-none"><Activity className="w-3 h-3 mr-1 animate-pulse" /> Active</Badge>
      case 'Paused':
        return <Badge variant="secondary" className="text-muted-foreground shadow-none"><Square className="w-3 h-3 mr-1" /> Paused</Badge>
      case 'Training':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 shadow-none"><Clock className="w-3 h-3 mr-1 animate-spin" /> Training</Badge>
      case 'Failed':
        return <Badge variant="destructive" className="shadow-none">Failed</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-8 h-full container mx-auto p-6 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Orchestration</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Deploy and manage custom analytical agents strictly partitioned to your tenant workspace.
          </p>
        </div>

        {/* Deploy Agent Modal */}
        <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 group">
              <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90 duration-200" />
              Quick Deploy
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleDeployAgent}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Deploy Analytical Agent
                </DialogTitle>
                <DialogDescription>
                  Configure a new autonomous worker to monitor your connected data.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-5 py-5">
                {/* 1. Template Selector */}
                <div className="grid gap-2">
                  <Label>Agent Template</Label>
                  <Select value={selectedTemplate} onValueChange={(val: any) => setSelectedTemplate(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Blank Canvas (Custom)</SelectItem>
                      <SelectItem value="revenue">Revenue Analyst</SelectItem>
                      <SelectItem value="telemetry">Telemetry Watchdog</SelectItem>
                      <SelectItem value="support">Support Sentiment Engine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Basic Info */}
                <div className="grid gap-2">
                  <Label htmlFor="name">Agent Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g., Marketing ROI Tracker" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>

                {/* 3. The Core Instructions */}
                <div className="grid gap-2">
                  <Label htmlFor="description">System Prompt / Instructions</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe exactly what data this agent should look at and what it should do..."
                    className="resize-none h-24 text-sm"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    required
                  />
                </div>

                {/* 4. Data Access Controls */}
                <div className="space-y-3 pt-2">
                  <Label>Granted Data Access</Label>
                  <div className="grid gap-3 bg-muted/30 p-4 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-pg" className="font-normal cursor-pointer flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" /> PostgreSQL (Production)
                      </Label>
                      <Switch id="ds-pg" checked={sources.postgres} onCheckedChange={(c) => setSources(s => ({...s, postgres: c}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-st" className="font-normal cursor-pointer flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" /> Stripe (Billing)
                      </Label>
                      <Switch id="ds-st" checked={sources.stripe} onCheckedChange={(c) => setSources(s => ({...s, stripe: c}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-dd" className="font-normal cursor-pointer flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" /> DuckDB (Local Warehouse)
                      </Label>
                      <Switch id="ds-dd" checked={sources.duckdb} onCheckedChange={(c) => setSources(s => ({...s, duckdb: c}))} />
                    </div>
                  </div>
                </div>

              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDeployOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!newName.trim() || !newDescription.trim()}>
                  Initialize Agent
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4">
          <h2 className="text-xl font-semibold">Active Fleet</h2>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search agents by name or task..."
              className="pl-9 bg-card shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Agents Grid */}
        {filteredAgents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-xl border-dashed p-12 text-center bg-muted/10 animate-in fade-in duration-300">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No agents deployed yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
              Your autonomous workforce is currently empty. Deploy your first agent to start analyzing your data streams.
            </p>
            <Button onClick={() => setIsDeployOpen(true)} className="shadow-sm">
              <Plus className="h-4 w-4 mr-2" /> Quick Deploy
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max pb-6">
            {filteredAgents.map((agent) => (
              <Card key={agent.id} className="flex flex-col border-border/60 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 group overflow-hidden">
                <CardHeader className="pb-4 flex flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 p-2 rounded-lg text-white shadow-sm ${agent.themeColor}`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <CardTitle className="text-base tracking-tight truncate max-w-[140px] sm:max-w-[180px]" title={agent.name}>
                        {agent.name}
                      </CardTitle>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{agent.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {getStatusBadge(agent.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="pb-4 flex-1">
                  <CardDescription className="text-sm text-foreground/80 leading-relaxed line-clamp-3">
                    {agent.description}
                  </CardDescription>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {agent.dataSources.map(ds => (
                      <Badge key={ds} variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                        {ds === 'postgres' ? 'Postgres' : ds === 'stripe' ? 'Stripe' : 'DuckDB'}
                      </Badge>
                    ))}
                  </div>
                </CardContent>

                <CardFooter className="pt-4 border-t border-border/40 bg-muted/20 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-1.5" title="Last Active">
                      <Activity className="h-3.5 w-3.5" />
                      {agent.lastActive}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[160px]">
                      <DropdownMenuLabel>Controls</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {agent.status === 'Paused' ? (
                        <DropdownMenuItem 
                          className="cursor-pointer text-emerald-600 focus:text-emerald-600 focus:bg-emerald-500/10"
                          onClick={() => toggleAgentStatus(agent.id, agent.status)}
                        >
                          <Play className="mr-2 h-4 w-4" /> Resume Agent
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          className="cursor-pointer text-amber-600 focus:text-amber-600 focus:bg-amber-500/10"
                          onClick={() => toggleAgentStatus(agent.id, agent.status)}
                          disabled={agent.status === 'Training'}
                        >
                          <Square className="mr-2 h-4 w-4" /> Pause Agent
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" /> Edit Configuration
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                        onClick={() => deleteAgent(agent.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Decommission
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}