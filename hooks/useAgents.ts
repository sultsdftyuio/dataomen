"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Agent, AgentCreatePayload } from "@/types/agent";
import { useToast } from "@/hooks/use-toast";

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();
  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session. Please log in.");

      const response = await fetch("/api/agents/", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to fetch agents");
      }

      const data: Agent[] = await response.json();
      setAgents(data);
    } catch (err: any) {
      setError(err.message);
      toast({ 
        title: "Connection Error", 
        description: err.message, 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth, toast]);

  const createAgent = async (payload: AgentCreatePayload) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session. Please log in.");

      const response = await fetch("/api/agents/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to provision agent");
      }

      const newAgent: Agent = await response.json();
      
      // Optimistic UI update: unshift to put the newest agent at the top
      setAgents((prev) => [newAgent, ...prev]);
      
      toast({ 
        title: "Agent Deployed", 
        description: `${newAgent.name} has been successfully provisioned.` 
      });
      
      return newAgent;
    } catch (err: any) {
      toast({ 
        title: "Deployment Failed", 
        description: err.message, 
        variant: "destructive" 
      });
      throw err;
    }
  };

  const deleteAgent = async (agentId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session. Please log in.");

      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to decommission agent");
      }

      // Filter out the deleted agent to update the UI instantly
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      
      toast({ 
        title: "Agent Decommissioned", 
        description: "The agent has been permanently removed from your workspace." 
      });
    } catch (err: any) {
      toast({ 
        title: "Decommission Failed", 
        description: err.message, 
        variant: "destructive" 
      });
      throw err;
    }
  };

  // Automatically fetch agents when the hook mounts
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { 
    agents, 
    isLoading, 
    error, 
    fetchAgents, 
    createAgent, 
    deleteAgent 
  };
}