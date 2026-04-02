"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Paperclip, 
  Send, 
  X, 
  Loader2, 
  Image as ImageIcon, 
  Database,
  FileText,
  FileSpreadsheet,
  AtSign
} from "lucide-react";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
export interface OmniMessageInputProps {
  onSendMessage: (text: string, files: File[]) => Promise<void>;
  isProcessing: boolean;
  progressStatus?: string;
  // New props for @ tagging
  availableDatasets?: { id: string; name: string; type: 'structured' | 'unstructured' }[];
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const OmniMessageInput: React.FC<OmniMessageInputProps> = ({
  onSendMessage,
  isProcessing,
  progressStatus,
  availableDatasets = [],
}) => {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // @ Tagging State
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState("");

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
      e.preventDefault(); 
      const pastedFiles = Array.from(e.clipboardData.files);
      setFiles((prev) => [...prev, ...pastedFiles]);
    }
  }, []);

  // 3. Auto-Resizing Textarea & @ Tagging Logic
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }

    // @ Tagging Detection
    const lastWord = newText.split(/\s+/).pop();
    if (lastWord?.startsWith("@")) {
      setTagQuery(lastWord.substring(1).toLowerCase());
      setShowTagMenu(true);
    } else {
      setShowTagMenu(false);
    }
  };

  const handleTagSelect = (datasetName: string) => {
    const words = text.split(/\s+/);
    words.pop(); // Remove the partial @ tag
    const newText = [...words, `@${datasetName} `].join(" ");
    setText(newText);
    setShowTagMenu(false);
    textareaRef.current?.focus();
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
    setShowTagMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Fire to parent orchestrator
    try {
      await onSendMessage(currentText, currentFiles);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!showTagMenu) {
        handleSubmit();
      }
    }
    // Handle Esc to close tag menu
    if (e.key === "Escape" && showTagMenu) {
      setShowTagMenu(false);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Filter datasets for the @ menu
  const filteredTags = availableDatasets.filter(ds => ds.name.toLowerCase().includes(tagQuery));

  return (
    <div className="relative w-full max-w-4xl mx-auto pt-0">
      
      {/* Global Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm border-[6px] border-dashed border-blue-500/50 rounded-3xl m-6 pointer-events-none transition-all duration-300">
          <div className="text-center flex flex-col items-center bg-white p-10 rounded-3xl shadow-2xl">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-blue-100 animate-bounce">
              <Database className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight drop-shadow-sm">Drop files to add context</h2>
            <p className="text-slate-500 mt-3 font-medium text-lg">Structured (CSV/Parquet) or Unstructured (PDF/TXT)</p>
          </div>
        </div>
      )}

      {/* Optimistic UI Progress Stream */}
      {isProcessing && progressStatus && (
        <div className="absolute -top-10 left-0 right-0 flex items-center justify-center space-x-2 text-[13px] text-blue-600 font-bold tracking-wide uppercase animate-in fade-in slide-in-from-bottom-2">
          <div className="p-1 bg-blue-100 rounded-full"><Loader2 className="w-3.5 h-3.5 animate-spin" /></div>
          <span>{progressStatus}</span>
        </div>
      )}

      {/* @ Tagging Menu */}
      {showTagMenu && filteredTags.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200/80 rounded-xl shadow-xl z-10 animate-in fade-in slide-in-from-bottom-2 p-1.5 custom-scrollbar">
          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <AtSign className="w-3 h-3" /> Select a source to route
          </div>
          {filteredTags.map((ds) => (
            <button
              key={ds.id}
              onClick={() => handleTagSelect(ds.name)}
              className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg flex items-center justify-between group transition-colors"
            >
              <span className="truncate pr-4">{ds.name}</span>
              {ds.type === 'structured' 
                ? <Database className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0" />
                : <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-500 shrink-0" />
              }
            </button>
          ))}
        </div>
      )}

      <div
        className={`relative flex flex-col w-full bg-white border transition-all duration-300 rounded-[24px] overflow-visible ${
          isProcessing 
            ? "border-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
            : "border-gray-200/80 hover:border-gray-300 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:shadow-md"
        }`}
      >
        {/* Active File Pills */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-4 pb-2 border-b border-gray-100 bg-slate-50/50 rounded-t-[24px]">
            {files.map((file, idx) => {
              const isDocument = file.name.match(/\.(pdf|txt|md|docx)$/i);
              
              return (
                <div key={`${file.name}-${idx}`} className="flex items-center space-x-2 bg-white text-slate-700 text-xs px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm group hover:border-blue-300 transition-colors">
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  ) : isDocument ? (
                    <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  
                  <span className="max-w-[140px] truncate font-bold text-[13px]">{file.name}</span>
                  <span className="text-slate-400 text-[10px] hidden sm:inline-block font-mono uppercase tracking-wider">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  
                  <button
                    onClick={() => removeFile(idx)}
                    disabled={isProcessing}
                    className="ml-1 p-0.5 text-slate-400 hover:text-white hover:bg-rose-500 rounded-md transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input Bar */}
        <div className="flex items-end px-4 py-3.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            title="Attach File"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            accept=".csv,.json,.parquet,.pdf,.txt,.md,.docx"
            onChange={(e) => {
              if (e.target.files) {
                setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                e.target.value = "";
              }
            }}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={files.length > 0 ? "Ask a question about these files..." : "Message Arcli, type @ to query a specific dataset..."}
            disabled={isProcessing}
            className="flex-1 max-h-[250px] min-h-[44px] bg-transparent text-slate-900 placeholder:text-slate-400 resize-none px-3 py-2.5 focus:outline-none focus:ring-0 disabled:opacity-50 text-[15px] font-medium leading-relaxed custom-scrollbar"
            rows={1}
          />

          <Button
            size="icon"
            disabled={isProcessing || (!text.trim() && files.length === 0)}
            onClick={handleSubmit}
            className={`shrink-0 ml-3 h-11 w-11 rounded-xl transition-all duration-300 ${
              (!text.trim() && files.length === 0) && !isProcessing
                ? "bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-none"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20"
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
          </Button>
        </div>
      </div>
      
    </div>
  );
};