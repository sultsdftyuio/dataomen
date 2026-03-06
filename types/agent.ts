export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  dataset_ids: string[];
  created_at: string;
}

export interface AgentCreatePayload {
  name: string;
  description?: string;
  system_prompt: string;
  dataset_ids: string[];
}