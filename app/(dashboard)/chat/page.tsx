"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CommandRole = "user" | "assistant";

type CommandMessage = {
  role: CommandRole;
  content: string;
  timestamp: string;
  workspaceId?: string;
};

type OrchestrateCompactResponse = {
  content?: string;
  reply?: string;
  message?: string;
  workspaceId?: string;
  dashboardId?: string;
};

const INITIAL_MESSAGE: CommandMessage = {
  role: "assistant",
  content:
    "Linear Command Center online. Ask for an analysis and I will compile a workspace route when structured output is ready.",
  timestamp: new Date().toISOString(),
};

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "now";
  }

  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<CommandMessage[]>([INITIAL_MESSAGE]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isSubmitting) {
      return;
    }

    const userMessage: CommandMessage = {
      role: "user",
      content: trimmedPrompt,
      timestamp: new Date().toISOString(),
    };

    const history = messages.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setPrompt("");
    setMessages((previous) => [...previous, userMessage]);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          history,
          stream: false,
          compact_response: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unable to reach orchestration layer.");
        throw new Error(errorText || "Unable to reach orchestration layer.");
      }

      const payload = (await response.json()) as OrchestrateCompactResponse;
      const resolvedWorkspaceId =
        typeof payload.workspaceId === "string"
          ? payload.workspaceId
          : typeof payload.dashboardId === "string"
            ? payload.dashboardId
            : undefined;

      const assistantContent =
        (typeof payload.content === "string" && payload.content.trim()) ||
        (typeof payload.reply === "string" && payload.reply.trim()) ||
        (typeof payload.message === "string" && payload.message.trim()) ||
        "Analysis complete.";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
          workspaceId: resolvedWorkspaceId,
        },
      ]);
    } catch (error: any) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `I could not complete that request. ${error?.message || "Please try again."}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(14,116,144,0.08),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(15,23,42,0.08),transparent_40%)]">
      <div className="border-b border-slate-200/80 bg-white/80 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Linear Interface</p>
              <h1 className="text-base font-bold tracking-tight text-slate-900">Command Center</h1>
            </div>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace Routing Enabled</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-10 pt-6 sm:px-6">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            const hasWorkspaceLink = Boolean(message.workspaceId);

            return (
              <div
                key={`${message.timestamp}-${index}`}
                className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
              >
                {hasWorkspaceLink ? (
                  <Card className="w-full max-w-2xl border border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/50 shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold uppercase tracking-[0.12em] text-cyan-900">
                        Analytical Workspace Compiled
                      </CardTitle>
                      <CardDescription className="text-sm font-medium leading-relaxed text-cyan-900/80">
                        {message.content}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="rounded-md border border-cyan-200 bg-white px-2.5 py-1 font-mono text-xs text-cyan-700">
                        {message.workspaceId}
                      </p>
                      <Button
                        onClick={() => {
                          router.push(`/dashboard?workspace=${encodeURIComponent(message.workspaceId || "")}`);
                        }}
                        className="h-9 rounded-lg bg-cyan-700 px-4 text-xs font-bold uppercase tracking-[0.1em] text-white hover:bg-cyan-800"
                      >
                        Open Dashboard
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div
                    className={cn(
                      "max-w-2xl rounded-2xl px-4 py-3 text-sm shadow-sm",
                      isUser
                        ? "rounded-br-sm border border-slate-900 bg-slate-900 text-white"
                        : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    <p
                      className={cn(
                        "mt-2 text-[10px] font-semibold uppercase tracking-[0.1em]",
                        isUser ? "text-slate-300" : "text-slate-400"
                      )}
                    >
                      {formatTimestamp(message.timestamp)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {isSubmitting && (
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Compiling analytical route
            </div>
          )}

          <div ref={feedEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-5xl items-end gap-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask a question and route the compiled analysis to dashboard space..."
            className="min-h-[56px] resize-none rounded-2xl border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm focus-visible:ring-cyan-200"
            disabled={isSubmitting}
          />
          <Button
            type="submit"
            disabled={isSubmitting || prompt.trim().length === 0}
            className="h-11 rounded-xl bg-slate-900 px-5 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-slate-800"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}