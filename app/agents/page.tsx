"use client";

import React, { useState } from "react";
import { 
  Bot, 
  Activity, 
  Plus, 
  Search, 
  PlayCircle, 
  PauseCircle, 
  Settings2,
  Clock,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateAgentForm } from "@/components/agents/CreateAgentForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Mock data: In production, swap with useAgents() hook powered by Supabase RLS
const MOCK_AGENTS = [
  {
    id: "ag-001",
    name: "Revenue Anomaly Detector",
    description: "Monitors daily revenue for unexpected drops exceeding 15% WoW.",
    dataset: "Stripe_Transactions_Prod",
    status: "active",
    lastRun: "2 mins ago",
    condition: "revenue < EMA(revenue, 7) * 0.85"
  },
  {
    id: "ag-002",
    name: "Spike in API Errors",
    description: "Triggers PagerDuty if 5xx errors breach 1% of total volume.",
    dataset: "Vercel_Logs",
    status: "paused",
    lastRun: "3 hours ago",
    condition: "error_rate >= 0.01"
  }
];

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Vectorized-style filtering for high performance on large client arrays
  const filteredAgents = MOCK_AGENTS.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-6 w-full max-w-7xl mx-auto p-2">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            Custom Agents
          </h1>
          <p className="text-muted-foreground mt-1">
            Deploy autonomous watchdogs to monitor your analytical datasets 24/7.
          </p>
        </div>
        
        {/* Creation Modal - Prevents routing layout shifts */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md hover:shadow-lg transition-all">
              <Plus className="h-4 w-4" />
              Create Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Deploy New Agent</DialogTitle>
            </DialogHeader>
            <CreateAgentForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Utility Toolbar */}
      <div className="flex items-center gap-3 bg-card p-2 rounded-lg border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search agents..." 
            className="pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="h-6 w-px bg-border mx-2" />
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Activity className="h-4 w-4" />
          View Executions
        </Button>
      </div>

      {/* Execution Canvas / Grid */}
      {filteredAgents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 border rounded-xl border-dashed bg-muted/20">
          <Bot className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">No agents found</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4 text-center max-w-sm">
            You don't have any active agents matching your search. Create one to start monitoring your data.
          </p>
          <Button variant="outline" onClick={() => setIsCreateOpen(true)}>Create your first agent</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} className="flex flex-col hover:border-primary/50 transition-colors group shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-semibold">{agent.name}</CardTitle>
                    <CardDescription className="mt-1">{agent.description}</CardDescription>
                  </div>
                  <Badge variant={agent.status === "active" ? "default" : "secondary"} className="capitalize shadow-none">
                    {agent.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />}
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-4">
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Database className="h-4 w-4 mr-2" />
                    Dataset: <span className="font-medium text-foreground ml-1">{agent.dataset}</span>
                  </div>
                  {/* Distinctive styling for query logic */}
                  <div className="bg-muted/50 p-2.5 rounded-md font-mono text-xs text-primary border border-primary/10 truncate">
                    {agent.condition}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/10 flex justify-between items-center text-sm">
                <div className="flex items-center text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1.5" />
                  Last run: {agent.lastRun}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    {agent.status === "active" ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}