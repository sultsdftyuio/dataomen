"use client";

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, FileSpreadsheet, FileText, ImageIcon, AtSign, Database, Loader2 } from "lucide-react";

export interface Attachment {
  id: string;
  file: File;
  status: "pending" | "uploading" | "error" | "done";
  previewUrl?: string;
}

interface MessageInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  isLoading?: boolean;
  availableDatasets?: { id: string; name: string; type: 'structured' | 'unstructured' }[];
}

export function MessageInput({ onSendMessage, isLoading = false, availableDatasets = [] }: MessageInputProps) {
  const [text, setText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // @ Tagging State
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState("");

  // Auto-resize logic for the textarea based on content
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    
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

  const handleSend = () => {
    if (text.trim() || pendingAttachments.length > 0) {
      onSendMessage(text, pendingAttachments);
      setText("");
      setPendingAttachments([]); // Clear attachments after sending to the orchestrator
      setShowTagMenu(false);
      
      // Reset textarea height immediately
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!showTagMenu) {
        handleSend();
      }
    }
    // Handle Esc to close tag menu
    if (e.key === "Escape" && showTagMenu) {
      setShowTagMenu(false);
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

  const filteredTags = availableDatasets.filter(ds => ds.name.toLowerCase().includes(tagQuery));

  return (
    <div className="relative w-full">
      
      {/* @ Tagging Menu */}
      {showTagMenu && filteredTags.length > 0 && (
        <div className="absolute bottom-full left-4 mb-3 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200/80 rounded-xl shadow-xl z-10 animate-in fade-in slide-in-from-bottom-2 p-1.5 custom-scrollbar">
          <div className="px-3 py-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5" /> Select a source to route
          </div>
          {filteredTags.map((ds) => (
            <button
              key={ds.id}
              onClick={() => handleTagSelect(ds.name)}
              className="w-full text-left px-3 py-2.5 text-[13px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg flex items-center justify-between group transition-colors"
            >
              <span className="truncate pr-4">{ds.name}</span>
              {ds.type === 'structured' 
                ? <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0 transition-colors" />
                : <FileText className="w-4 h-4 text-slate-400 group-hover:text-purple-500 shrink-0 transition-colors" />
              }
            </button>
          ))}
        </div>
      )}

      <div className={`flex flex-col rounded-[24px] border bg-white transition-all overflow-hidden ${
        isLoading 
          ? "border-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
          : "border-gray-200/80 hover:border-gray-300 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:shadow-md"
      }`}>
        
        {/* File Pills Context Area */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-4 pb-2 border-b border-gray-100 bg-slate-50/50 rounded-t-[24px]">
            {pendingAttachments.map((att, index) => {
              const isDocument = att.file?.name.match(/\.(pdf|txt|md|docx)$/i);
              
              return (
                <div 
                  key={att.id || `pending-att-${index}`} 
                  className="group relative flex items-center gap-2.5 bg-white pr-2 pl-3 py-1.5 rounded-lg border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 hover:border-blue-300 transition-colors"
                >
                  <div className={`p-1.5 rounded-md border ${isDocument ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    {att.file?.type.startsWith("image/") ? (
                        <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                    ) : isDocument ? (
                        <FileText className="w-3.5 h-3.5" />
                    ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                  </div>
                  
                  <div className="flex flex-col text-left mr-1">
                    <span className="truncate max-w-[150px] font-bold text-[12px] text-slate-700 leading-tight">
                      {att.file?.name || "Attached File"}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {(att.file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => removeAttachment(att.id)}
                    disabled={isLoading}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-rose-500 hover:text-white text-slate-400 transition-colors disabled:opacity-0 focus:outline-none"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Primary Input */}
        <div className="flex items-end px-4 py-3.5 gap-2">
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
              className="shrink-0 h-11 w-11 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
          >
            <Paperclip className="w-5 h-5" />
            <span className="sr-only">Attach file</span>
          </Button>

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={pendingAttachments.length > 0 ? "Ask a question about these files..." : "Message Arcli, type @ to query a specific dataset..."}
            className="flex-1 min-h-[44px] max-h-[250px] resize-none border-0 bg-transparent p-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-400 text-slate-900 font-medium text-[15px] leading-relaxed custom-scrollbar"
            rows={1}
            disabled={isLoading}
          />

          <Button 
              size="icon" 
              onClick={handleSend}
              disabled={(!text.trim() && pendingAttachments.length === 0) || isLoading}
              className={`shrink-0 rounded-xl h-11 w-11 transition-all duration-300 ${
                (!text.trim() && pendingAttachments.length === 0) && !isLoading
                  ? "bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-none"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-95"
              }`}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}