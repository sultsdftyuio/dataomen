"use client";

import React, { useEffect } from 'react';
import { useAgents } from '@/hooks/useAgents';
import { CreateAgentForm } from '@/components/agents/CreateAgentForm';
import { AgentRuleCreate } from '@/types/agent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AgentsPage() {
  const { agents, isLoading, error, fetchAgents, createAgent } = useAgents();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreateAgent = async (payload: AgentRuleCreate) => {
    try {
      await createAgent(payload);
      // Ideally trigger a toast notification here
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container mx-auto py-10 space-y-8 max-w-5xl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Proactive Analytics</h1>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <CreateAgentForm onSubmit={handleCreateAgent} isLoading={isLoading} />
        </div>
        
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-xl font-semibold">Active Agents</h3>
          {agents.length === 0 && !isLoading ? (
            <p className="text-muted-foreground border border-dashed rounded-lg p-8 text-center">
              No agents deployed yet. Create your first agent to start monitoring.
            </p>
          ) : (
            <div className="grid gap-4">
              {agents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex justify-between">
                      <span>Monitoring: {agent.metric_column}</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Active</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>Dataset: <span className="font-mono text-foreground">{agent.dataset_id}</span></p>
                    <p>Schedule: <span className="font-mono text-foreground">{agent.cron_schedule}</span></p>
                    <p>Last Run: {agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : 'Pending initialization'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}