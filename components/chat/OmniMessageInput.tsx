// components/chat/OmniMessageInput.tsx

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Paperclip, 
  Send, 
  X, 
  Loader2, 
  Image as ImageIcon, 
  Database,
  FileText,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
export interface OmniMessageInputProps {
  /** * Triggered when the user submits the message. 
   * The parent orchestrator handles the file upload logic.
   */
  onSendMessage: (text: string, files: File[]) => Promise<void>;
  
  /** * True if the backend worker or compute engine is currently processing. 
   */
  isProcessing: boolean;
  
  /** * Real-time SSE/WebSocket status (e.g., "Uploading to secure storage...", "Profiling data...") 
   */
  progressStatus?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const OmniMessageInput: React.FC<OmniMessageInputProps> = ({
  onSendMessage,
  isProcessing,
  progressStatus,
}) => {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  // 1. Global Drag & Drop Management (Flicker-Free implementation)
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles((prev) => [...prev, ...droppedFiles]);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  // 2. Omni-Input: Copy-Paste Interception
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault(); // Stop standard text paste if it's a file
      const pastedFiles = Array.from(e.clipboardData.files);
      setFiles((prev) => [...prev, ...pastedFiles]);
    }
  }, []);

  // 3. Auto-Resizing Textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  // 4. Execution Submission
  const handleSubmit = async () => {
    if (isProcessing) return;
    if (!text.trim() && files.length === 0) return;

    const currentText = text.trim();
    const currentFiles = [...files];

    // Optimistic UI Reset
    setText("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"; // reset height
    }

    // Fire to parent orchestrator
    try {
      await onSendMessage(currentText, currentFiles);
    } catch (error) {
      console.error("Failed to send message:", error);
      // In a robust implementation, restore text/files here on failure
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto p-4 pt-0">
      
      {/* Global Drag Overlay (Upgraded for Hybrid Engine) */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-4 border-dashed border-blue-500/80 rounded-2xl m-4 pointer-events-none transition-all duration-300">
          <div className="text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20 animate-bounce">
              <Database className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white tracking-tight drop-shadow-sm">Drop files to add context</h2>
            <p className="text-gray-500 dark:text-slate-300 mt-3 font-medium text-lg">Structured (CSV, Parquet) or Unstructured (PDF, TXT)</p>
          </div>
        </div>
      )}

      {/* Optimistic UI Progress Stream */}
      {isProcessing && progressStatus && (
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-center space-x-2 text-sm text-blue-600 dark:text-blue-400 font-medium animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{progressStatus}</span>
        </div>
      )}

      <div
        className={`relative flex flex-col w-full bg-white dark:bg-slate-900 border transition-all duration-300 rounded-2xl overflow-hidden shadow-lg ${
          isProcessing 
            ? "border-blue-500/40 shadow-blue-500/10" 
            : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10"
        }`}
      >
        {/* Active File Pills (Contextual RAG targets) */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1 border-b border-gray-100 dark:border-slate-800/50 bg-gray-50/50 dark:bg-slate-900/50">
            {files.map((file, idx) => {
              const isDocument = file.name.match(/\.(pdf|txt|md|docx)$/i);
              
              return (
                <div key={`${file.name}-${idx}`} className="flex items-center space-x-2 bg-white dark:bg-slate-800/80 text-gray-700 dark:text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700/80 shadow-sm group">
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  ) : isDocument ? (
                    <FileText className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  )}
                  
                  <span className="max-w-[140px] truncate font-medium">{file.name}</span>
                  <span className="text-gray-400 dark:text-slate-500 text-[10px] hidden sm:inline-block">
                    {(file.size / 1024 / 1024).toFixed(2)}MB
                  </span>
                  
                  <button
                    onClick={() => removeFile(idx)}
                    disabled={isProcessing}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 focus:outline-none"
                    aria-label="Remove file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input Bar */}
        <div className="flex items-end px-3 py-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors shrink-0 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            title="Attach File"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          {/* Hidden standard input for manual fallback */}
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            accept=".csv,.json,.parquet,.pdf,.txt,.md,.docx"
            onChange={(e) => {
              if (e.target.files) {
                setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                e.target.value = ""; // Reset input so the same file can be selected again
              }
            }}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={files.length > 0 ? "Ask a question about these files..." : "Message or drop a CSV/PDF here..."}
            disabled={isProcessing}
            className="flex-1 max-h-[200px] min-h-[44px] bg-transparent text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 resize-none px-3 py-2.5 focus:outline-none focus:ring-0 disabled:opacity-50 text-sm sm:text-[15px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-700"
            rows={1}
          />

          <Button
            size="icon"
            disabled={isProcessing || (!text.trim() && files.length === 0)}
            onClick={handleSubmit}
            className={`shrink-0 ml-2 h-10 w-10 rounded-xl transition-all duration-300 shadow-sm ${
              (!text.trim() && files.length === 0) && !isProcessing
                ? "bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500 hover:bg-gray-100"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20 hover:shadow-md"
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Bottom hint */}
      <div className="text-center mt-3 text-xs text-gray-500 dark:text-slate-500 font-medium">
        <span className="hidden sm:inline">Shift + Enter for new line. </span>
        Hybrid Engine: DuckDB Analytics + Vector RAG.
      </div>
    </div>
  );
};