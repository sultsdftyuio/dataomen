// components/chat/MessageList.tsx
import { Message } from "./ChatLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, FileSpreadsheet } from "lucide-react";

export function MessageList({ messages, isLoading }: { messages: Message[]; isLoading: boolean }) {
  return (
    <ScrollArea className="h-full pr-4">
      <div className="flex flex-col space-y-6 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
            <Bot className="h-16 w-16 mb-4 opacity-20" />
            <p>Analytical systems ready. Ask a question or drop a dataset.</p>
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
            
            <div className={`flex flex-col max-w-[80%] gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
              {/* Attachment Pills Rendered Inside the Chat Stream */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-end">
                  {message.attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-card border shadow-sm px-3 py-2 rounded-xl text-sm">
                      <div className="bg-primary/10 p-1.5 rounded-lg">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground leading-none">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {message.content && (
                <div
                  className={`rounded-2xl px-5 py-3.5 shadow-sm border ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground border-primary"
                      : message.isError
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                </div>
              )}
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
            <div className="rounded-2xl px-5 py-3.5 bg-card border shadow-sm flex items-center">
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