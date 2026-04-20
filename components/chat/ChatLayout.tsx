// components/chat/ChatLayout.tsx
"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings2, Sparkles, FileText,
  FileSpreadsheet, Database, Activity,
  Plus, ChevronDown, MoreHorizontal,
  Table2, TrendingUp, Search, Zap,
  ChevronRight, Code2, FlaskConical,
  ShieldCheck, CircleStop, AlertTriangle,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
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

interface ChatLayoutProps {
  agentId?: string;
  agentName?: string;
}

type HeavyMessageData = Pick<RichMessage, "payload" | "plan" | "sql" | "insights" | "diagnostics">;

type UIMessage = Omit<RichMessage, "payload" | "plan" | "sql" | "insights" | "diagnostics"> & {
  hasPayload?: boolean;
  hasPlan?: boolean;
  hasSql?: boolean;
  hasInsights?: boolean;
  hasDiagnostics?: boolean;
};

const MAX_MESSAGE_HISTORY = 100;
const STREAM_TIMEOUT_MS = 30_000;
const STREAM_FLUSH_INTERVAL_MS = 50;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(["csv", "json", "parquet", "pdf", "txt", "md", "docx"]);
const SYSTEM_HISTORY_LIMIT = 2;
const CONVERSATION_HISTORY_LIMIT = 8;
const MAX_RENDERED_MESSAGES = 40;
const BOTTOM_SCROLL_THRESHOLD_PX = 72;

type MessageGroup = {
  id: string;
  role: UIMessage["role"];
  items: UIMessage[];
};

function groupMessagesByRole(source: UIMessage[]): MessageGroup[] {
  if (source.length === 0) return [];

  const groups: MessageGroup[] = [];
  for (const message of source) {
    const previousGroup = groups[groups.length - 1];
    if (previousGroup && previousGroup.role === message.role) {
      previousGroup.items.push(message);
      continue;
    }

    groups.push({
      id: message.id,
      role: message.role,
      items: [message],
    });
  }

  return groups;
}

function isViewportNearBottom(viewport: HTMLElement): boolean {
  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  return distanceFromBottom <= BOTTOM_SCROLL_THRESHOLD_PX;
}

function appendMessagesCapped<T>(prev: T[], ...incoming: T[]): T[] {
  return [...prev, ...incoming].slice(-MAX_MESSAGE_HISTORY);
}

function safePrettyJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<T>> {
  return await new Promise<ReadableStreamReadResult<T>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Stream timeout")), timeoutMs);
    reader.read().then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

function validateUploadFile(file: File): void {
  const extension = getFileExtension(file.name);
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`File too large: ${file.name}. Max size is 50MB.`);
  }
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const deduped: File[] = [];

  for (const file of files) {
    const key = `${file.name}::${file.size}::${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(file);
  }

  return deduped;
}

function buildConversationHistory(messages: UIMessage[], promptText: string): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const withContent = messages.filter((m) => typeof m.content === "string" && m.content.trim().length > 0);
  const systemMessages = withContent.filter((m) => m.role === "system").slice(-SYSTEM_HISTORY_LIMIT);
  const conversationalMessages = withContent.filter((m) => m.role !== "system").slice(-CONVERSATION_HISTORY_LIMIT);

  return [
    ...systemMessages.map((m) => ({ role: m.role, content: m.content as string })),
    ...conversationalMessages.map((m) => ({ role: m.role, content: m.content as string })),
    { role: "user", content: promptText },
  ];
}

// -----------------------------------------------------------------------------
// Markdown-lite renderer (Engineered Typography)
// -----------------------------------------------------------------------------
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-extrabold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[13px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// Step / Thinking Pill
// -----------------------------------------------------------------------------
function ThinkingStep({ label, done }: { label: string; done?: boolean }) {
  if (!label) return null;
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-500">
      {done ? (
        <div className="rounded-full bg-slate-200/80 p-0.5">
          <svg className="h-3 w-3 text-slate-600" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200/70">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-slate-500" />
        </span>
      )}
      {label}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chain-of-Thought Panel (DuckDB Trace)
// -----------------------------------------------------------------------------
function ReasoningPanel({ plan, sql, insights, diagnostics }: {
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
}) {
  const hasContent = plan || sql || insights || diagnostics;
  const planText = useMemo(() => (plan ? safePrettyJson(plan) : ""), [plan]);
  const insightsText = useMemo(() => (insights ? safePrettyJson(insights) : ""), [insights]);
  const diagnosticsText = useMemo(() => (diagnostics ? safePrettyJson(diagnostics) : ""), [diagnostics]);
  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-3">
      {plan && (
        <ReasoningBlock
          icon={<FlaskConical className="h-3.5 w-3.5 text-slate-500" />}
          label="Semantic Plan"
          content={planText}
          mono={false}
        />
      )}
      {sql && (
        <ReasoningBlock
          icon={<Code2 className="h-3.5 w-3.5 text-slate-500" />}
          label="Compiled DuckDB SQL"
          content={sql}
          mono
        />
      )}
      {insights && (
        <ReasoningBlock
          icon={<Sparkles className="h-3.5 w-3.5 text-slate-500" />}
          label="Statistical Insights"
          content={insightsText}
          mono={false}
        />
      )}
      {diagnostics && (
        <ReasoningBlock
          icon={<Activity className="h-3.5 w-3.5 text-slate-500" />}
          label="Diagnostics"
          content={diagnosticsText}
          mono
        />
      )}
    </div>
  );
}

function ReasoningBlock({ icon, label, content, mono }: { icon: React.ReactNode; label: string; content: string; mono: boolean; }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {icon} {label}
      </div>
      <div className={`overflow-x-auto rounded-xl p-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] ${mono ? "bg-slate-100/95" : "bg-slate-50/70"}`}>
        <code className={`block whitespace-pre-wrap break-words ${mono ? "font-mono text-[12px] leading-relaxed text-slate-700" : "text-[13px] leading-relaxed text-slate-700"}`}>
          {content}
        </code>
      </div>
    </div>
  );
}

function AssistantTextContent({
  content,
  showStreamingCaret,
}: {
  content: string;
  showStreamingCaret: boolean;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);

  return (
    <div className="prose prose-slate max-w-none text-[15px] leading-7 text-slate-900 prose-p:my-2 prose-p:leading-7 prose-headings:text-slate-900">
      {lines.map((line, i) => (
        <p key={i} className="min-h-7 transition-opacity duration-200">
          <SimpleMarkdown text={line} />
          {showStreamingCaret && i === lines.length - 1 && (
            <span className="inline-block h-4 w-1.5 ml-1 rounded-full bg-blue-500/90 align-middle animate-pulse" />
          )}
        </p>
      ))}
    </div>
  );
}
// -----------------------------------------------------------------------------
// Timestamp formatter
// -----------------------------------------------------------------------------
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const FRIENDLY_STATUS_MAP: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /securing|boundary|authorized/i, label: "Securing your workspace" },
  { pattern: /semantic routing|routing|partitions/i, label: "Finding the right data" },
  { pattern: /plan|planning|strategy|architecting/i, label: "Planning the best approach" },
  { pattern: /compile|sql|query/i, label: "Building your query" },
  { pattern: /executing|warehouse|distributed|compute/i, label: "Running analysis" },
  { pattern: /extracting|statistical|insight/i, label: "Extracting insights" },
  { pattern: /investigating|diagnostic|anomaly/i, label: "Investigating anomalies" },
  { pattern: /narrative|summary|synthesizing/i, label: "Writing your summary" },
  { pattern: /cache/i, label: "Loading from cache" },
  { pattern: /warming|allocating|wake up/i, label: "Warming up the engine" },
];

function toFriendlyStatus(rawStatus: string): string {
  const normalized = (rawStatus || "").trim();
  if (!normalized) return "Working...";
  const matched = FRIENDLY_STATUS_MAP.find((entry) => entry.pattern.test(normalized));
  return matched?.label || normalized;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const ChatLayout: React.FC<ChatLayoutProps> = ({
  agentId = "default-router",
  agentName = "Arcli",
}) => {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  const [activeDocumentIds, setActiveDocumentIds] = useState<string[]>([]);
  const [availableDatasets, setAvailableDatasets] = useState<Array<{ id: string; name: string; type: "structured" | "unstructured" }>>([]);
  const [isHydratingDatasets, setIsHydratingDatasets] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [isCommandStripCompact, setIsCommandStripCompact] = useState(false);

  const visibleMessages = useMemo(
    () => (showAllMessages ? messages : messages.slice(-MAX_RENDERED_MESSAGES)),
    [messages, showAllMessages],
  );
  const groupedVisibleMessages = useMemo(() => groupMessagesByRole(visibleMessages), [visibleMessages]);
  const firstAssistantGroupIndex = useMemo(
    () => groupedVisibleMessages.findIndex((group) => group.role === "assistant"),
    [groupedVisibleMessages],
  );
  const hiddenMessageCount = messages.length - visibleMessages.length;

  const messagesRef = useRef<UIMessage[]>([]);
  const messageDataStoreRef = useRef<Record<string, HeavyMessageData>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const previousRenderedMessageCountRef = useRef(0);
  const sendLockRef = useRef(false);
  const lastRawStatusRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadControllersRef = useRef<Set<AbortController>>(new Set());
  const bufferedContentRef = useRef("");
  const bufferedAssistantIdRef = useRef<string | null>(null);

  const pruneHeavyDataStore = useCallback((nextMessages: UIMessage[]) => {
    const keepIds = new Set(nextMessages.map((m) => m.id));
    for (const key of Object.keys(messageDataStoreRef.current)) {
      if (!keepIds.has(key)) {
        delete messageDataStoreRef.current[key];
      }
    }
  }, []);

  const setMessagesCapped = useCallback((updater: (prev: UIMessage[]) => UIMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      const capped = next.length > MAX_MESSAGE_HISTORY ? next.slice(-MAX_MESSAGE_HISTORY) : next;
      pruneHeavyDataStore(capped);
      return capped;
    });
  }, [pruneHeavyDataStore]);

  const upsertMessageData = useCallback((messageId: string, patch: Partial<HeavyMessageData>) => {
    messageDataStoreRef.current[messageId] = {
      ...(messageDataStoreRef.current[messageId] || {}),
      ...patch,
    };
  }, []);

  const flushBufferedContentToState = useCallback(() => {
    const assistantId = bufferedAssistantIdRef.current;
    const chunk = bufferedContentRef.current;
    if (!assistantId || !chunk) return;

    bufferedContentRef.current = "";
    setMessagesCapped((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: `${m.content || ""}${chunk}` }
          : m,
      ),
    );
  }, [setMessagesCapped]);

  const abortInFlightOperations = useCallback(() => {
    abortControllerRef.current?.abort();
    for (const controller of uploadControllersRef.current) {
      controller.abort();
    }
    uploadControllersRef.current.clear();
    bufferedContentRef.current = "";
    bufferedAssistantIdRef.current = null;
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewport = container.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']");
    if (!viewport) return;

    const handleScroll = () => {
      isAtBottomRef.current = isViewportNearBottom(viewport);
      const shouldCompact = viewport.scrollTop > 28;
      setIsCommandStripCompact((prev) => (prev === shouldCompact ? prev : shouldCompact));
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setIsCommandStripCompact(false);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!isAtBottomRef.current) {
      previousRenderedMessageCountRef.current = messages.length;
      return;
    }

    const hasNewMessage = messages.length !== previousRenderedMessageCountRef.current;
    previousRenderedMessageCountRef.current = messages.length;

    scrollAnchorRef.current?.scrollIntoView({
      behavior: hasNewMessage ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, progressStatus, isProcessing]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      flushBufferedContentToState();
    }, STREAM_FLUSH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [flushBufferedContentToState]);

  useEffect(() => {
    return () => {
      abortInFlightOperations();
    };
  }, [abortInFlightOperations]);

  const hydrateAvailableDatasets = async () => {
    if (isHydratingDatasets) return;
    setIsHydratingDatasets(true);
    try {
      const res = await fetch("/api/datasets/", { method: "GET" });
      if (!res.ok) return;
      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : [];
      const mapped = list
        .map((item: any) => {
          const name = typeof item?.name === "string" ? item.name : "Untitled Dataset";
          const id = typeof item?.id === "string" ? item.id : "";
          const filePath = typeof item?.file_path === "string" ? item.file_path : "";
          const type = /\.(pdf|txt|md|docx)$/i.test(filePath) ? "unstructured" : "structured";
          if (!id) return null;
          return { id, name, type } as { id: string; name: string; type: "structured" | "unstructured" };
        })
        .filter(Boolean) as Array<{ id: string; name: string; type: "structured" | "unstructured" }>;

      const unique = mapped.filter((item, idx, arr) => arr.findIndex((p) => p.id === item.id) === idx);
      setAvailableDatasets(unique);
    } catch {
      // non-blocking: @ dataset suggestions are optional UX sugar
    } finally {
      setIsHydratingDatasets(false);
    }
  };

  useEffect(() => {
    void hydrateAvailableDatasets();
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: "Copied to clipboard", duration: 2000 });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard permission is unavailable.", variant: "destructive" });
    }
  };

  const resetConversation = () => {
    abortInFlightOperations();
    sendLockRef.current = false;
    setIsProcessing(false);
    messageDataStoreRef.current = {};
    setMessages([]);
    setProgressStatus("");
    setCompletedSteps([]);
  };

  const clearDataContext = () => {
    setActiveDatasetIds([]);
    setActiveDocumentIds([]);
    toast({ description: "Data context cleared. Next question starts fresh." });
  };

  const stopStreaming = () => {
    if (!isProcessing && !sendLockRef.current) return;
    abortInFlightOperations();
    sendLockRef.current = false;
    setProgressStatus("Stopped by you");
    setIsProcessing(false);
    toast({ description: "Generation stopped." });
  };

  // ---------------------------------------------------------------------------
  // Upgraded Hybrid Upload Pipeline
  // ---------------------------------------------------------------------------
  const handleHybridUpload = async (file: File): Promise<{ id: string; isDoc: boolean }> => {
    validateUploadFile(file);
    setProgressStatus(`Ingesting ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dataset_name", file.name);

    const uploadController = new AbortController();
    uploadControllersRef.current.add(uploadController);

    let uploadRes: Response;
    try {
      uploadRes = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
        signal: uploadController.signal,
      });
    } finally {
      uploadControllersRef.current.delete(uploadController);
    }

    if (!uploadRes.ok) throw new Error(`Ingestion failed for ${file.name}`);

    const data = await uploadRes.json();
    const extractedId = data.storage_path?.split("/").pop() || data.dataset_id;
    const isDoc = file.name.match(/\.(pdf|txt|md|docx)$/i) !== null;

    return { id: extractedId, isDoc };
  };

  // ---------------------------------------------------------------------------
  // Orchestration (SSE Streaming Integration)
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (sendLockRef.current) return;
    sendLockRef.current = true;

    const promptText = text.trim();
    const dedupedFiles = dedupeFiles(files);

    if (dedupedFiles.length !== files.length) {
      toast({ description: "Duplicate files were removed before upload." });
    }

    try {
      dedupedFiles.forEach(validateUploadFile);
    } catch (validationError: any) {
      sendLockRef.current = false;
      toast({
        title: "Upload blocked",
        description: validationError?.message || "One or more files are invalid.",
        variant: "destructive",
      });
      return;
    }

    if (!promptText && dedupedFiles.length === 0) {
      sendLockRef.current = false;
      return;
    }

    const userMsg: UIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: promptText,
      files: dedupedFiles,
      timestamp: new Date(),
    };

    setMessagesCapped((prev) => appendMessagesCapped(prev, userMsg));
    setIsProcessing(true);
    setCompletedSteps([]);
    setProgressStatus("");
    lastRawStatusRef.current = "";

    let assistantMsgId: string | null = null;

    try {
      let currentDatasetIds = [...activeDatasetIds];
      let currentDocumentIds = [...activeDocumentIds];

      if (dedupedFiles.length > 0) {
        setCompletedSteps((prev) => [...prev, "Uploading files"]);
        const results = await Promise.all(dedupedFiles.map(handleHybridUpload));

        const newDatasets = results.filter((r) => !r.isDoc).map((r) => r.id);
        const newDocs = results.filter((r) => r.isDoc).map((r) => r.id);

        currentDatasetIds = [...new Set([...currentDatasetIds, ...newDatasets])];
        currentDocumentIds = [...new Set([...currentDocumentIds, ...newDocs])];

        setActiveDatasetIds(currentDatasetIds);
        setActiveDocumentIds(currentDocumentIds);
      }

      const history = buildConversationHistory(messagesRef.current, promptText);

      assistantMsgId = (Date.now() + 1).toString();
      bufferedAssistantIdRef.current = assistantMsgId;
      bufferedContentRef.current = "";
      setMessagesCapped((prev) => appendMessagesCapped(prev, {
        id: assistantMsgId as string,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        hasPayload: false,
        hasPlan: false,
        hasSql: false,
        hasInsights: false,
        hasDiagnostics: false,
      }));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: promptText,
          active_dataset_ids: currentDatasetIds,
          active_document_ids: currentDocumentIds,
          history,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("The analytical engine encountered an error.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let doneReading = false;
      let buffer = "";
      let lastChunkTime = Date.now();

      while (!doneReading) {
        const { value, done } = await readWithTimeout(reader, STREAM_TIMEOUT_MS);
        if (done) {
          doneReading = true;
          break;
        }
        lastChunkTime = Date.now();

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "").trim();
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            const { type, content, message } = parsed;

            switch (type) {
              case "status": {
                const rawStatus = String(content || message || "");
                if (rawStatus === lastRawStatusRef.current) {
                  break;
                }
                lastRawStatusRef.current = rawStatus;
                const friendly = toFriendlyStatus(rawStatus);
                setProgressStatus((currentStatus) => {
                  if (currentStatus && currentStatus !== friendly) {
                    setCompletedSteps((prev) => (prev.includes(currentStatus) ? prev : [...prev, currentStatus]));
                  }
                  return friendly;
                });
                break;
              }

              case "job_queued":
                setProgressStatus("Queued. Preparing your workspace");
                break;

              case "warning":
                if (!assistantMsgId) break;
                setMessagesCapped((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, warnings: [...(m.warnings || []), String(content || message || "Warning received")] }
                      : m
                  )
                );
                break;

              case "technical_trace":
                if (!assistantMsgId) break;
                if (content?.stage) {
                  const traceStep = `Completed: ${content.stage}`;
                  setCompletedSteps((prev) => (prev.includes(traceStep) ? prev : [...prev, traceStep]));
                }
                setMessagesCapped((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, traces: [...(m.traces || []), content || {}] }
                      : m
                  )
                );
                break;

              case "plan":
                if (!assistantMsgId) break;
                upsertMessageData(assistantMsgId, { plan: content });
                setMessagesCapped((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, hasPlan: true } : m)));
                break;

              case "sql":
                if (!assistantMsgId) break;
                upsertMessageData(assistantMsgId, { sql: content });
                setMessagesCapped((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, hasSql: true } : m)));
                break;

              case "insights":
                if (!assistantMsgId) break;
                upsertMessageData(assistantMsgId, { insights: content });
                setMessagesCapped((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, hasInsights: true } : m)));
                break;

              case "diagnostics":
                if (!assistantMsgId) break;
                upsertMessageData(assistantMsgId, { diagnostics: content });
                setMessagesCapped((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, hasDiagnostics: true } : m)));
                break;

              case "narrative":
              case "narrative_chunk":
                if (!assistantMsgId) break;
                bufferedAssistantIdRef.current = assistantMsgId;
                bufferedContentRef.current += String(content?.executive_summary || content || message || "");
                break;

              case "data":
              case "cache_hit":
                if (!assistantMsgId) break;
                flushBufferedContentToState();
                setCompletedSteps((prev) => (prev.includes("Ready") ? prev : [...prev, "Ready"]));
                upsertMessageData(assistantMsgId, { payload: content });
                setMessagesCapped((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, hasPayload: true } : m)));
                doneReading = true;
                break;

              case "error":
                if (!assistantMsgId) break;
                flushBufferedContentToState();
                toast({ title: "Error", description: content || message, variant: "destructive" });
                setMessagesCapped((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          error: String(content || message || "Unknown error"),
                          content: `${m.content || ""}${m.content ? "\n\n" : ""}**Error:** ${content || message}`,
                        }
                      : m
                  )
                );
                doneReading = true;
                break;

              case "done":
                doneReading = true;
                break;
            }
          } catch {
            console.error("Failed to parse SSE chunk:", dataStr);
          }
        }
      }

      if (Date.now() - lastChunkTime > STREAM_TIMEOUT_MS) {
        throw new Error("Stream timeout");
      }

      const trailing = buffer.trim();
      if (trailing.startsWith("data: ")) {
        const trailingData = trailing.replace("data: ", "").trim();
        if (trailingData) {
          try {
            const parsed = JSON.parse(trailingData);
            if (parsed?.type === "done") {
              doneReading = true;
            }
          } catch {
            // ignore incomplete trailing chunk
          }
        }
      }

      flushBufferedContentToState();
    } catch (err: any) {
      flushBufferedContentToState();

      if (err?.name === "AbortError") {
        if (assistantMsgId) {
          setMessagesCapped((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `${m.content || ""}${m.content ? "\n\n" : ""}*Generation stopped.*` }
                : m
            )
          );
        }
        return;
      }

      const errorMessage = err?.message || "An unexpected error occurred.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setMessagesCapped((prev) => {
        const hasAssistant = assistantMsgId && prev.some((m) => m.id === assistantMsgId);
        if (hasAssistant) {
          return prev.map((m) =>
            m.id === assistantMsgId ? { ...m, error: errorMessage, content: `**Error:** ${errorMessage}` } : m
          );
        }
        return appendMessagesCapped(prev, {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `**Error:** ${errorMessage}`,
          error: errorMessage,
          timestamp: new Date(),
        });
      });
    } finally {
      flushBufferedContentToState();
      bufferedContentRef.current = "";
      bufferedAssistantIdRef.current = null;
      sendLockRef.current = false;
      abortControllerRef.current = null;
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  const retryFromAssistant = async (assistantMessageId: string) => {
    if (isProcessing) return;
    const assistantIdx = messages.findIndex((m) => m.id === assistantMessageId);
    if (assistantIdx <= 0) return;

    for (let i = assistantIdx - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate.role === "user" && ((candidate.content && candidate.content.trim()) || candidate.files?.length)) {
        await handleSendMessage(candidate.content || "", candidate.files || []);
        return;
      }
    }

    toast({ description: "No user prompt found to retry." });
  };

  // ---------------------------------------------------------------------------
  // Suggestion Cards
  // ---------------------------------------------------------------------------
  const SUGGESTIONS = [
    {
      icon: <FileSpreadsheet className="w-4 h-4" />,
      color: "bg-slate-100/80 text-slate-700",
      title: "Analyze a dataset",
      prompt: "I want to analyze a dataset",
    },
    {
      icon: <Database className="w-4 h-4" />,
      color: "bg-blue-50/80 text-blue-700",
      title: "Query a database",
      prompt: "I want to query a database",
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      color: "bg-slate-100/90 text-slate-700",
      title: "Forecast trends",
      prompt: "I want to forecast trends and predict future metrics",
    },
    {
      icon: <Search className="w-4 h-4" />,
      color: "bg-slate-100/80 text-slate-700",
      title: "Detect anomalies",
      prompt: "I want to detect anomalies in my data",
    },
  ];

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/70 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(115%_78%_at_50%_-8%,rgba(15,23,42,0.1),transparent_64%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-full max-w-[58rem] -translate-x-1/2 bg-gradient-to-b from-slate-50/80 via-white/60 to-slate-50/35" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      
      {/* ── Floating Command Strip ── */}
      <div className={`pointer-events-none sticky z-30 px-4 transition-all duration-300 sm:px-6 ${isCommandStripCompact ? "top-2" : "top-3"}`}>
        <div className={`pointer-events-auto mx-auto flex w-full items-center justify-between bg-white/82 shadow-[0_12px_44px_-30px_rgba(15,23,42,0.55),inset_0_0_0_1px_rgba(148,163,184,0.2)] backdrop-blur-xl transition-all duration-300 ${isCommandStripCompact ? "max-w-3xl rounded-xl px-3 py-1.5" : "max-w-4xl rounded-2xl px-3 py-2.5"}`}>
          <div className="min-w-0 flex items-center gap-2.5">
            <span className={`inline-flex shrink-0 items-center justify-center bg-slate-100/80 text-slate-600 transition-all duration-300 ${isCommandStripCompact ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-xl"}`}>
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <button className={`flex max-w-[200px] items-center gap-1 truncate font-semibold text-slate-700 transition-colors hover:text-slate-900 focus:outline-none sm:max-w-none ${isCommandStripCompact ? "text-[12px]" : "text-[13px]"}`}>
                <span className="truncate">{agentName}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {!isCommandStripCompact && (
                <p className="truncate text-[10px] font-medium tracking-[0.08em] text-slate-500/90">
                  {activeDatasetIds.length} dataset{activeDatasetIds.length === 1 ? "" : "s"} · {activeDocumentIds.length} document{activeDocumentIds.length === 1 ? "" : "s"} · {isHydratingDatasets ? "Refreshing sources" : "Type @ to route"}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isProcessing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={stopStreaming}
                className={`rounded-full bg-slate-100/85 text-xs text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.25)] hover:bg-slate-200/70 ${isCommandStripCompact ? "h-7 px-2" : "h-8 px-3"}`}
              >
                <CircleStop className="mr-1.5 h-3.5 w-3.5" />
                {!isCommandStripCompact && "Stop"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={resetConversation}
              className={`${isCommandStripCompact ? "h-7 w-7" : "h-8 w-8"} rounded-full text-slate-400 transition-colors hover:bg-slate-100/80 hover:text-slate-700`}
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void hydrateAvailableDatasets()}
              className={`${isCommandStripCompact ? "hidden sm:inline-flex h-7 w-7" : "h-8 w-8"} rounded-full text-slate-400 transition-colors hover:bg-slate-100/80 hover:text-slate-700`}
              title="Refresh datasets"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearDataContext}
              className={`${isCommandStripCompact ? "hidden sm:inline-flex h-7 w-7" : "h-8 w-8"} rounded-full text-slate-400 transition-colors hover:bg-slate-100/80 hover:text-slate-700`}
              title="Clear data context"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Chat Body ── */}
      <div ref={scrollContainerRef} className="relative -mt-12 min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-100/90 via-white/70 to-transparent" />
        <ScrollArea className="h-full">
          <div className="max-w-4xl mx-auto w-full">
            <div className="px-5 pb-56 pt-20 sm:px-8">
            {/* Empty / Welcome State */}
            {messages.length === 0 && (
              <div className="animate-in fade-in zoom-in-95 flex min-h-[62vh] flex-col items-center justify-center text-center duration-500">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Document Intelligence Workspace
                </p>
                <h1 className="mb-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.35rem]">
                  {getGreeting()}. What do you want to understand from your data?
                </h1>
                <p className="mb-10 max-w-2xl text-[15px] leading-[1.8] text-slate-500">
                  Ask in plain English. You can upload files, target datasets with @mentions, and get charts plus executive summaries in one response.
                </p>

                <div className="w-full max-w-2xl space-y-2.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => void handleSendMessage(s.prompt)}
                      className="group flex w-full items-center gap-4 rounded-2xl bg-white/82 px-4 py-3.5 text-left shadow-[0_14px_32px_-30px_rgba(15,23,42,0.5),inset_0_0_0_1px_rgba(148,163,184,0.2)] transition-all hover:bg-white hover:shadow-[0_18px_36px_-30px_rgba(15,23,42,0.5),inset_0_0_0_1px_rgba(100,116,139,0.26)]"
                    >
                      <div className={`rounded-xl p-2.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)] transition-transform group-hover:scale-105 ${s.color}`}>
                        {s.icon}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-semibold text-slate-700 transition-colors group-hover:text-slate-900">{s.title}</span>
                        <span className="truncate text-[12px] text-slate-500">{s.prompt}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <span>{availableDatasets.length} sources connected</span>
                  <span>•</span>
                  <span>Shift+Enter for newline</span>
                  <span>•</span>
                  <span>Drag and drop supported</span>
                </div>
              </div>
            )}

            {/* Message Thread */}
            <div className="flex flex-col gap-14">
              {hiddenMessageCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllMessages((prev) => !prev)}
                    className="rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.24)] hover:text-slate-700"
                  >
                    {showAllMessages ? "Collapse older messages" : `Show ${hiddenMessageCount} earlier messages`}
                  </button>
                </div>
              )}

              {groupedVisibleMessages.map((group, groupIndex) => (
                <section key={`${group.id}-${groupIndex}`} className="flex flex-col gap-3">
                  {group.role === "assistant" && groupIndex === firstAssistantGroupIndex && (
                    <div className="pl-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {agentName}
                    </div>
                  )}

                  {group.role === "user" && (
                    <div className="flex justify-end pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <span>You</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {group.items.map((msg) => {
                      const messageData = messageDataStoreRef.current[msg.id] || {};
                      const payload = messageData.payload;
                      const plan = messageData.plan;
                      const sql = messageData.sql;
                      const insights = messageData.insights;
                      const diagnostics = messageData.diagnostics;
                      const isLatestMessage = msg.id === messages[messages.length - 1]?.id;
                      const warningCount = msg.warnings?.length || 0;
                      const traceCount = msg.traces?.length || 0;
                      const hasReasoning = Boolean(msg.hasPlan || msg.hasSql || msg.hasInsights || msg.hasDiagnostics);
                      const footnoteSegments: string[] = [];
                      if (hasReasoning) footnoteSegments.push("analysis");
                      if (traceCount > 0) footnoteSegments.push(`${traceCount} trace${traceCount > 1 ? "s" : ""}`);
                      if (warningCount > 0) footnoteSegments.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);
                      if (msg.error) footnoteSegments.push("error flagged");
                      const footnoteLabel = footnoteSegments.length > 0 ? footnoteSegments.join(" · ") : "response tools";

                      if (msg.role === "system") {
                        return (
                          <div key={msg.id} className="mx-auto text-center text-[13px] font-medium text-slate-500">
                            {msg.content}
                          </div>
                        );
                      }

                      if (msg.role === "user") {
                        return (
                          <article key={msg.id} className="ml-auto w-full max-w-[46rem] pl-10 sm:pl-24">
                            {msg.files && msg.files.length > 0 && (
                              <div className="mb-2 flex flex-wrap justify-end gap-2">
                                {msg.files.map((f, i) => (
                                  <div key={`${msg.id}-file-${i}`} className="flex items-center gap-2 rounded-full bg-slate-100/75 px-3 py-1.5 text-[11px] text-slate-600">
                                    <FileText className="h-3.5 w-3.5" />
                                    <span className="max-w-[180px] truncate font-medium">{f.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {msg.content && (
                              <div className="rounded-3xl bg-slate-100/70 px-6 py-4 text-[15px] leading-[1.8] text-slate-800 transition-opacity duration-200">
                                {msg.content}
                              </div>
                            )}

                            <div className="mt-1 pr-1 text-right text-[11px] font-medium text-slate-400">
                              {formatTime(msg.timestamp)}
                            </div>
                          </article>
                        );
                      }

                      return (
                        <article
                          key={msg.id}
                          className="group/message w-full animate-in fade-in duration-200"
                        >
                          {isProcessing && isLatestMessage && (
                            <div className="mb-2 flex flex-wrap gap-2">
                              {completedSteps.map((step) => (
                                <ThinkingStep key={step} label={step} done />
                              ))}
                              {progressStatus && !completedSteps.includes(progressStatus) && (
                                <ThinkingStep label={progressStatus} done={false} />
                              )}
                            </div>
                          )}

                          {msg.content && (
                            <AssistantTextContent
                              content={msg.content}
                              showStreamingCaret={isProcessing && isLatestMessage}
                            />
                          )}

                          {msg.hasPayload && payload && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 overflow-hidden rounded-[24px] bg-white/70 p-2 ring-1 ring-slate-200/45 duration-200">
                              <div className="flex items-center justify-between px-2 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Table2 className="h-4 w-4 text-slate-400" />
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    Analysis result
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(JSON.stringify(payload))}
                                    className="rounded-full px-2 py-0.5 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    Copy data
                                  </button>
                                  <span className="text-slate-300">•</span>
                                  <button
                                    type="button"
                                    className="rounded-full px-2 py-0.5 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    Inspect
                                  </button>
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-2xl bg-white/85 p-3">
                                <DynamicChartFactory payload={payload} />
                              </div>
                            </div>
                          )}

                          <details className="group/footnote mt-4 overflow-hidden rounded-2xl bg-white/62 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)]">
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[11px] font-medium text-slate-500">
                              <span className="uppercase tracking-[0.12em]">Analysis footnote</span>
                              <span className="text-slate-300">•</span>
                              <span className="truncate">{footnoteLabel}</span>
                              <span className="ml-auto text-[11px]">{formatTime(msg.timestamp)}</span>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open/footnote:rotate-90" />
                            </summary>

                            <div className="space-y-3 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.22)]">
                              {warningCount > 0 && (
                                <div className="space-y-2">
                                  {msg.warnings?.map((warning, warningIdx) => (
                                    <div key={`${msg.id}-warning-${warningIdx}`} className="rounded-xl bg-amber-50/50 py-2 pl-3 pr-2 text-[13px] text-amber-900/80 shadow-[inset_3px_0_0_rgba(252,211,77,0.85)]">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600/80" />
                                        <span>{warning}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {msg.error && (
                                <div className="rounded-xl bg-rose-50/55 py-2 pl-3 pr-2 text-[13px] text-rose-900/80 shadow-[inset_3px_0_0_rgba(251,113,133,0.8)]">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600/80" />
                                    <span>{msg.error}</span>
                                  </div>
                                </div>
                              )}

                              {traceCount > 0 && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                  {msg.traces?.slice(-5).map((trace, traceIdx) => (
                                    <span key={`${msg.id}-trace-${traceIdx}`} className="inline-flex items-center gap-1.5">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                      {trace.stage || "Step"}
                                      {typeof trace.execution_time_ms === "number" ? ` | ${Math.round(trace.execution_time_ms)}ms` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {hasReasoning && (
                                <ReasoningPanel
                                  plan={plan}
                                  sql={sql}
                                  insights={insights}
                                  diagnostics={diagnostics}
                                />
                              )}

                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-medium text-slate-500">
                                <button
                                  type="button"
                                  onClick={() => void copyToClipboard(msg.content || JSON.stringify(payload))}
                                  className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                >
                                  Copy response
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  onClick={() => toast({ description: "Thanks. Feedback recorded." })}
                                >
                                  Helpful
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  onClick={() => toast({ description: "Thanks. We will use this to improve future answers." })}
                                >
                                  Needs work
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void retryFromAssistant(msg.id)}
                                  disabled={isProcessing}
                                  className="rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Retry
                                </button>
                              </div>
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div ref={scrollAnchorRef} className="h-4 w-full" />
            </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ── Input Area ── */}
      <div className="relative z-20 mt-auto px-4 pb-6 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-4xl">
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
            availableDatasets={availableDatasets}
          />
          <div className="mt-2 flex items-center justify-center gap-2 text-center text-[10px] font-medium tracking-[0.08em] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Arcli can make mistakes. Verify critical outputs.</span>
            <span className="text-slate-300">•</span>
            <a href="mailto:support@arcli.tech" className="transition-colors hover:text-blue-600">
              Get help
            </a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
