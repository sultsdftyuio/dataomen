// app/(dashboard)/agents/page.tsx
'use client'

import React, { useState, useMemo } from 'react'
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
  Trash2
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

// 1. Type Safety: Strict interfaces for our multi-tenant Agent structures
interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: 'Active' | 'Paused' | 'Training' | 'Failed';
  linkedDatasets: number;
  lastActive: string;
  themeColor: string;
}

// 2. Initial State: Standardized entirely on GPT-5 Nano
const INITIAL_AGENTS: Agent[] = [
  {
    id: 'agt_1',
    name: 'Revenue Forecaster',
    description: 'Analyzes Stripe API data to predict MRR churn, expansion, and seasonal trends.',
    model: 'gpt-5-nano',
    status: 'Active',
    linkedDatasets: 2,
    lastActive: 'Just now',
    themeColor: 'bg-blue-500',
  },
  {
    id: 'agt_2',
    name: 'Anomaly Detector',
    description: 'Continuously scans PostgreSQL telemetry events for sudden drops in user activity.',
    model: 'gpt-5-nano',
    status: 'Active',
    linkedDatasets: 4,
    lastActive: '5 mins ago',
    themeColor: 'bg-purple-500',
  },
  {
    id: 'agt_3',
    name: 'Marketing ROI Analyst',
    description: 'Cross-references ad spend in DuckDB with user acquisition metrics.',
    model: 'gpt-5-nano',
    status: 'Paused',
    linkedDatasets: 1,
    lastActive: '2 days ago',
    themeColor: 'bg-amber-500',
  },
  {
    id: 'agt_4',
    name: 'Support Sentiment Engine',
    description: 'Categorizes incoming Zendesk tickets and flags high-risk enterprise churn.',
    model: 'gpt-5-nano',
    status: 'Training',
    linkedDatasets: 3,
    lastActive: 'Processing...',
    themeColor: 'bg-emerald-500',
  }
]

// Pre-defined themes for dynamic assignment
const THEME_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500']

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeployOpen, setIsDeployOpen] = useState(false)

  // New Agent Form State
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // 3. Compute Efficiency: Memoized client-side filtering (Vectorized masking approach)
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.model.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery, agents])

  // Agent State Mutations
  const handleDeployAgent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newDescription.trim()) return

    const randomColor = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)]
    
    const newAgent: Agent = {
      id: `agt_${Date.now()}`,
      name: newName.trim(),
      description: newDescription.trim(),
      model: 'gpt-5-nano', // Forced engine standardization
      status: 'Training',  // New agents start in training
      linkedDatasets: 0,
      lastActive: 'Initializing...',
      themeColor: randomColor,
    }

    setAgents(prev => [newAgent, ...prev])
    setNewName('')
    setNewDescription('')
    setIsDeployOpen(false)
  }

  const toggleAgentStatus = (id: string, currentStatus: string) => {
    if (currentStatus === 'Training' || currentStatus === 'Failed') return; // Cannot toggle these states
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
  }

  const deleteAgent = (id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  // Helper for status badge rendering
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
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleDeployAgent}>
              <DialogHeader>
                <DialogTitle>Deploy Analytical Agent</DialogTitle>
                <DialogDescription>
                  Configure a new GPT-5 Nano worker to monitor your connected schemas.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Agent Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g., Support Ticket Classifier" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Instructions / Core Task</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe the specific analytical task this agent will perform..."
                    className="resize-none h-20"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDeployOpen(false)}>Cancel</Button>
                <Button type="submit">Initialize Agent</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-6">
        {/* Toolbar Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4">
          <h2 className="text-xl font-semibold">Active Fleet</h2>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search agents by name, task, or model..."
              className="pl-9 bg-card shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Agents Grid Section */}
        {filteredAgents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-xl border-dashed p-12 text-center bg-muted/10 animate-in fade-in duration-300">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No agents found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-4">
              We couldn't find any agents matching your search query, or your fleet is empty.
            </p>
            <Button variant="outline" onClick={() => setIsDeployOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Deploy First Agent
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
                      {/* Enforces GPT-5 Nano Display */}
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
                </CardContent>

                <CardFooter className="pt-4 border-t border-border/40 bg-muted/20 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-1.5" title="Linked Datasets">
                      <Database className="h-3.5 w-3.5" />
                      {agent.linkedDatasets}
                    </div>
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
                        <Settings className="mr-2 h-4 w-4" /> Configuration
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