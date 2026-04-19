export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  role_description: string | null;
  dataset_id: string | null;
  document_id: string | null;
  temperature: number;
  is_active: boolean;
  created_at: string;
}

export interface AgentCreatePayload {
  name: string;
  description?: string;
  role_description: string;
  dataset_id?: string | null;
  document_id?: string | null;
  temperature: number;
}