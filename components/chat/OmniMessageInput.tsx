"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Paperclip, 
  Mic,
  ArrowUp,
  X, 
  Loader2, 
  Image as ImageIcon, 
  Database,
  FileText,
  FileSpreadsheet,
  AtSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

const MAX_ATTACHMENTS = 8;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const TEXTAREA_MAX_HEIGHT_PX = 220;
const ACCEPTED_EXTENSIONS = ["csv", "json", "parquet", "pdf", "txt", "md", "docx"] as const;

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

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const clampedHeight = Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX);
    textarea.style.height = `${clampedHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > TEXTAREA_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, []);

  const ingestFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;

    const rejectedByType: string[] = [];
    const rejectedBySize: string[] = [];

    setFiles((prev) => {
      const next = [...prev];

      for (const file of incomingFiles) {
        const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
        if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
          rejectedByType.push(file.name);
          continue;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          rejectedBySize.push(file.name);
          continue;
        }

        const duplicate = next.some(
          (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
        );
        if (!duplicate) {
          next.push(file);
        }
      }

      return next.slice(0, MAX_ATTACHMENTS);
    });

    if (rejectedByType.length > 0) {
      toast({
        title: "Unsupported file type",
        description: `Ignored: ${rejectedByType.join(", ")}. Supported: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
        variant: "destructive",
      });
    }

    if (rejectedBySize.length > 0) {
      toast({
        title: "File too large",
        description: `Ignored: ${rejectedBySize.join(", ")}. Max size is 50MB each.`,
        variant: "destructive",
      });
    }
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

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
        ingestFiles(droppedFiles);
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
      ingestFiles(pastedFiles);
    }
  }, [ingestFiles]);

  // 3. Auto-Resizing Textarea & @ Tagging Logic
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);

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
      textareaRef.current.style.overflowY = "hidden";
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

  const handleVoiceInput = () => {
    toast({ description: "Voice capture is coming soon." });
  };

  // Filter datasets for the @ menu
  const filteredTags = availableDatasets.filter((ds) => ds.name.toLowerCase().includes(tagQuery));
  const hasText = text.trim().length > 0;
  const canSubmit = hasText || files.length > 0;
  const showComposerHint = !hasText && files.length === 0 && !isProcessing;

  return (
    <div className="sticky bottom-0 z-30 w-full bg-gradient-to-t from-slate-100/95 via-white/85 to-transparent pb-2 pt-3">
      {/* Global Drag Overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 m-6 flex items-center justify-center rounded-3xl bg-slate-900/10 shadow-[inset_0_0_0_2px_rgba(148,163,184,0.5)] backdrop-blur-sm transition-all duration-300">
          <div className="flex flex-col items-center rounded-3xl bg-white/90 p-10 text-center shadow-[0_24px_60px_-36px_rgba(15,23,42,0.6),inset_0_0_0_1px_rgba(148,163,184,0.25)] backdrop-blur-xl">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.24)]">
              <Database className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Drop files to add context</h2>
            <p className="mt-3 text-lg font-medium text-slate-500">Structured (CSV/Parquet) or Unstructured (PDF/TXT)</p>
          </div>
        </div>
      )}

      {/* Optimistic UI Progress Stream */}
      {isProcessing && progressStatus && (
        <div className="animate-in fade-in slide-in-from-bottom-2 absolute -top-9 left-0 right-0 flex items-center justify-center space-x-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          <div className="rounded-full bg-slate-200/80 p-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
          <span>{progressStatus}</span>
        </div>
      )}

      {/* @ Tagging Menu */}
      {showTagMenu && filteredTags.length > 0 && (
        <div className="custom-scrollbar animate-in fade-in slide-in-from-bottom-2 absolute bottom-full left-3 z-10 mb-3 max-h-52 w-[18.5rem] overflow-y-auto rounded-2xl bg-white/92 p-1.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.75),inset_0_0_0_1px_rgba(148,163,184,0.2)] backdrop-blur-xl">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <AtSign className="w-3 h-3" /> Select a source to route
          </div>
          {filteredTags.map((ds) => (
            <button
              key={ds.id}
              onClick={() => handleTagSelect(ds.name)}
              className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100/90 hover:text-slate-900 focus:outline-none"
            >
              <span className="truncate pr-4">{ds.name}</span>
              {ds.type === 'structured' 
                ? <Database className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 shrink-0" />
                : <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 shrink-0" />
              }
            </button>
          ))}
        </div>
      )}

      <div
        className={`relative flex w-full flex-col overflow-visible rounded-[32px] bg-white/88 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05),0_20px_48px_-36px_rgba(15,23,42,0.45),inset_0_0_0_1px_rgba(148,163,184,0.18)] backdrop-blur-2xl transition-all duration-300 ${
          isProcessing
            ? "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05),0_24px_56px_-36px_rgba(30,64,175,0.45),inset_0_0_0_1px_rgba(59,130,246,0.32)]"
            : "hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05),0_24px_52px_-36px_rgba(15,23,42,0.42),inset_0_0_0_1px_rgba(100,116,139,0.24)] focus-within:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05),0_24px_56px_-36px_rgba(30,64,175,0.55),inset_0_0_0_1px_rgba(59,130,246,0.45),0_0_0_6px_rgba(59,130,246,0.12)]"
        }`}
      >
        {/* Active File Pills */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-t-[32px] bg-slate-50/65 px-4 pb-2.5 pt-4 shadow-[inset_0_-1px_0_rgba(148,163,184,0.22)]">
            {files.map((file, idx) => {
              const isDocument = file.name.match(/\.(pdf|txt|md|docx)$/i);
              
              return (
                <div key={`${file.name}-${idx}`} className="group flex items-center space-x-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.24)] transition-colors hover:bg-white">
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  ) : isDocument ? (
                    <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                  
                  <span className="max-w-[140px] truncate font-bold text-[13px]">{file.name}</span>
                  <span className="text-slate-400 text-[10px] hidden sm:inline-block font-mono uppercase tracking-wider">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  
                  <button
                    onClick={() => removeFile(idx)}
                    disabled={isProcessing}
                    className="ml-1 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setFiles([])}
              disabled={isProcessing}
              className="ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="relative flex items-end gap-3 px-4 py-3.5">
          <div className="flex shrink-0 items-end gap-1 pb-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="rounded-full p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              title="Attach File"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <button
              onClick={handleVoiceInput}
              disabled={isProcessing}
              className="rounded-full p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              title="Voice input"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
          
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            accept=".csv,.json,.parquet,.pdf,.txt,.md,.docx"
            onChange={(e) => {
              if (e.target.files) {
                ingestFiles(Array.from(e.target.files));
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
            placeholder={files.length > 0 ? "Ask about these files" : "Ask anything"}
            disabled={isProcessing}
            className="custom-scrollbar flex-1 min-h-[46px] max-h-[220px] resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-0 disabled:opacity-50"
            rows={1}
          />

          <Button
            size="icon"
            disabled={isProcessing || !canSubmit}
            onClick={handleSubmit}
            className={`mb-1 h-10 w-10 shrink-0 rounded-full transition-all duration-300 ${
              !canSubmit
                ? "bg-slate-200/80 text-slate-400 hover:bg-slate-300/70 shadow-none"
                : hasText
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-[0_10px_24px_-14px_rgba(37,99,235,0.7)]"
                  : "bg-slate-800 text-white hover:bg-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.65)]"
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {showComposerHint && (
        <div className="mt-2 flex items-center justify-center text-[10px] font-medium tracking-[0.04em] text-slate-400">
          Shift + Enter for new line
        </div>
      )}

    </div>
  );
};