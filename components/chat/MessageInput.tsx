// components/chat/MessageInput.tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Paperclip, X, FileText } from "lucide-react";

export interface Attachment {
  file: File;
  id: string;
}

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (message: string, files: File[]) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSend(
        input.trim(),
        attachments.map((a) => a.file)
      );
      setInput("");
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        file,
        id: `${file.name}-${Date.now()}`,
      }));
      setAttachments((prev) => [...prev, ...newFiles]);
    }
    // Reset input so the same file can be selected again if removed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== idToRemove));
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  return (
    <div className="flex flex-col w-full bg-background rounded-xl shadow-sm border focus-within:ring-1 focus-within:ring-primary transition-all">
      {/* Attachment Pills Area */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-b bg-muted/30 rounded-t-xl">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 bg-card border shadow-sm px-3 py-1.5 rounded-full text-xs"
            >
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium truncate max-w-[150px]">
                {attachment.file.name}
              </span>
              <button
                onClick={() => removeAttachment(attachment.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="relative flex items-end w-full">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept=".csv,.xlsx,.xls,.json,.parquet"
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-1.5 bottom-1.5 h-9 w-9 text-muted-foreground hover:text-foreground transition-colors z-10"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Attach file</span>
        </Button>

        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or upload a dataset for analysis..."
          className="min-h-[48px] w-full resize-none border-0 bg-transparent pl-12 pr-12 py-3 text-sm focus-visible:ring-0 shadow-none"
          rows={1}
          disabled={disabled}
        />

        <Button
          size="icon"
          className="absolute bottom-1.5 right-1.5 h-9 w-9 rounded-lg transition-transform active:scale-95"
          onClick={handleSend}
          disabled={disabled || (!input.trim() && attachments.length === 0)}
        >
          <SendHorizontal className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}