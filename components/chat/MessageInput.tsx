"use client";

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, FileSpreadsheet, FileText, ImageIcon } from "lucide-react";

export interface Attachment {
  id: string;
  file: File;
  status: "pending" | "uploading" | "error" | "done";
  previewUrl?: string;
}

interface MessageInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  isLoading?: boolean;
}

export function MessageInput({ onSendMessage, isLoading = false }: MessageInputProps) {
  const [text, setText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize logic for the textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (text.trim() || pendingAttachments.length > 0) {
      onSendMessage(text, pendingAttachments);
      setText("");
      setPendingAttachments([]); // Clear attachments after sending to the orchestrator
      
      // Reset textarea height immediately
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Intercept Copy-Pasted files (e.g. screenshots or Excel files)
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      const files = Array.from(e.clipboardData.files);
      appendFilesAsAttachments(files);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      appendFilesAsAttachments(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const appendFilesAsAttachments = (files: File[]) => {
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
    }));
    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id?: string) => {
    if (!id) return;
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
      
      {/* File Pills Context Area */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 pb-0">
          {pendingAttachments.map((att, index) => {
            const isDocument = att.file?.name.match(/\.(pdf|txt|md|docx)$/i);
            
            return (
              <div 
                key={att.id || `pending-att-${index}`} 
                className="group relative flex items-center gap-2 bg-gray-50 pr-2 pl-3 py-1.5 rounded-lg text-sm border border-gray-200 animate-in fade-in zoom-in-95"
              >
                {att.file?.type.startsWith("image/") ? (
                   <ImageIcon className="w-4 h-4 text-blue-500" />
                ) : isDocument ? (
                   <FileText className="w-4 h-4 text-purple-500" />
                ) : (
                   <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                )}
                
                <span className="truncate max-w-[150px] font-medium text-gray-700">
                  {att.file?.name || "Attached File"}
                </span>
                
                <button 
                  onClick={() => removeAttachment(att.id)}
                  disabled={isLoading}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-all disabled:opacity-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Input */}
      <div className="flex items-end gap-2 p-3">
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept=".csv,.json,.parquet,.pdf,.txt,.md,.docx"
            onChange={handleFileSelect}
        />
        
        <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
        >
          <Paperclip className="w-5 h-5" />
          <span className="sr-only">Attach file</span>
        </Button>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask a question or drop files to analyze..."
          className="min-h-[40px] w-full resize-none border-0 bg-transparent p-2 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400 text-gray-800"
          rows={1}
          disabled={isLoading}
        />

        <Button 
            size="icon" 
            onClick={handleSend}
            disabled={(!text.trim() && pendingAttachments.length === 0) || isLoading}
            className="shrink-0 rounded-xl h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white transition-transform active:scale-95 shadow-sm"
        >
          <Send className="w-4 h-4 ml-0.5" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}