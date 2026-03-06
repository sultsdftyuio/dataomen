"use client";

import React, { useState } from "react";
import { useAgents } from "@/hooks/useAgents";
import { CreateAgentForm } from "@/components/agents/CreateAgentForm";
import { AgentCreatePayload } from "@/types/agent";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Bot, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentsPage() {
  const { agents, isLoading, createAgent, deleteAgent } = useAgents();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (payload: AgentCreatePayload) => {
    setIsSubmitting(true);
    try {
      await createAgent(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">AI Orchestration</h1>
        <p className="text-muted-foreground">
          Provision and manage custom analytical agents strictly partitioned to your tenant workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Configuration Form */}
        <div className="lg:col-span-1 sticky top-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Deploy New Agent
          </h2>
          <CreateAgentForm onSubmit={handleCreate} isLoading={isSubmitting} />
        </div>

        {/* Right Column: Agent Fleet List */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Active Fleet</h2>
          
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="border border-dashed p-16 text-center rounded-xl bg-muted/10 flex flex-col items-center justify-center">
              <Bot className="h-12 w-12 mb-4 text-muted-foreground/50" />
              <p className="font-medium text-lg">No active agents deployed.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use the configuration form to deploy your first analytical agent.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <Card 
                  key={agent.id} 
                  className="flex flex-col border-border/60 hover:border-primary/40 transition-colors shadow-sm group"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      <span className="truncate">{agent.name}</span>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 h-10 mt-1">
                      {agent.description || "No description provided for this agent."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="mt-auto pt-3 flex justify-between items-center border-t border-border/40 bg-muted/20">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Deployed: {new Date(agent.created_at).toLocaleDateString()}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      onClick={() => deleteAgent(agent.id)}
                      title="Decommission Agent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}