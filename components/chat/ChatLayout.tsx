// components/chat/ChatLayout.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
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
  // Chain-of-thought fields from the new AnalyticalOrchestrator
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
}

interface ChatLayoutProps {
  agentId?: string;
  agentName?: string;
}

// -----------------------------------------------------------------------------
// Markdown-lite renderer (bold/inline-code only, avoids heavy deps)
// -----------------------------------------------------------------------------
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[13px] font-mono text-rose-500 dark:text-rose-400"
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
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 shadow-sm animate-in fade-in slide-in-from-bottom-2">
      {done ? (
        <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" />
          <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="w-3 h-3 flex items-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        </span>
      )}
      {label}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chain-of-Thought Panel — collapsible reasoning drawer
// -----------------------------------------------------------------------------
function ReasoningPanel({ plan, sql, insights, diagnostics }: {
  plan?: any;
  sql?: string;
  insights?: any;
  diagnostics?: any;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = plan || sql || insights || diagnostics;
  if (!hasContent) return null;

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--chat-border)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--chat-surface)",
      }}
    >
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--chat-muted)",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        <BrainCircuit style={{ width: 13, height: 13 }} />
        Reasoning
        <ChevronRight
          style={{
            width: 13,
            height: 13,
            marginLeft: "auto",
            transition: "transform 0.2s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Expandable body */}
      {open && (
        <div
          style={{
            padding: "0 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderTop: "1px solid var(--chat-border)",
          }}
          className="animate-in fade-in slide-in-from-top-1"
        >
          {/* Plan */}
          {plan && (
            <ReasoningBlock
              icon={<FlaskConical style={{ width: 12, height: 12 }} />}
              label="Plan"
              content={typeof plan === "string" ? plan : JSON.stringify(plan, null, 2)}
              mono={false}
            />
          )}

          {/* SQL */}
          {sql && (
            <ReasoningBlock
              icon={<Code2 style={{ width: 12, height: 12 }} />}
              label="SQL"
              content={sql}
              mono
            />
          )}

          {/* Insights */}
          {insights && (
            <ReasoningBlock
              icon={<Sparkles style={{ width: 12, height: 12 }} />}
              label="Insights"
              content={typeof insights === "string" ? insights : JSON.stringify(insights, null, 2)}
              mono={false}
            />
          )}

          {/* Diagnostics */}
          {diagnostics && (
            <ReasoningBlock
              icon={<Activity style={{ width: 12, height: 12 }} />}
              label="Diagnostics"
              content={typeof diagnostics === "string" ? diagnostics : JSON.stringify(diagnostics, null, 2)}
              mono
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReasoningBlock({
  icon, label, content, mono,
}: {
  icon: React.ReactNode;
  label: string;
  content: string;
  mono: boolean;
}) {
  return (
    <div style={{ paddingTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--chat-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        {icon}
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--chat-surface-2)",
          fontSize: mono ? 12 : 13,
          fontFamily: mono ? "'DM Mono', monospace" : "inherit",
          lineHeight: 1.65,
          color: "var(--chat-fg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowX: "auto",
        }}
      >
        {content}
      </pre>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Timestamp formatter
// -----------------------------------------------------------------------------
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const ChatLayout: React.FC<ChatLayoutProps> = ({
  agentId = "default-router",
  agentName = "Arcli",
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  const [activeDocumentIds, setActiveDocumentIds] = useState<string[]>([]); // NEW: for Qdrant RAG
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, progressStatus, isProcessing]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard", duration: 2000 });
  };

  // ---------------------------------------------------------------------------
  // Upgraded Hybrid Upload Pipeline
  // ---------------------------------------------------------------------------
  const handleHybridUpload = async (file: File): Promise<{ id: string; isDoc: boolean }> => {
    setProgressStatus(`Ingesting ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dataset_name", file.name);

    const uploadRes = await fetch("/api/datasets/upload", {
      method: "POST",
      body: formData,
    });

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
    const userMsg: RichMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      files,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    setCompletedSteps([]);
    setProgressStatus("");

    try {
      // 1. Process uploads and route to correct state arrays
      let currentDatasetIds = [...activeDatasetIds];
      let currentDocumentIds = [...activeDocumentIds];

      if (files.length > 0) {
        setCompletedSteps((prev) => [...prev, "Uploading files…"]);
        const results = await Promise.all(files.map(handleHybridUpload));

        const newDatasets = results.filter((r) => !r.isDoc).map((r) => r.id);
        const newDocs = results.filter((r) => r.isDoc).map((r) => r.id);

        currentDatasetIds = [...new Set([...currentDatasetIds, ...newDatasets])];
        currentDocumentIds = [...new Set([...currentDocumentIds, ...newDocs])];

        setActiveDatasetIds(currentDatasetIds);
        setActiveDocumentIds(currentDocumentIds);
      }

      const history = messages
        .slice(-5)
        .map((m) => ({ role: m.role, content: m.content || "" }));

      // Initialize empty assistant message to stream into
      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      // 2. Pass BOTH id arrays to the orchestrator
      const res = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: text,
          active_dataset_ids: currentDatasetIds,
          active_document_ids: currentDocumentIds, // NEW: required for Qdrant RAG
          history,
        }),
      });

      if (!res.ok || !res.body) throw new Error("The analytical engine encountered an error.");

      // Stream Reader
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let doneReading = false;
      let streamedContent = "";

      while (!doneReading) {
        const { value, done } = await reader.read();
        if (done) {
          doneReading = true;
          break;
        }

        const chunkString = decoder.decode(value, { stream: true });
        const lines = chunkString.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              const { type, content, message } = parsed;

              // 3. Handle the new richer SSE packet types
              switch (type) {
                case "status":
                  setProgressStatus((currentStatus) => {
                    if (currentStatus && !completedSteps.includes(currentStatus)) {
                      setCompletedSteps((prev) => [...prev, currentStatus]);
                    }
                    return content || message;
                  });
                  break;

                // NEW: chain-of-thought packets from the AnalyticalOrchestrator
                case "plan":
                case "sql":
                case "insights":
                case "diagnostics":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, [type]: content } : m
                    )
                  );
                  break;

                case "narrative":
                case "narrative_chunk":
                  // "narrative" from the new backend; "narrative_chunk" from old — handle both
                  streamedContent += content?.executive_summary || content || message || "";
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: streamedContent } : m
                    )
                  );
                  break;

                case "data":
                case "cache_hit":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, payload: content } : m
                    )
                  );
                  doneReading = true; // data packet signals end of stream
                  break;

                case "error":
                  toast({ title: "Error", description: content || message, variant: "destructive" });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: streamedContent + `\n\n**Error:** ${content || message}` }
                        : m
                    )
                  );
                  break;

                case "done":
                  doneReading = true;
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk:", dataStr);
            }
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages((prev) => {
        const hasAssistant = prev[prev.length - 1]?.role === "assistant";
        if (hasAssistant) {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: `**Error:** ${err.message}` } : m
          );
        }
        return [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `**Error:** ${err.message || "An unexpected error occurred."}`,
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  // ---------------------------------------------------------------------------
  // Suggestion Cards
  // ---------------------------------------------------------------------------
  const SUGGESTIONS = [
    {
      icon: <FileSpreadsheet className="w-4 h-4" />,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400",
      title: "Analyze a dataset",
      prompt: "I want to analyze a dataset",
    },
    {
      icon: <Database className="w-4 h-4" />,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400",
      title: "Query a database",
      prompt: "I want to query a database",
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400",
      title: "Forecast trends",
      prompt: "I want to forecast trends and predict future metrics",
    },
    {
      icon: <Search className="w-4 h-4" />,
      color: "text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400",
      title: "Detect anomalies",
      prompt: "I want to detect anomalies in my data",
    },
  ];

  const totalSources = activeDatasetIds.length + activeDocumentIds.length;

  return (
    <div
      className="flex flex-col h-full w-full relative overflow-hidden"
      style={{
        fontFamily: "'DM Sans', 'Geist', system-ui, sans-serif",
        backgroundColor: "var(--chat-bg, #ffffff)",
        color: "var(--chat-fg, #111111)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        :root {
          --chat-bg: #ffffff;
          --chat-fg: #111111;
          --chat-muted: #6b7280;
          --chat-border: #e5e7eb;
          --chat-surface: #f9fafb;
          --chat-surface-2: #f3f4f6;
          --chat-user-bubble: #f3f4f6;
          --chat-accent: #2563eb;
          --chat-accent-light: #eff6ff;
          --chat-radius: 16px;
          --chat-radius-sm: 8px;
          --chat-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
          --chat-shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.05);
        }

        .dark {
          :root {
            --chat-bg: #0f0f0f;
            --chat-fg: #f0f0f0;
            --chat-muted: #9ca3af;
            --chat-border: #1f1f1f;
            --chat-surface: #161616;
            --chat-surface-2: #1c1c1c;
            --chat-user-bubble: #1c1c1c;
            --chat-accent: #3b82f6;
            --chat-accent-light: rgba(59,130,246,0.08);
            --chat-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
            --chat-shadow-md: 0 4px 12px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4);
          }
        }

        .chat-scroll-area { overflow-y: auto; scroll-behavior: smooth; }
        .chat-scroll-area::-webkit-scrollbar { width: 4px; }
        .chat-scroll-area::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll-area::-webkit-scrollbar-thumb { background: var(--chat-border); border-radius: 99px; }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-enter { animation: fadeSlideUp 0.22s ease both; }

        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, var(--chat-surface) 25%, var(--chat-surface-2) 50%, var(--chat-surface) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s infinite;
          border-radius: 6px;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .cursor-blink {
          display: inline-block;
          width: 2px; height: 1em;
          background: var(--chat-fg);
          vertical-align: text-bottom;
          margin-left: 1px;
          animation: blink 1s step-end infinite;
        }

        .suggestion-card {
          background: var(--chat-bg);
          border: 1px solid var(--chat-border);
          border-radius: 12px;
          padding: 14px 16px;
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          width: 100%;
          font-family: inherit;
        }
        .suggestion-card:hover {
          border-color: var(--chat-accent);
          box-shadow: 0 0 0 3px var(--chat-accent-light);
          transform: translateY(-1px);
        }

        .action-btn {
          width: 28px; height: 28px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          background: transparent;
          border: none; cursor: pointer;
          color: var(--chat-muted);
          transition: background 0.12s, color 0.12s;
        }
        .action-btn:hover { background: var(--chat-surface-2); color: var(--chat-fg); }

        .chart-card {
          border: 1px solid var(--chat-border);
          border-radius: 14px;
          overflow: hidden;
          background: var(--chat-bg);
          box-shadow: var(--chat-shadow);
          transition: box-shadow 0.2s;
        }
        .chart-card:hover { box-shadow: var(--chat-shadow-md); }

        .chart-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--chat-border);
          background: var(--chat-surface);
        }

        .dataset-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 99px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          font-size: 11px; font-weight: 600;
          color: #059669; letter-spacing: 0.03em; text-transform: uppercase;
        }

        .doc-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 99px;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.2);
          font-size: 11px; font-weight: 600;
          color: #6366f1; letter-spacing: 0.03em; text-transform: uppercase;
        }

        .top-bar {
          height: 52px;
          border-bottom: 1px solid var(--chat-border);
          background: var(--chat-bg);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px;
          position: sticky; top: 0; z-index: 20;
          flex-shrink: 0;
        }

        .input-footer {
          border-top: 1px solid var(--chat-border);
          background: var(--chat-bg);
          padding: 16px 20px 20px;
          flex-shrink: 0;
        }

        .user-bubble {
          background: var(--chat-user-bubble);
          border-radius: 18px 18px 4px 18px;
          padding: 10px 16px;
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--chat-fg);
          max-width: 100%;
          word-break: break-word;
        }

        .file-chip {
          display: flex; align-items: center; gap: 10px;
          background: var(--chat-bg);
          border: 1px solid var(--chat-border);
          border-radius: 10px;
          padding: 8px 12px;
          box-shadow: var(--chat-shadow);
        }
        .file-chip-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: rgba(16, 185, 129, 0.08);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .file-chip-icon.doc {
          background: rgba(99, 102, 241, 0.08);
        }

        .assistant-text {
          font-size: 14.5px;
          line-height: 1.75;
          color: var(--chat-fg);
        }
        .assistant-text p { margin: 0 0 10px; }
        .assistant-text p:last-child { margin-bottom: 0; }

        .agent-avatar {
          width: 28px; height: 28px;
          border-radius: 8px;
          background: #111;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: var(--chat-shadow);
        }
      `}</style>

      {/* ── Top Bar ── */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="agent-avatar">
            <Zap style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <button
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, fontWeight: 600,
              color: "var(--chat-fg)", padding: "4px 6px", borderRadius: 6,
            }}
          >
            {agentName}
            <ChevronDown style={{ width: 14, height: 14, color: "var(--chat-muted)" }} />
          </button>

          {/* Dataset badge */}
          {activeDatasetIds.length > 0 && (
            <div className="dataset-badge">
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#10b981", display: "inline-block",
                boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
                animation: "blink 2s step-end infinite",
              }} />
              {activeDatasetIds.length} dataset{activeDatasetIds.length > 1 ? "s" : ""}
            </div>
          )}

          {/* Document badge — NEW */}
          {activeDocumentIds.length > 0 && (
            <div className="doc-badge">
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#6366f1", display: "inline-block",
                boxShadow: "0 0 0 2px rgba(99,102,241,0.3)",
              }} />
              {activeDocumentIds.length} doc{activeDocumentIds.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="action-btn" title="New chat">
            <Plus style={{ width: 15, height: 15 }} />
          </button>
          <button className="action-btn" title="Settings">
            <Settings2 style={{ width: 15, height: 15 }} />
          </button>
          <button className="action-btn" title="More options">
            <MoreHorizontal style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {/* ── Chat Body ── */}
      <div className="chat-scroll-area" style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: "100%",
            margin: "0 auto",
            padding: messages.length === 0 ? "0 20px" : "28px 20px 0",
            paddingBottom: 24,
          }}
        >
          {/* ── Empty / Welcome State ── */}
          {messages.length === 0 && (
            <div
              className="msg-enter"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: "calc(100vh - 220px)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "#111", display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 20,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                }}
              >
                <Zap style={{ width: 24, height: 24, color: "#fff" }} />
              </div>

              <h1
                style={{
                  fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em",
                  margin: "0 0 8px", color: "var(--chat-fg)",
                }}
              >
                {getGreeting()}
              </h1>
              <p
                style={{
                  fontSize: 15, color: "var(--chat-muted)", maxWidth: 400,
                  lineHeight: 1.65, margin: "0 0 36px",
                }}
              >
                Ask a question, upload a file, or pick a task below to get started.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10, width: "100%", maxWidth: 520,
                }}
              >
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="suggestion-card"
                    onClick={() => handleSendMessage(s.prompt)}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                      className={s.color.split(" ").slice(1).join(" ")}
                    >
                      <span className={s.color.split(" ")[0]}>{s.icon}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 13.5, fontWeight: 500, color: "var(--chat-fg)",
                        lineHeight: 1.3,
                      }}
                    >
                      {s.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Message Thread ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className="msg-enter"
                style={{ animationDelay: `${Math.min(idx * 20, 80)}ms` }}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                {/* ── USER MESSAGE ── */}
                {msg.role === "user" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    {msg.files && msg.files.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                        {msg.files.map((f, i) => {
                          const isDoc = f.name.match(/\.(pdf|txt|md|docx)$/i) !== null;
                          return (
                            <div key={i} className="file-chip">
                              <div className={`file-chip-icon${isDoc ? " doc" : ""}`}>
                                <FileText
                                  style={{
                                    width: 16, height: 16,
                                    color: isDoc ? "#6366f1" : "#10b981",
                                  }}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--chat-fg)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {f.name}
                                </div>
                                <div style={{ fontSize: 11.5, color: "var(--chat-muted)" }}>
                                  {(f.size / 1024 / 1024).toFixed(2)} MB · {isDoc ? "Document" : "Dataset"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {msg.content && (
                      <div style={{ maxWidth: "72%" }}>
                        <div className="user-bubble">{msg.content}</div>
                        <div style={{ fontSize: 11, color: "var(--chat-muted)", marginTop: 4, textAlign: "right" }}>
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ASSISTANT MESSAGE ── */}
                {msg.role === "assistant" && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div className="agent-avatar" style={{ marginTop: 2 }}>
                      <Zap style={{ width: 13, height: 13, color: "#fff" }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Streaming Status Pills */}
                      {isProcessing && idx === messages.length - 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, paddingTop: 4 }}>
                          {completedSteps.map((step) => (
                            <ThinkingStep key={step} label={step} done />
                          ))}
                          {progressStatus && !completedSteps.includes(progressStatus) && (
                            <ThinkingStep label={progressStatus} done={false} />
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      {msg.content && (
                        <div className="assistant-text">
                          {msg.content.split("\n").map((line, i) => (
                            <p key={i} style={{ margin: 0, marginBottom: i < msg.content!.split("\n").length - 1 ? 8 : 0 }}>
                              <SimpleMarkdown text={line} />
                              {isProcessing && idx === messages.length - 1 && i === msg.content!.split("\n").length - 1 && (
                                <span className="cursor-blink" />
                              )}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Chain-of-thought Reasoning Panel — NEW */}
                      {(msg.plan || msg.sql || msg.insights || msg.diagnostics) && (
                        <ReasoningPanel
                          plan={msg.plan}
                          sql={msg.sql}
                          insights={msg.insights}
                          diagnostics={msg.diagnostics}
                        />
                      )}

                      {/* Chart / Data Payload */}
                      {msg.payload && (
                        <div
                          className="chart-card animate-in fade-in slide-in-from-bottom-4"
                          style={{ marginTop: msg.content ? 16 : 0, width: "100%" }}
                        >
                          <div className="chart-header">
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Table2 style={{ width: 14, height: 14, color: "var(--chat-muted)" }} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--chat-fg)" }}>
                                Analysis Result
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="action-btn" onClick={() => copyToClipboard(JSON.stringify(msg.payload))}>
                                <Copy style={{ width: 13, height: 13 }} />
                              </button>
                              <button className="action-btn">
                                <MoreHorizontal style={{ width: 13, height: 13 }} />
                              </button>
                            </div>
                          </div>
                          <div style={{ padding: 16 }}>
                            <DynamicChartFactory payload={msg.payload} />
                          </div>
                        </div>
                      )}

                      {/* Timestamp + Action bar */}
                      <div
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          marginTop: 10,
                          opacity: hoveredMsgId === msg.id && !isProcessing ? 1 : 0,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "var(--chat-muted)" }}>
                          {formatTime(msg.timestamp)}
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="action-btn"
                            onClick={() => copyToClipboard(msg.content || JSON.stringify(msg.payload))}
                            title="Copy"
                          >
                            <Copy style={{ width: 13, height: 13 }} />
                          </button>
                          <button className="action-btn" title="Good response">
                            <ThumbsUp style={{ width: 13, height: 13 }} />
                          </button>
                          <button className="action-btn" title="Bad response">
                            <ThumbsDown style={{ width: 13, height: 13 }} />
                          </button>
                          <button className="action-btn" title="Retry">
                            <RotateCcw style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div ref={scrollRef} />
          </div>
        </div>
      </div>

      {/* ── Input Area ── */}
      <div className="input-footer">
        <div style={{ maxWidth: "100%", margin: "0 auto" }}>
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
          />
          <div
            style={{
              textAlign: "center", marginTop: 10,
              fontSize: 11.5, color: "var(--chat-muted)",
              letterSpacing: "0.01em",
            }}
          >
            Arcli can make mistakes — verify critical outputs.{" "}
            <a
              href="mailto:support@arcli.tech"
              style={{ color: "inherit", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}
            >
              Get help
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};