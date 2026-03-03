import { useState, useCallback } from 'react';
import { AgentRuleCreate, AgentRuleInDB } from '@/types/agent';

export function useAgents() {
  const [agents, setAgents] = useState<AgentRuleInDB[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Assumes your Vercel Next.js routes API requests to your Python backend 
      // or you are hitting the Python backend directly with auth headers attached.
      const response = await fetch('/api/v1/agents', {
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${token}` // Inject Supabase JWT here
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data: AgentRuleInDB[] = await response.json();
      setAgents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAgent = async (payload: AgentRuleCreate) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) throw new Error('Failed to create agent');
      const newAgent: AgentRuleInDB = await response.json();
      setAgents((prev) => [...prev, newAgent]);
      return newAgent;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { agents, isLoading, error, fetchAgents, createAgent };
}