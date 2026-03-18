// types/chat.ts

/**
 * ARCLI.TECH - Frontend Domain Models
 * Core types for the multi-tenant Zero-ETL chat interface.
 */

export interface Attachment {
  id?: string;
  file?: File;
  name?: string;
  url?: string;
  size?: number;
  type?: string;
}

/**
 * Core domain model for a Chat Message.
 * Extended to support Zero-ETL data payloads, SQL debugging, and Vega-Lite charts.
 */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "data";
  content: string; // The natural language text/summary
  
  // --- Dataomen specific execution payloads ---
  data?: any[];                // Raw row data returned from DuckDB
  chartSpec?: any;             // Declarative Vega-Lite JSON specification
  sql?: string;                // The generated DuckDB SQL (for "Show Code" UI)
  executionTimeMs?: number;    // Backend latency tracking
  status?: "success" | "execution_error" | "insufficient_data" | "error";
  
  attachments?: Attachment[];
  createdAt?: string | Date;
  
  // Optional metadata for semantic routing or contextual RAG payloads
  metadata?: Record<string, any>;
}

/**
 * Represents an ongoing conversation thread with a specific Data Agent.
 */
export interface ChatThread {
  id: string;
  tenantId: string;
  agentId: string; // Ties the conversation context to a specific agent's datasets
  title: string;
  messages: Message[];
  updatedAt: string | Date;
  createdAt: string | Date;
}

// ------------------------------------------------------------------
// API CONTRACTS (Strict mapping to FastAPI chat_router.py)
// ------------------------------------------------------------------

export interface ChatRequestPayload {
  agent_id: string;
  message: string;
  history: { role: string; content: string }[];
}

export interface ChatResponsePayload {
  status: string;
  response_text: string;
  execution_time_ms: number;
  row_count?: number;
  data?: any[];
  chart_spec?: any;
  generated_sql?: string;
}