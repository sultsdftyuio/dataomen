// components/chat/ChatLayout.tsx
"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ExecutionPayload } from "@/lib/chart-engine";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings2, Sparkles, FileText,
  FileSpreadsheet, Database, LineChart, Activity,
  Copy, ThumbsUp, ThumbsDown, RotateCcw,
  Plus, ChevronDown, MoreHorizontal,
  Table2, TrendingUp, Search, Zap,
  ChevronRight, Code2, BrainCircuit, FlaskConical,
  ShieldCheck, CircleStop, AlertTriangle, CheckCircle2,
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
              className="rounded-md border border-slate-200/60 bg-slate-100 px-1.5 py-0.5 text-[13px] font-mono font-semibold text-slate-700"
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
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-slate-500 shadow-sm animate-in fade-in slide-in-from-bottom-2">
      {done ? (
        <div className="rounded-full bg-blue-100 p-0.5">
          <svg className="h-3 w-3 text-blue-600" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-50">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
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
  const [open, setOpen] = useState(false);
  const hasContent = plan || sql || insights || diagnostics;
  const planText = useMemo(() => (plan ? safePrettyJson(plan) : ""), [plan]);
  const insightsText = useMemo(() => (insights ? safePrettyJson(insights) : ""), [insights]);
  const diagnosticsText = useMemo(() => (diagnostics ? safePrettyJson(diagnostics) : ""), [diagnostics]);
  if (!hasContent) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-sm transition-all duration-300">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:bg-slate-100/70"
      >
        <div className="rounded-lg border border-slate-200/60 bg-white p-1.5 shadow-sm">
          <BrainCircuit className="w-4 h-4 text-blue-500" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Engine Execution Trace
        </span>
        <ChevronRight className={`w-4 h-4 text-slate-400 ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-5 border-t border-slate-200/60 bg-white p-5">
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
      )}
    </div>
  );
}

function ReasoningBlock({ icon, label, content, mono }: { icon: React.ReactNode; label: string; content: string; mono: boolean; }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon} {label}
      </div>
      <div className={`overflow-x-auto rounded-xl border border-slate-200/60 p-4 ${mono ? 'bg-slate-900' : 'bg-slate-50/70'}`}>
        <code className={`block whitespace-pre-wrap break-words ${mono ? "font-mono text-[12px] leading-relaxed text-slate-100" : "text-[13px] font-medium leading-relaxed text-slate-700"}`}>
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
    <div className="prose prose-slate dark:prose-invert max-w-none text-[15px] leading-7 text-slate-900 dark:text-slate-50 prose-p:my-2 prose-p:leading-7 prose-headings:text-slate-900 dark:prose-headings:text-slate-50">
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
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);

  const visibleMessages = useMemo(
    () => (showAllMessages ? messages : messages.slice(-MAX_RENDERED_MESSAGES)),
    [messages, showAllMessages],
  );
  const groupedVisibleMessages = useMemo(() => groupMessagesByRole(visibleMessages), [visibleMessages]);
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
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
      const res = await fetch("/api/datasets", { method: "GET" });
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
      color: "text-slate-600 bg-white border-slate-200/60",
      title: "Analyze a dataset",
      prompt: "I want to analyze a dataset",
    },
    {
      icon: <Database className="w-4 h-4" />,
      color: "text-blue-600 bg-blue-50/70 border-blue-100/80",
      title: "Query a database",
      prompt: "I want to query a database",
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      color: "text-slate-700 bg-slate-100 border-slate-200/60",
      title: "Forecast trends",
      prompt: "I want to forecast trends and predict future metrics",
    },
    {
      icon: <Search className="w-4 h-4" />,
      color: "text-slate-600 bg-white border-slate-200/60",
      title: "Detect anomalies",
      prompt: "I want to detect anomalies in my data",
    },
  ];

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_72%_at_50%_0%,rgba(15,23,42,0.06),transparent_64%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/85 to-transparent" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      
      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 sm:px-6 lg:px-8 backdrop-blur-xl">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 bg-white shadow-sm">
            <Zap className="h-4 w-4 text-slate-700" />
          </div>
          <button className="flex shrink-0 items-center gap-1.5 text-[15px] font-bold text-slate-900 transition-colors hover:text-blue-600 focus:outline-none">
            {agentName}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {/* Dataset & Doc Badges */}
          {activeDatasetIds.length > 0 && (
            <div className="ml-3 flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              {activeDatasetIds.length} <span className="hidden sm:inline">Dataset{activeDatasetIds.length > 1 ? "s" : ""}</span>
            </div>
          )}
          {activeDocumentIds.length > 0 && (
            <div className="ml-2 flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              {activeDocumentIds.length} <span className="hidden sm:inline">Doc{activeDocumentIds.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isProcessing && (
            <Button
              variant="outline"
              size="sm"
              onClick={stopStreaming}
              className="h-9 rounded-xl border-slate-200/60 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <CircleStop className="w-4 h-4 mr-1.5" />
              Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={resetConversation}
            className="h-9 w-9 rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void hydrateAvailableDatasets()}
            className="h-9 w-9 rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Refresh datasets"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearDataContext}
            className="h-9 w-9 rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Clear data context"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200/60 bg-white/70 px-4 py-2 text-[12px] text-slate-500 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-semibold text-slate-600">
            Context: {activeDatasetIds.length} dataset{activeDatasetIds.length === 1 ? "" : "s"} and {activeDocumentIds.length} document{activeDocumentIds.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {isHydratingDatasets ? "Refreshing sources..." : "Type @ to target a source"}
        </span>
      </div>

      {/* ── Chat Body ── */}
      <div ref={scrollContainerRef} className="relative flex-1 min-h-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-slate-50 via-slate-50/80 to-transparent" />
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-3xl px-4 pb-36 pt-8 sm:px-6 lg:px-8">
            {/* Empty / Welcome State */}
            {messages.length === 0 && (
              <div className="animate-in fade-in zoom-in-95 flex min-h-[60vh] flex-col items-center justify-center text-center duration-500">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm">
                  <Zap className="h-6 w-6 text-slate-700" />
                </div>
                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-900">
                  {getGreeting()}
                </h1>
                <p className="mb-10 max-w-md text-[15px] font-medium leading-relaxed text-slate-500">
                  Ask in plain English. You can upload files, target datasets with @mentions, and get charts plus executive summaries in one response.
                </p>

                <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                  <span className="rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-slate-600">{availableDatasets.length} sources ready</span>
                  <span className="rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-slate-600">Shift+Enter for newline</span>
                  <span className="rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-slate-600">Drag and drop supported</span>
                </div>

                <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => void handleSendMessage(s.prompt)}
                      className="group flex items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300/60 hover:bg-white"
                    >
                      <div className={`rounded-xl border border-slate-200/60 p-2.5 shadow-sm transition-transform group-hover:scale-105 ${s.color}`}>
                        {s.icon}
                      </div>
                      <span className="text-[14px] font-bold text-slate-700 transition-colors group-hover:text-blue-600">{s.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Thread */}
            <div className="flex flex-col gap-8">
              {hiddenMessageCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllMessages((prev) => !prev)}
                    className="rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {showAllMessages ? "Collapse older messages" : `Show ${hiddenMessageCount} earlier messages`}
                  </button>
                </div>
              )}

              {groupedVisibleMessages.map((group, groupIndex) => (
                <section key={`${group.id}-${groupIndex}`} className="flex flex-col gap-2">
                  {group.role === "assistant" && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/60 bg-white shadow-sm">
                        <Zap className="h-3.5 w-3.5 text-slate-700" />
                      </span>
                      <span>{agentName}</span>
                    </div>
                  )}

                  {group.role === "user" && (
                    <div className="flex justify-end text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

                      if (msg.role === "system") {
                        return (
                          <div key={msg.id} className="mx-auto text-center text-[13px] font-medium text-slate-500">
                            {msg.content}
                          </div>
                        );
                      }

                      if (msg.role === "user") {
                        return (
                          <article key={msg.id} className="ml-auto w-full max-w-[90%] sm:max-w-[82%]">
                            {msg.files && msg.files.length > 0 && (
                              <div className="mb-2 flex flex-wrap justify-end gap-2">
                                {msg.files.map((f, i) => (
                                  <div key={`${msg.id}-file-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-3 py-2 shadow-sm">
                                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="max-w-[160px] truncate text-[12px] font-semibold text-slate-700">{f.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {msg.content && (
                              <div className="rounded-xl bg-slate-50/50 px-4 py-3 text-[15px] leading-7 text-slate-900 transition-opacity duration-200 dark:bg-slate-800/30 dark:text-slate-50">
                                {msg.content}
                              </div>
                            )}

                            <div className="mt-1 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              {formatTime(msg.timestamp)}
                            </div>
                          </article>
                        );
                      }

                      return (
                        <article
                          key={msg.id}
                          className="group/message w-full animate-in fade-in duration-200"
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
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

                          {msg.warnings && msg.warnings.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {msg.warnings.map((warning, warningIdx) => (
                                <div key={`${msg.id}-warning-${warningIdx}`} className="flex items-start gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-3 py-2 text-[13px] text-slate-600">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                                  <span>{warning}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.error && (
                            <div className="mb-2 flex items-start gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-3 py-2 text-[13px] text-slate-700">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                              <span>{msg.error}</span>
                            </div>
                          )}

                          {msg.content && (
                            <AssistantTextContent
                              content={msg.content}
                              showStreamingCaret={isProcessing && isLatestMessage}
                            />
                          )}

                          {msg.traces && msg.traces.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.traces.slice(-3).map((trace, traceIdx) => (
                                <span key={`${msg.id}-trace-${traceIdx}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                                  <CheckCircle2 className="h-3 w-3 text-blue-500" />
                                  {trace.stage || "Step"}
                                  {typeof trace.execution_time_ms === "number" ? ` | ${Math.round(trace.execution_time_ms)}ms` : ""}
                                </span>
                              ))}
                            </div>
                          )}

                          {(msg.hasPlan || msg.hasSql || msg.hasInsights || msg.hasDiagnostics) && (
                            <ReasoningPanel
                              plan={plan}
                              sql={sql}
                              insights={insights}
                              diagnostics={diagnostics}
                            />
                          )}

                          {msg.hasPayload && payload && (
                            <div className="mt-5 overflow-hidden rounded-2xl bg-white/80 ring-1 ring-slate-200/50 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <div className="flex items-center justify-between border-b border-slate-200/50 px-5 py-3 bg-slate-50/40">
                                <div className="flex items-center gap-2">
                                  <Table2 className="h-4 w-4 text-slate-400" />
                                  <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                                    Analysis result
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => copyToClipboard(JSON.stringify(payload))}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="p-5">
                                <DynamicChartFactory payload={payload} />
                              </div>
                            </div>
                          )}

                          <div className={`mt-2 flex items-center justify-between transition-opacity duration-200 ${hoveredMsgId === msg.id || isLatestMessage ? "opacity-100" : "opacity-70 sm:opacity-0"}`}>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              {formatTime(msg.timestamp)}
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                onClick={() => void copyToClipboard(msg.content || JSON.stringify(payload))}
                                title="Copy"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Good response"
                                onClick={() => toast({ description: "Thanks. Feedback recorded." })}
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Bad response"
                                onClick={() => toast({ description: "Thanks. We will use this to improve future answers." })}
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Retry"
                                onClick={() => void retryFromAssistant(msg.id)}
                                disabled={isProcessing}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div ref={scrollAnchorRef} className="h-4 w-full" />
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ── Input Area ── */}
      <div className="sticky bottom-0 z-20 mt-auto border-t border-slate-200/60 bg-white/70 px-4 pb-5 pt-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
            availableDatasets={availableDatasets}
          />
          <div className="mt-3 flex items-center justify-center gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
