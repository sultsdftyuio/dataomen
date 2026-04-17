// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Message } from "@/types/chat";
import { MessageBubble } from "@/components/MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, TrendingUp, Zap } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  onSuggestionClick: (text: string) => void;
}

const BOTTOM_SCROLL_THRESHOLD_PX = 72;

type MessageGroup = {
  id: string;
  role: Message["role"];
  items: Message[];
};

function isNearBottom(viewport: HTMLElement): boolean {
  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  return distanceFromBottom <= BOTTOM_SCROLL_THRESHOLD_PX;
}

export function MessageList({ messages, onSuggestionClick }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  const groupedMessages = useMemo<MessageGroup[]>(() => {
    if (messages.length === 0) return [];

    const groups: MessageGroup[] = [];
    for (const message of messages) {
      const previousGroup = groups[groups.length - 1];
      if (previousGroup && previousGroup.role === message.role) {
        previousGroup.items.push(message);
      } else {
        groups.push({ id: message.id, role: message.role, items: [message] });
      }
    }

    return groups;
  }, [messages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewport = container.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']");
    if (!viewport) return;

    const handleScroll = () => {
      isAtBottomRef.current = isNearBottom(viewport);
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!isAtBottomRef.current) {
      previousMessageCountRef.current = messages.length;
      return;
    }

    const hasNewMessage = messages.length !== previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    bottomRef.current?.scrollIntoView({
      behavior: hasNewMessage ? "smooth" : "auto",
      block: "end",
    });
  }, [messages]);

  return (
    <div ref={scrollContainerRef} className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-slate-50 via-slate-50/80 to-transparent" />
      <ScrollArea className="h-full w-full bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6 lg:px-8">
        {/* --- EMPTY / WELCOME STATE --- */}
        {messages.length === 0 ? (
          <div className="animate-in zoom-in-95 fade-in flex min-h-[60vh] flex-col items-center justify-center px-4 text-center duration-500">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/60 bg-white/85 shadow-sm backdrop-blur-sm">
              <Zap size={24} className="text-slate-700" />
            </div>

            <div className="mb-10 space-y-2 text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Hybrid AI Copilot</h2>
              <p className="mx-auto max-w-md text-[15px] font-medium leading-relaxed text-slate-500">
                Upload CSVs, Parquet files, or PDFs, and ask complex analytical questions across your structured and unstructured data.
              </p>
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
              <button
                onClick={() => onSuggestionClick("Show me revenue trends for the last 30 days")}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/85 p-4 text-left text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="shrink-0 rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-600 shadow-sm transition-transform group-hover:scale-105">
                  <TrendingUp size={20} />
                </div>
                <span className="text-[14px] font-bold transition-colors group-hover:text-blue-600">
                  Show me revenue trends for the last 30 days
                </span>
              </button>

              <button
                onClick={() => onSuggestionClick("Summarize the main policies in my uploaded PDF")}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/85 p-4 text-left text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="shrink-0 rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-600 shadow-sm transition-transform group-hover:scale-105">
                  <FileText size={20} />
                </div>
                <span className="text-[14px] font-bold transition-colors group-hover:text-blue-600">
                  Summarize the main policies in my uploaded PDF
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* --- MESSAGE THREAD --- */
          <div className="flex flex-col gap-8">
            {groupedMessages.map((group) => (
              <section key={group.id} className="flex flex-col gap-2">
                {group.items.map((msg, idx) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    showAvatar={idx === 0}
                    isGroupedWithPrevious={idx > 0}
                  />
                ))}
              </section>
            ))}
          </div>
        )}

        {/* Invisible anchor to control auto-scrolling */}
        <div ref={bottomRef} className="mt-4 h-4 w-full" />
      </div>
      </ScrollArea>
    </div>
  );
}