// types/chat.ts

export type Attachment = {
  id: string;
  file: File;
  previewUrl?: string; // Generated for image rendering
  status: 'pending' | 'uploading' | 'complete' | 'error';
  progress?: number;
};

// Represents the backend execution pipeline stages
export type SystemStatus = 'idle' | 'uploading' | 'profiling' | 'generating_sql' | 'executing' | 'complete' | 'error';

export type MessageRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  status?: SystemStatus; // Used to track the "Thought" process
  
  // Reserved for Phase 5 (Dynamic Rendering)
  tableData?: any[]; 
  chartConfig?: any;
  
  createdAt: Date;
};