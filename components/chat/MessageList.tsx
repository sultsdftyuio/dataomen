// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { DashboardCard } from "@/components/chat/DashboardCard";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, FileText, Table2, Activity,
  ChevronRight, Code2, FlaskConical,
  AlertTriangle, ArrowDown, Copy, Check,
  UserRound, Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors ChatLayout's split-store architecture)
// ---------------------------------------------------------------------------

export interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  files?: File[];
  payload?: ExecutionPayload;
  timestamp: Date;
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
  error?: string;
  warnings?: string[];
  traces?: Array<{ stage?: string; status?: string; execution_time_ms?: number }>;
}

export type HeavyMessageData = Pick<RichMessage, "payload" | "plan" | "sql" | "insights" | "diagnostics">;

export type UIMessage = Omit<RichMessage, "payload" | "plan" | "sql" | "insights" | "diagnostics"> & {
  hasPayload?: boolean;
  hasPlan?: boolean;
  hasSql?: boolean;
  hasInsights?: boolean;
  hasDiagnostics?: boolean;
};

export interface MessageListProps {
  messages: UIMessage[];
  messageDataStore: Record<string, HeavyMessageData>;
  /** Agent display name */
  agentName?: string;
  /** Currently streaming */
  isProcessing?: boolean;
  /** Live progress status string */
  progressStatus?: string;
  /** Completed thinking step labels */
  completedSteps?: string[];
  /** Callbacks */
  onRetry?: (messageId: string) => void;
  onCopy?: (text: string) => void;
  onFeedback?: (type: "helpful" | "needs_work") => void;
  /** Ref for scroll anchor */
  scrollAnchorRef?: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOTTOM_SCROLL_THRESHOLD_PX = 72;

const PROSE_CLS =
  "prose prose-slate dark:prose-invert max-w-none text-[15px] leading-7 sm:text-base prose-p:my-2 prose-p:leading-7 prose-headings:mb-1.5 prose-headings:mt-4 prose-headings:font-semibold prose-headings:leading-tight prose-headings:tracking-tight prose-headings:text-slate-900 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-slate-900 prose-code:rounded-md prose-code:bg-slate-100/90 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none prose-table:my-4 prose-table:w-full prose-th:bg-slate-50/70 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:text-[11px] prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-slate-500 prose-td:px-4 prose-td:py-2 prose-td:text-slate-700";

// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function safePrettyJson(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ""); }
}

function ThinkingStep({ label, done }: { label: string; done?: boolean }) {
  if (!label) return null;
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-50/80 to-indigo-50/60 px-3 py-1.5 text-[11px] font-semibold text-blue-700/80 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.18)] backdrop-blur-sm duration-200">
      {done ? (
        <div className="rounded-full bg-emerald-100 p-0.5 shadow-[0_0_6px_rgba(16,185,129,0.3)]">
          <svg className="h-3 w-3 text-emerald-600" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
      )}
      {label}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };
  return (
    <button type="button" onClick={handleCopy}
      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-300 opacity-0 transition-opacity hover:bg-slate-800/70 group-hover/code:opacity-100">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="group/code my-4 overflow-hidden rounded-xl bg-slate-950/95 shadow-[0_18px_46px_-34px_rgba(15,23,42,0.8),inset_0_0_0_1px_rgba(148,163,184,0.2)]">
      <div className="flex items-center justify-between bg-slate-900/80 px-3 py-1.5 shadow-[inset_0_-1px_0_rgba(148,163,184,0.25)]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3 text-[13px] leading-6 text-slate-100"><code>{code}</code></pre>
    </div>
  );
}

function getCodeLang(className?: string): string {
  if (!className) return "code";
  return className.match(/language-([\w-]+)/)?.[1] || "code";
}

function ReasoningBlock({ icon, label, content, mono }: { icon: React.ReactNode; label: string; content: string; mono: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{icon} {label}</div>
      <div className={`overflow-x-auto rounded-xl p-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] ${mono ? "bg-slate-100/95" : "bg-slate-50/70"}`}>
        <code className={`block whitespace-pre-wrap break-words ${mono ? "font-mono text-[12px] leading-relaxed text-slate-700" : "text-[13px] leading-relaxed text-slate-700"}`}>{content}</code>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

type MessageGroup = { id: string; role: UIMessage["role"]; items: UIMessage[] };

function groupByRole(source: UIMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of source) {
    const prev = groups[groups.length - 1];
    if (prev && prev.role === m.role) { prev.items.push(m); }
    else { groups.push({ id: m.id, role: m.role, items: [m] }); }
  }
  return groups;
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SCROLL_THRESHOLD_PX;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function MessageList({
  messages,
  messageDataStore,
  agentName = "Arcli",
  isProcessing = false,
  progressStatus = "",
  completedSteps = [],
  onRetry,
  onCopy,
  onFeedback,
  scrollAnchorRef,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showScrollFab, setShowScrollFab] = useState(false);

  const groups = useMemo(() => groupByRole(messages), [messages]);
  const firstAssistantIdx = useMemo(() => groups.findIndex((g) => g.role === "assistant"), [groups]);

  // ── Viewport resolver ──
  const getViewport = useCallback((): HTMLElement | null => {
    const c = scrollContainerRef.current;
    if (!c) return null;
    return c.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? c;
  }, []);

  // ── Scroll tracking ──
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      isAtBottomRef.current = isNearBottom(vp);
      setShowScrollFab(!isAtBottomRef.current && messages.length > 0);
    };
    onScroll();
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [getViewport, messages.length]);

  // ── Resize auto-scroll (streaming) ──
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const target = vp.firstElementChild ?? vp;
    const obs = new ResizeObserver(() => {
      if (isAtBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    obs.observe(target);
    return () => obs.disconnect();
  }, [getViewport]);

  // ── New-message scroll ──
  useEffect(() => {
    if (!isAtBottomRef.current) { prevCountRef.current = messages.length; return; }
    const isNew = messages.length !== prevCountRef.current;
    prevCountRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: isNew ? "smooth" : "auto", block: "end" });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    isAtBottomRef.current = true;
    setShowScrollFab(false);
  }, []);

  const copyText = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); onCopy?.(text); } catch { /* noop */ }
  }, [onCopy]);

  return (
    <div ref={scrollContainerRef} className="relative h-full w-full">
      <ScrollArea className="h-full w-full">
        <div className="mx-auto w-full max-w-4xl px-5 pb-56 pt-6 sm:px-8">
          <div className="flex flex-col gap-14">
            {groups.map((group, gi) => (
              <section key={`${group.id}-${gi}`} className="flex flex-col gap-3">
                {/* Role label */}
                {group.role === "assistant" && gi === firstAssistantIdx && (
                  <div className="flex items-center gap-2 pl-1">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-indigo-500/15 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]">
                      <Sparkles className="h-3 w-3 text-blue-600" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{agentName}</span>
                  </div>
                )}
                {group.role === "user" && (
                  <div className="flex items-center justify-end gap-2 pr-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">You</span>
                    <UserRound className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {group.items.map((msg) => {
                    const heavy = messageDataStore[msg.id] || {};
                    const { payload, plan, sql, insights, diagnostics } = heavy;
                    const isLatest = msg.id === messages[messages.length - 1]?.id;
                    const hasReasoning = Boolean(msg.hasPlan || msg.hasSql || msg.hasInsights || msg.hasDiagnostics);

                    // ── System ──
                    if (msg.role === "system") {
                      return (
                        <div key={msg.id} className="mx-auto my-2 rounded-full bg-white/80 px-4 py-2 text-center text-[13px] font-medium text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]">
                          {msg.content}
                        </div>
                      );
                    }

                    // ── User ──
                    if (msg.role === "user") {
                      return (
                        <article key={msg.id} className="ml-auto w-full max-w-[46rem] pl-10 sm:pl-24">
                          {msg.files && msg.files.length > 0 && (
                            <div className="mb-2 flex flex-wrap justify-end gap-2">
                              {msg.files.map((f, i) => (
                                <div key={`${msg.id}-f-${i}`} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-slate-100/80 to-slate-50/60 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]">
                                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="max-w-[180px] truncate">{f.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {msg.content && (
                            <div className="rounded-3xl bg-gradient-to-b from-slate-100/75 to-slate-50/60 px-6 py-4 text-[15px] leading-[1.8] text-slate-800 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35),inset_0_0_0_1px_rgba(148,163,184,0.18)] transition-all duration-200">
                              {msg.content}
                            </div>
                          )}
                          <div className="mt-1 pr-1 text-right text-[11px] font-medium text-slate-400">{formatTime(msg.timestamp)}</div>
                        </article>
                      );
                    }

                    // ── Assistant ──
                    return (
                      <article key={msg.id} className="group/message w-full animate-in fade-in duration-200">
                        {/* Thinking steps */}
                        {isProcessing && isLatest && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {completedSteps.map((s) => <ThinkingStep key={s} label={s} done />)}
                            {progressStatus && !completedSteps.includes(progressStatus) && <ThinkingStep label={progressStatus} done={false} />}
                          </div>
                        )}

                        {/* Narrative text */}
                        {msg.content && (
                          <div className={PROSE_CLS}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                              code({ className, children, ...props }) {
                                const raw = String(children).replace(/\n$/, "");
                                if (!className) return <code className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]" {...props}>{children}</code>;
                                return <CodeBlock code={raw} language={getCodeLang(className)} />;
                              },
                              table: ({ children }) => <div className="my-4 overflow-x-auto rounded-xl bg-white/62 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38),inset_0_0_0_1px_rgba(148,163,184,0.2)]"><table className="w-full text-left text-sm text-slate-600">{children}</table></div>,
                              thead: ({ children }) => <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500 shadow-[inset_0_-1px_0_rgba(148,163,184,0.24)]">{children}</thead>,
                              th: ({ children }) => <th className="whitespace-nowrap px-4 py-2 font-semibold">{children}</th>,
                              td: ({ children }) => <td className="whitespace-nowrap px-4 py-2">{children}</td>,
                              tr: ({ children }) => <tr className="transition-colors hover:bg-slate-50/60 shadow-[inset_0_-1px_0_rgba(148,163,184,0.18)]">{children}</tr>,
                            }}>
                              {msg.content}
                            </ReactMarkdown>
                            {isProcessing && isLatest && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-blue-500/90 align-middle" />}
                          </div>
                        )}

                        {/* Chart / Table payload */}
                        {msg.hasPayload && payload && (
                          <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 overflow-hidden rounded-[24px] bg-white/70 p-2 ring-1 ring-slate-200/45 duration-200">
                            <div className="flex items-center justify-between px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <Table2 className="h-4 w-4 text-slate-400" />
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Analysis result</span>
                              </div>
                              <button type="button" onClick={() => copyText(JSON.stringify(payload))} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">Copy data</button>
                            </div>
                            <div className="overflow-hidden rounded-2xl bg-white/85 p-3">
                              <DynamicChartFactory payload={payload} />
                            </div>
                          </div>
                        )}

                        {/* DashboardCard handoff */}
                        {msg.hasPayload && payload?.dashboard_workspace_id && (
                          <DashboardCard
                            workspaceId={String(payload.dashboard_workspace_id)}
                            summary={payload?.executive_summary as string | undefined}
                            vizType={payload?.chart_spec ? "chart" : "table"}
                            rowCount={Array.isArray(payload?.data) ? payload.data.length : undefined}
                            sqlPreview={payload?.sql_used as string | undefined}
                          />
                        )}

                        {/* Footnote panel */}
                        <details className="group/footnote mt-4 overflow-hidden rounded-2xl bg-white/62 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)]">
                          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[11px] font-medium text-slate-500">
                            <span className="uppercase tracking-[0.12em]">Analysis footnote</span>
                            <span className="text-slate-300">•</span>
                            <span className="truncate">{hasReasoning ? "analysis" : "response tools"}</span>
                            <span className="ml-auto text-[11px]">{formatTime(msg.timestamp)}</span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open/footnote:rotate-90" />
                          </summary>

                          <div className="space-y-3 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.22)]">
                            {/* Warnings */}
                            {msg.warnings?.map((w, wi) => (
                              <div key={`${msg.id}-w-${wi}`} className="rounded-xl bg-amber-50/50 py-2 pl-3 pr-2 text-[13px] text-amber-900/80 shadow-[inset_3px_0_0_rgba(252,211,77,0.85)]">
                                <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600/80" /><span>{w}</span></div>
                              </div>
                            ))}

                            {/* Error */}
                            {msg.error && (
                              <div className="rounded-xl bg-rose-50/55 py-2 pl-3 pr-2 text-[13px] text-rose-900/80 shadow-[inset_3px_0_0_rgba(251,113,133,0.8)]">
                                <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600/80" /><span>{msg.error}</span></div>
                              </div>
                            )}

                            {/* Traces */}
                            {(msg.traces?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                {msg.traces?.slice(-5).map((t, ti) => (
                                  <span key={`${msg.id}-t-${ti}`} className="inline-flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                    {t.stage || "Step"}{typeof t.execution_time_ms === "number" ? ` | ${Math.round(t.execution_time_ms)}ms` : ""}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Reasoning panels */}
                            {hasReasoning && (
                              <div className="flex flex-col gap-3">
                                {plan && <ReasoningBlock icon={<FlaskConical className="h-3.5 w-3.5 text-slate-500" />} label="Semantic Plan" content={safePrettyJson(plan)} mono={false} />}
                                {sql && <ReasoningBlock icon={<Code2 className="h-3.5 w-3.5 text-slate-500" />} label="Compiled DuckDB SQL" content={sql} mono />}
                                {insights && <ReasoningBlock icon={<Sparkles className="h-3.5 w-3.5 text-slate-500" />} label="Statistical Insights" content={safePrettyJson(insights)} mono={false} />}
                                {diagnostics && <ReasoningBlock icon={<Activity className="h-3.5 w-3.5 text-slate-500" />} label="Diagnostics" content={safePrettyJson(diagnostics)} mono />}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-medium text-slate-500">
                              <button type="button" onClick={() => copyText(msg.content || JSON.stringify(payload))} className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700">Copy response</button>
                              <button type="button" onClick={() => onFeedback?.("helpful")} className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700">Helpful</button>
                              <button type="button" onClick={() => onFeedback?.("needs_work")} className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700">Needs work</button>
                              {onRetry && (
                                <button type="button" onClick={() => onRetry(msg.id)} disabled={isProcessing} className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Retry</button>
                              )}
                            </div>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            <div ref={(el) => {
              (bottomRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              if (scrollAnchorRef && "current" in scrollAnchorRef) {
                (scrollAnchorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
            }} className="h-4 w-full" />
          </div>
        </div>
      </ScrollArea>

      {/* Scroll-to-bottom FAB */}
      {showScrollFab && (
        <button type="button" onClick={scrollToBottom} aria-label="Scroll to bottom"
          className="animate-in fade-in slide-in-from-bottom-2 absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/90 p-2.5 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.5),inset_0_0_0_1px_rgba(148,163,184,0.25)] backdrop-blur-sm transition-all hover:bg-white hover:shadow-[0_12px_32px_-10px_rgba(15,23,42,0.55)] duration-200">
          <ArrowDown className="h-4 w-4 text-slate-600" />
        </button>
      )}
    </div>
  );
}