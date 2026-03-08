// types/chat.ts

/**
 * Represents a file attachment within a chat message.
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
 * Core domain model for a Chat Message in the multi-tenant architecture.
 */
export interface Message {
  id?: string;
  role: "user" | "assistant" | "system" | "data";
  content: string;
  attachments?: Attachment[];
  createdAt?: string | Date;
  
  // Optional metadata for semantic routing or contextual RAG payloads
  metadata?: Record<string, any>;
}

/**
 * Represents an ongoing conversation thread.
 */
export interface ChatThread {
  id: string;
  tenantId: string;
  title: string;
  messages: Message[];
  updatedAt: string | Date;
  createdAt: string | Date;
}

// ------------------------------------------------------------------
// AMBIENT DECLARATIONS
// ------------------------------------------------------------------
// This ambient module declaration acts as a polyfill to resolve the 
// "Cannot find module 'react-vega'" error without requiring a separate 
// global.d.ts file or forcing an immediate @types/ installation.

