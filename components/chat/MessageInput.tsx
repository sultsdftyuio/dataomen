// components/chat/MessageInput.tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal } from "lucide-react";

export function MessageInput({ onSend, disabled }: { onSend: (message: string) => void; disabled: boolean }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  return (
    <div className="relative flex items-end">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about your datasets..."
        className="min-h-[48px] w-full resize-none rounded-xl bg-background pr-12 py-3 text-sm focus-visible:ring-1 shadow-sm"
        rows={1}
        disabled={disabled}
      />
      <Button
        size="icon"
        className="absolute bottom-1.5 right-1.5 h-9 w-9 rounded-lg transition-transform active:scale-95"
        onClick={handleSend}
        disabled={disabled || !input.trim()}
      >
        <SendHorizontal className="h-4 w-4" />
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}