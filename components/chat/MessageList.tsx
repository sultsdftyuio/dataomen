// components/chat/MessageList.tsx
import { Message } from "./ChatLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";

export function MessageList({ messages, isLoading }: { messages: Message[]; isLoading: boolean }) {
  return (
    <ScrollArea className="h-full p-4">
      <div className="flex flex-col space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
            <Bot className="h-16 w-16 mb-4 opacity-20" />
            <p>Analytical systems ready. How can I assist you today?</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-4 ${
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <Avatar className="h-9 w-9 border shadow-sm">
              {message.role === "user" ? (
                <AvatarFallback className="bg-primary/10 text-primary"><User size={18} /></AvatarFallback>
              ) : (
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  <Bot size={18} />
                </AvatarFallback>
              )}
            </Avatar>
            
            <div
              className={`rounded-2xl px-5 py-3.5 max-w-[80%] ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : message.isError
                  ? "bg-destructive/10 text-destructive border-destructive/20 border"
                  : "bg-muted text-foreground border shadow-sm"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-4 flex-row">
            <Avatar className="h-9 w-9 border shadow-sm">
              <AvatarFallback className="bg-secondary text-secondary-foreground">
                <Bot size={18} />
              </AvatarFallback>
            </Avatar>
            <div className="rounded-2xl px-5 py-3.5 bg-muted text-foreground border shadow-sm flex items-center">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" />
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}