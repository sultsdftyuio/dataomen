// components/chat/MessageInput.tsx
"use client";

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, FileSpreadsheet, ImageIcon } from "lucide-react";
import { Attachment } from "@/types/chat";

interface MessageInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  pendingAttachments: Attachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}

export function MessageInput({ onSendMessage, pendingAttachments, setPendingAttachments }: MessageInputProps) {
  const [text, setText] = useState("");
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

  const removeAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
      {/* File Pills Context Area */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 pb-0">
          {pendingAttachments.map((att) => (
            <div key={att.id} className="group relative flex items-center gap-2 bg-muted pr-2 pl-3 py-1.5 rounded-full text-sm border border-border animate-in fade-in zoom-in-95">
              {att.file.type.startsWith("image/") ? (
                 <ImageIcon className="w-4 h-4 text-blue-500" />
              ) : (
                 <FileSpreadsheet className="w-4 h-4 text-green-600" />
              )}
              <span className="truncate max-w-[150px] font-medium">{att.file.name}</span>
              <button 
                onClick={() => removeAttachment(att.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Primary Input */}
      <div className="flex items-end gap-2 p-3">
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            onChange={handleFileSelect}
        />
        <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
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
          placeholder="Ask anything or drop files here..."
          className="min-h-[40px] w-full resize-none border-0 bg-transparent p-2 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
          rows={1}
        />

        <Button 
            size="icon" 
            onClick={handleSend}
            disabled={!text.trim() && pendingAttachments.length === 0}
            className="shrink-0 rounded-full h-10 w-10 transition-transform active:scale-95"
        >
          <Send className="w-4 h-4 ml-0.5" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}