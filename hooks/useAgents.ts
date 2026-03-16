"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Agent, AgentCreatePayload } from "@/types/agent";
import { useToast } from "@/hooks/use-toast";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface UseAgentsReturn {
  agents: Agent[];
  isLoading: boolean;
  isCreating: boolean;
  deletingId: string | null; // Tracks which specific agent is being deleted for targeted UI spinners
  error: string | null;
  fetchAgents: () => Promise<void>;
  createAgent: (payload: AgentCreatePayload) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// The Hook
// -----------------------------------------------------------------------------
export function useAgents(): UseAgentsReturn {
  // State Management
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Memoize the supabase client to prevent reference churn and infinite re-renders
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  
  // Track active fetch requests to prevent memory leaks on component unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAgents = useCallback(async () => {
    // Cancel any in-flight requests before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("No active session. Please log in.");

      const response = await fetch("/api/agents/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to fetch agents (${response.status})`);
      }

      const data: Agent[] = await response.json();
      setAgents(data);
      
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "AbortError") return; // Safely ignore aborted fetches
        
        setError(err.message);
        toast({ 
          title: "Connection Error", 
          description: err.message, 
          variant: "destructive" 
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, toast]);

  const createAgent = async (payload: AgentCreatePayload): Promise<Agent> => {
    setIsCreating(true);
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to provision agent");
      }

      const newAgent: Agent = await response.json();
      
      // Optimistic UI update: unshift to put the newest agent at the top instantly
      setAgents((prev) => [newAgent, ...prev]);
      
      toast({ 
        title: "Agent Deployed", 
        description: `${newAgent.name} has been successfully provisioned.` 
      });
      
      return newAgent;
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ 
        title: "Deployment Failed", 
        description: errorMessage, 
        variant: "destructive" 
      });
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  const deleteAgent = async (agentId: string): Promise<void> => {
    setDeletingId(agentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session. Please log in.");

      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok && response.status !== 204) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to decommission agent");
      }

      // Filter out the deleted agent to update the UI instantly
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      
      toast({ 
        title: "Agent Decommissioned", 
        description: "The agent has been permanently removed from your workspace." 
      });
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ 
        title: "Decommission Failed", 
        description: errorMessage, 
        variant: "destructive" 
      });
      throw err;
    } finally {
      setDeletingId(null);
    }
  };

  // Automatically fetch agents when the hook mounts
  useEffect(() => {
    fetchAgents();
    
    // Cleanup function to abort any active fetch if the component unmounts early
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAgents]);

  return { 
    agents, 
    isLoading,
    isCreating,
    deletingId,
    error, 
    fetchAgents, 
    createAgent, 
    deleteAgent 
  };
}