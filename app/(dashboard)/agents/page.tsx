// app/(dashboard)/agents/page.tsx
'use client'

import React, { useState, useMemo } from 'react'
import { useAgents } from "@/hooks/useAgents"
import { CreateAgentForm } from "@/components/agents/CreateAgentForm"
import { AgentCreatePayload } from "@/types/agent"
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
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function AgentsPage() {
  // 1. Real Backend State: Pulled securely via your Python backend
  const { agents, isLoading, createAgent, deleteAgent } = useAgents()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 2. Submit Handler for new analytical agents
  const handleCreate = async (payload: AgentCreatePayload) => {
    setIsSubmitting(true)
    try {
      await createAgent(payload)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 3. Compute Efficiency: Memoized client-side filtering (Vectorized masking approach)
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => 
      agent.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery, agents])

  // Helper for dynamic status badge rendering
  // (Uses fallbacks in case the real DB doesn't have the status field yet)
  const getStatusBadge = (status?: string) => {
    const normalizedStatus = status?.toLowerCase() || 'active';
    switch (normalizedStatus) {
      case 'active':
        return <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200"><Activity className="w-3 h-3 mr-1 animate-pulse" /> Active</Badge>
      case 'paused':
        return <Badge variant="secondary" className="text-muted-foreground"><Square className="w-3 h-3 mr-1" /> Paused</Badge>
      case 'training':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50"><Clock className="w-3 h-3 mr-1 animate-spin" /> Training</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200"><Activity className="w-3 h-3 mr-1 animate-pulse" /> Active</Badge>
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
        <Button className="shrink-0 group hidden sm:flex">
          <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90 duration-200" />
          Quick Deploy
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Left Column: Configuration Form */}
        <div className="xl:col-span-1 sticky top-6 space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Deploy New Agent</h2>
          </div>
          <CreateAgentForm onSubmit={handleCreate} isLoading={isSubmitting} />
        </div>

        {/* Right Column: Agent Fleet List */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Toolbar Section */}
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

          {/* Agents Grid Section */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[200px] w-full rounded-xl" />
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center border rounded-xl border-dashed p-12 text-center bg-muted/10 animate-in fade-in duration-300">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No agents found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {searchQuery 
                  ? "We couldn't find any agents matching your search query. Try adjusting your filters." 
                  : "Use the configuration form to deploy your first analytical agent."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-max pb-6">
              {filteredAgents.map((agent) => (
                <Card key={agent.id} className="flex flex-col border-border/60 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 group overflow-hidden">
                  <CardHeader className="pb-4 flex flex-row items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {/* Note: Fallback to primary color if themeColor isn't in DB yet */}
                      <div className={`mt-1 p-2 rounded-lg text-white shadow-sm ${(agent as any).themeColor || 'bg-primary/80'}`}>
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-semibold text-foreground text-base tracking-tight truncate max-w-[140px] sm:max-w-[180px]">
                          {agent.name}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">
                          {(agent as any).model || 'Analytical Engine'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {getStatusBadge((agent as any).status || 'Active')}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-4 flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {agent.description || "No description provided for this orchestration agent."}
                    </p>
                  </CardContent>

                  <CardFooter className="pt-4 border-t border-border/40 bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                      <div className="flex items-center gap-1.5" title="Linked Datasets">
                        <Database className="h-3.5 w-3.5" />
                        {(agent as any).linkedDatasets || 1}
                      </div>
                      <div className="flex items-center gap-1.5" title="Deployed At">
                        <Clock className="h-3.5 w-3.5" />
                        {agent.created_at ? new Date(agent.created_at).toLocaleDateString() : 'Just now'}
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
                        
                        {/* Dynamic Play/Pause Toggle */}
                        {(agent as any).status === 'Paused' ? (
                          <DropdownMenuItem className="cursor-pointer text-emerald-600 focus:text-emerald-600 focus:bg-emerald-500/10">
                            <Play className="mr-2 h-4 w-4" /> Resume Agent
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="cursor-pointer text-amber-600 focus:text-amber-600 focus:bg-amber-500/10">
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
    </div>
  )
}