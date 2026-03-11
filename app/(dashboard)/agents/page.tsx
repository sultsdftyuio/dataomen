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
  Sparkles,
  MoreHorizontal,
  AlertTriangle,
  Timer
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// -----------------------------------------------------------------------------
// Type Definitions & Schemas
// -----------------------------------------------------------------------------
interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: 'Active' | 'Paused' | 'Training' | 'Failed';
  dataSources: string[];
  schedule: string; // Cron syntax or human readable
  sensitivity: number; // 1-100 threshold for alerting
  lastActive: string;
  themeColor: string;
}

// Agent Templates for Quick Deployment
const AGENT_TEMPLATES = {
  custom: { name: "", prompt: "", schedule: "Hourly", sensitivity: 50 },
  revenue: { 
    name: "Revenue Analyst", 
    prompt: "Monitor Stripe MRR and churn metrics. Generate weekly forecasts and flag sudden downgrades in enterprise tiers.",
    schedule: "Daily (9:00 AM)",
    sensitivity: 80
  },
  telemetry: { 
    name: "Telemetry Watchdog", 
    prompt: "Continuously scan PostgreSQL event logs. Alert immediately if core session activity drops by >10% within a 1-hour window.",
    schedule: "Every 5 Minutes",
    sensitivity: 95
  },
  support: { 
    name: "Sentiment Engine", 
    prompt: "Analyze incoming customer support data. Classify tickets by sentiment and auto-route high-risk churn threats to human managers.",
    schedule: "Hourly",
    sensitivity: 60
  }
}

const THEME_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500']

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default function AgentsPage() {
  // Start with an empty fleet, but ready for scaling
  const [agents, setAgents] = useState<Agent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeployOpen, setIsDeployOpen] = useState(false)

  // Deploy Form State
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof AGENT_TEMPLATES>('custom')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSchedule, setNewSchedule] = useState('Hourly')
  const [newSensitivity, setNewSensitivity] = useState([50])
  const [sources, setSources] = useState({ postgres: true, stripe: false, duckdb: false })

  // Auto-fill form when a template is selected
  useEffect(() => {
    if (selectedTemplate !== 'custom') {
      const template = AGENT_TEMPLATES[selectedTemplate]
      setNewName(template.name)
      setNewDescription(template.prompt)
      setNewSchedule(template.schedule)
      setNewSensitivity([template.sensitivity])
      
      // Smart source toggling based on template
      if (selectedTemplate === 'revenue') setSources({ postgres: false, stripe: true, duckdb: true })
      if (selectedTemplate === 'telemetry') setSources({ postgres: true, stripe: false, duckdb: false })
      if (selectedTemplate === 'support') setSources({ postgres: true, stripe: false, duckdb: true })
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
    const activeSources = Object.entries(sources).filter(([_, isActive]) => isActive).map(([name]) => name)

    const newAgent: Agent = {
      id: `agt_${Date.now()}`,
      name: newName.trim(),
      description: newDescription.trim(),
      model: 'gpt-4o-mini',
      status: 'Training', 
      dataSources: activeSources,
      schedule: newSchedule,
      sensitivity: newSensitivity[0],
      lastActive: 'Initializing...',
      themeColor: randomColor,
    }

    setAgents(prev => [newAgent, ...prev])
    
    // Reset Form & Close
    setSelectedTemplate('custom')
    setNewName('')
    setNewDescription('')
    setNewSchedule('Hourly')
    setNewSensitivity([50])
    setSources({ postgres: true, stripe: false, duckdb: false })
    setIsDeployOpen(false)

    // Simulate training completion
    setTimeout(() => {
      setAgents(prev => prev.map(a => a.id === newAgent.id ? { ...a, status: 'Active', lastActive: 'Just now' } : a))
    }, 3000)
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
        return <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/20 shadow-none"><Activity className="w-3 h-3 mr-1.5 animate-pulse" /> Active</Badge>
      case 'Paused':
        return <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-slate-700 shadow-none"><Square className="w-3 h-3 mr-1.5" /> Paused</Badge>
      case 'Training':
        return <Badge variant="outline" className="text-amber-400 border-amber-500/20 bg-amber-500/10 shadow-none"><Clock className="w-3 h-3 mr-1.5 animate-spin" /> Training</Badge>
      case 'Failed':
        return <Badge variant="destructive" className="bg-red-500/15 text-red-400 border-red-500/20 shadow-none"><AlertTriangle className="w-3 h-3 mr-1.5" /> Failed</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-8 h-full container mx-auto p-6 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Bot className="w-8 h-8 text-emerald-400" />
            Agent Fleet
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-2xl">
            Deploy and manage scheduled analytical workers strictly partitioned to your tenant workspace. 
            Agents run vector-optimized SQL queries behind the scenes.
          </p>
        </div>

        {/* Deploy Agent Modal */}
        <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 group bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg">
              <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90 duration-200" />
              Deploy Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px] bg-[#0f172a] border-slate-800 text-slate-200">
            <form onSubmit={handleDeployAgent}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-100">
                  <Sparkles className="w-5 h-5 text-emerald-400" /> Deploy Analytical Agent
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Configure a new autonomous worker with specific cron schedules and anomaly thresholds.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-5 py-5">
                {/* Template Selector */}
                <div className="grid gap-2">
                  <Label className="text-slate-300">Agent Template</Label>
                  <Select value={selectedTemplate} onValueChange={(val: any) => setSelectedTemplate(val)}>
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      <SelectItem value="custom">Blank Canvas (Custom)</SelectItem>
                      <SelectItem value="revenue">Revenue Analyst</SelectItem>
                      <SelectItem value="telemetry">Telemetry Watchdog</SelectItem>
                      <SelectItem value="support">Support Sentiment Engine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Basic Info */}
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-slate-300">Agent Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g., Marketing ROI Tracker" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-700 focus-visible:ring-emerald-500/50"
                  />
                </div>

                {/* Schedule & Sensitivity (The High-End Upgrade) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-slate-300">Execution Schedule</Label>
                    <Select value={newSchedule} onValueChange={setNewSchedule}>
                      <SelectTrigger className="bg-slate-900 border-slate-700">
                        <Timer className="w-4 h-4 mr-2 text-slate-500" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="Every 5 Minutes">Every 5 Minutes (Real-time)</SelectItem>
                        <SelectItem value="Hourly">Hourly</SelectItem>
                        <SelectItem value="Daily (9:00 AM)">Daily (9:00 AM)</SelectItem>
                        <SelectItem value="Weekly (Monday)">Weekly (Monday)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-slate-300">Anomaly Sensitivity</Label>
                      <span className="text-xs text-emerald-400 font-mono">{newSensitivity[0]}%</span>
                    </div>
                    <div className="pt-2">
                      <Slider 
                        defaultValue={[50]} 
                        max={100} 
                        step={1} 
                        value={newSensitivity}
                        onValueChange={setNewSensitivity}
                        className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Core Instructions */}
                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-slate-300">Analytical Prompt</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe exactly what data this agent should query via DuckDB..."
                    className="resize-none h-20 text-sm bg-slate-900 border-slate-700 focus-visible:ring-emerald-500/50"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    required
                  />
                </div>

                {/* Data Access Controls */}
                <div className="space-y-3 pt-2">
                  <Label className="text-slate-300">Granted Data Access</Label>
                  <div className="grid gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-pg" className="font-normal cursor-pointer flex items-center gap-2 text-slate-300">
                        <Database className="w-4 h-4 text-slate-500" /> PostgreSQL (Production)
                      </Label>
                      <Switch id="ds-pg" checked={sources.postgres} onCheckedChange={(c) => setSources(s => ({...s, postgres: c}))} className="data-[state=checked]:bg-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-st" className="font-normal cursor-pointer flex items-center gap-2 text-slate-300">
                        <Database className="w-4 h-4 text-slate-500" /> Stripe (Billing)
                      </Label>
                      <Switch id="ds-st" checked={sources.stripe} onCheckedChange={(c) => setSources(s => ({...s, stripe: c}))} className="data-[state=checked]:bg-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ds-dd" className="font-normal cursor-pointer flex items-center gap-2 text-slate-300">
                        <Database className="w-4 h-4 text-slate-500" /> DuckDB (Local Warehouse)
                      </Label>
                      <Switch id="ds-dd" checked={sources.duckdb} onCheckedChange={(c) => setSources(s => ({...s, duckdb: c}))} className="data-[state=checked]:bg-emerald-500" />
                    </div>
                  </div>
                </div>

              </div>
              <DialogFooter className="border-t border-slate-800 pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsDeployOpen(false)} className="text-slate-400 hover:text-slate-200">Cancel</Button>
                <Button type="submit" disabled={!newName.trim() || !newDescription.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white">
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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-200">Active Workers</h2>
            <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700">{filteredAgents.length}</Badge>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              type="search"
              placeholder="Search by name, task, or database..."
              className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200 focus-visible:ring-emerald-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* High-End Data Table View */}
        {filteredAgents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-2xl border-dashed border-slate-800 p-16 text-center bg-slate-900/20">
            <div className="h-16 w-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-6 shadow-inner">
              <Bot className="h-8 w-8 text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-200">No agents deployed</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-md mb-8 leading-relaxed">
              Your autonomous workforce is currently empty. Deploy your first vector-optimized agent to begin orchestrating scheduled analytics.
            </p>
            <Button onClick={() => setIsDeployOpen(true)} className="bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700">
              <Plus className="h-4 w-4 mr-2 text-emerald-400" /> Deploy First Agent
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden shadow-xl">
            <Table>
              <TableHeader className="bg-slate-900/80 hover:bg-slate-900/80 border-b border-slate-800">
                <TableRow className="border-none">
                  <TableHead className="w-[300px] text-slate-400 font-medium">Agent / Task</TableHead>
                  <TableHead className="text-slate-400 font-medium">Status</TableHead>
                  <TableHead className="text-slate-400 font-medium">Schedule (Cron)</TableHead>
                  <TableHead className="text-slate-400 font-medium">Sensitivity</TableHead>
                  <TableHead className="text-slate-400 font-medium">Connections</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-800/60">
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.id} className="hover:bg-slate-800/40 transition-colors border-slate-800/60 group">
                    {/* Name & Prompt */}
                    <TableCell className="py-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${agent.themeColor}`} />
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-200">{agent.name}</span>
                          <span className="text-xs text-slate-500 truncate max-w-[250px] mt-1" title={agent.description}>
                            {agent.description}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Status Toggle */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={agent.status === 'Active'} 
                          disabled={agent.status === 'Training' || agent.status === 'Failed'}
                          onCheckedChange={() => toggleAgentStatus(agent.id, agent.status)}
                          className="data-[state=checked]:bg-emerald-500 scale-90"
                        />
                        {getStatusBadge(agent.status)}
                      </div>
                    </TableCell>

                    {/* Schedule */}
                    <TableCell>
                      <div className="flex items-center text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded w-fit border border-slate-800">
                        <Timer className="w-3 h-3 mr-1.5 text-slate-500" />
                        {agent.schedule}
                      </div>
                    </TableCell>

                    {/* Sensitivity */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full" 
                            style={{ width: `${agent.sensitivity}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-400">{agent.sensitivity}%</span>
                      </div>
                    </TableCell>

                    {/* Data Sources */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.dataSources.map(ds => (
                          <Badge key={ds} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-slate-800 text-slate-400 border-slate-700">
                            {ds === 'postgres' ? 'PG' : ds === 'stripe' ? 'Stripe' : 'DuckDB'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Actions Menu */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-200 hover:bg-slate-800">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] bg-[#0f172a] border-slate-800 text-slate-300">
                          <DropdownMenuLabel className="text-xs font-medium text-slate-500">Agent Controls</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-slate-800" />
                          
                          {agent.status === 'Paused' ? (
                            <DropdownMenuItem className="cursor-pointer focus:bg-slate-800 text-emerald-400" onClick={() => toggleAgentStatus(agent.id, agent.status)}>
                              <Play className="mr-2 h-4 w-4" /> Resume Task
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="cursor-pointer focus:bg-slate-800 text-amber-400" onClick={() => toggleAgentStatus(agent.id, agent.status)} disabled={agent.status === 'Training'}>
                              <Square className="mr-2 h-4 w-4" /> Pause Task
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuItem className="cursor-pointer focus:bg-slate-800">
                            <Settings className="mr-2 h-4 w-4 text-slate-400" /> Reconfigure
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-800" />
                          <DropdownMenuItem className="cursor-pointer focus:bg-red-950 text-red-400" onClick={() => deleteAgent(agent.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Decommission
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}