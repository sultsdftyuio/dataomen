"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, FileText, Loader2, Sparkles,
  Zap, TrendingUp, TrendingDown, AlertCircle, Activity,
  Table2, BarChart3, ChevronDown, ChevronRight, CheckCircle2,
  TerminalSquare, ListTree, ThumbsUp, ThumbsDown,
  Database, Upload, ArrowRight, Users, DollarSign,
  BarChart2, RefreshCw, Search, Hash, Package,
  Layers, Globe, Cpu, ChevronUp, Star, Clock,
} from "lucide-react";

import { OmniMessageInput } from "@/components/chat/OmniMessageInput";
import { DynamicChartFactory } from "@/components/dashboard/DynamicChartFactory";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ============================================================================
// 1. STRICT TYPE DEFINITIONS (Mapped to Python Backend Models)
// ============================================================================

interface DashboardOrchestratorProps {
  token: string;
  tenantId: string;
  initialDatasetIds?: string[];
  onConnectIntegration?: (id: string) => Promise<string>;
}

interface QueryStep {
  step_number: number;
  operation: string;
  description: string;
  columns_involved: string[];
}

interface QueryPlan {
  intent: string;
  is_achievable: boolean;
  missing_data_reason?: string;
  steps: QueryStep[];
}

export interface AnomalyInsight {
  column: string;
  row_identifier: string;
  value: number;
  z_score: number;
  is_positive: boolean;
}

interface TrendInsight {
  column: string;
  direction: "increasing" | "decreasing" | "flat";
  slope: number;
  percentage_change: number;
}

interface CorrelationInsight {
  metric_a: string;
  metric_b: string;
  pearson_coefficient: number;
}

interface InsightPayload {
  row_count: number;
  intent_analyzed: string;
  trends: TrendInsight[];
  anomalies: AnomalyInsight[];
  correlations: CorrelationInsight[];
}

interface StructuredNarrative {
  executive_summary: string;
  key_insights: string[];
  recommended_action?: string;
}

type PayloadType = "table" | "chart" | "text" | "error" | "ml_result";

interface ExecutionPayload {
  type: PayloadType;
  data: any[];
  sql_used?: string;
  chart_spec?: any;
  row_count: number;
  execution_time_ms: number;
}

interface RichMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  reasoning?: string;
  files?: File[];
  statusSteps: string[];
  isComplete: boolean;
  isError: boolean;
  plan?: QueryPlan;
  payload?: ExecutionPayload;
  insights?: InsightPayload;
  narrative?: StructuredNarrative;
  sqlUsed?: string;
  jobId?: string;
  isCached?: boolean;
  executionTimeMs?: number;
  timestamp: Date;
}

// ============================================================================
// 2. EMPTY STATE DATA & TYPES
// ============================================================================

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  borderColor: string;
  category: "payments" | "database" | "infra" | "analytics";
  popular?: boolean;
}

interface MetricCard {
  id: string;
  label: string;
  metric: string;
  prompt: string;
  icon: React.ReactNode;
  accentColor: string;
  bgGradient: string;
  trend?: string;
}

interface PromptCategory {
  label: string;
  icon: React.ReactNode;
  prompts: { text: string; tag?: string }[];
}

const INTEGRATIONS: Integration[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Revenue, MRR, churn & payment analytics",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
      </svg>
    ),
    accentColor: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    category: "payments",
    popular: true,
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "User tables, events & growth metrics",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.111 12.876.706 14.087 1.774 14.087h9.18l.004 8.878c.015.986 1.26 1.41 1.874.637l9.262-11.051c.653-.826.058-2.037-1.01-2.037h-9.18L11.9 1.036z" />
      </svg>
    ),
    accentColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    category: "database",
    popular: true,
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deployment stats, web vitals & traffic",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M24 22.525H0l12-21.05 12 21.05z" />
      </svg>
    ),
    accentColor: "text-slate-800",
    bgColor: "bg-slate-100",
    borderColor: "border-slate-300",
    category: "infra",
    popular: true,
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics, funnels & retention",
    icon: <BarChart2 className="w-5 h-5" />,
    accentColor: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    category: "analytics",
  },
  {
    id: "planetscale",
    name: "PlanetScale",
    description: "MySQL-compatible serverless DB queries",
    icon: <Database className="w-5 h-5" />,
    accentColor: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    category: "database",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Edge analytics, Workers & R2 usage",
    icon: <Globe className="w-5 h-5" />,
    accentColor: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    category: "infra",
  },
];

const METRIC_CARDS: MetricCard[] = [
  {
    id: "mrr",
    label: "MRR Growth",
    metric: "Monthly Recurring Revenue",
    prompt: "Show me my MRR growth broken down by month for the last 12 months, and highlight the month-over-month percentage change",
    icon: <DollarSign className="w-5 h-5" />,
    accentColor: "text-emerald-700",
    bgGradient: "from-emerald-50 to-teal-50",
    trend: "+12% avg",
  },
  {
    id: "churn",
    label: "Churn Analysis",
    metric: "Customer Churn Rate",
    prompt: "Calculate my monthly churn rate, identify which customer segments churn the most, and show the revenue impact",
    icon: <TrendingDown className="w-5 h-5" />,
    accentColor: "text-rose-700",
    bgGradient: "from-rose-50 to-pink-50",
    trend: "Segment risk",
  },
  {
    id: "dau",
    label: "DAU / WAU / MAU",
    metric: "Active Users",
    prompt: "Show me Daily, Weekly, and Monthly Active Users for the last 90 days with the DAU/MAU stickiness ratio",
    icon: <Users className="w-5 h-5" />,
    accentColor: "text-blue-700",
    bgGradient: "from-blue-50 to-indigo-50",
    trend: "Stickiness",
  },
  {
    id: "arpu",
    label: "ARPU Breakdown",
    metric: "Revenue Per User",
    prompt: "Calculate Average Revenue Per User by plan tier, identify the highest-value cohorts, and show expansion revenue",
    icon: <BarChart3 className="w-5 h-5" />,
    accentColor: "text-violet-700",
    bgGradient: "from-violet-50 to-purple-50",
    trend: "By cohort",
  },
  {
    id: "ltv",
    label: "LTV : CAC Ratio",
    metric: "Unit Economics",
    prompt: "Calculate LTV:CAC ratio by acquisition channel, show payback period, and flag any channels with ratio below 3:1",
    icon: <TrendingUp className="w-5 h-5" />,
    accentColor: "text-amber-700",
    bgGradient: "from-amber-50 to-yellow-50",
    trend: "By channel",
  },
  {
    id: "nrr",
    label: "Net Revenue Retention",
    metric: "Expansion & Contraction",
    prompt: "Show Net Revenue Retention rate, break down expansion vs contraction vs churn revenue, and compare to prior quarters",
    icon: <RefreshCw className="w-5 h-5" />,
    accentColor: "text-teal-700",
    bgGradient: "from-teal-50 to-cyan-50",
    trend: "Cohort view",
  },
];

const PROMPT_LIBRARY: PromptCategory[] = [
  {
    label: "Growth",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    prompts: [
      { text: "Which acquisition channel has the best 90-day retention?", tag: "Retention" },
      { text: "Show me my top 10 customers by LTV and their plan history", tag: "VIP" },
      { text: "What's my revenue concentration risk — top 10 customers as % of ARR?", tag: "Risk" },
    ],
  },
  {
    label: "Product",
    icon: <Cpu className="w-3.5 h-3.5" />,
    prompts: [
      { text: "Which features are most correlated with long-term retention?", tag: "Insights" },
      { text: "Show funnel conversion from signup → paid, broken down by week", tag: "Funnel" },
      { text: "Identify users who are power users but still on free tier", tag: "Upgrade" },
    ],
  },
  {
    label: "Finance",
    icon: <DollarSign className="w-3.5 h-3.5" />,
    prompts: [
      { text: "Project my ARR for next quarter based on current growth rate", tag: "Forecast" },
      { text: "What is my burn multiple and how has it trended?", tag: "Efficiency" },
      { text: "Break down MRR movements: new, expansion, contraction, churn", tag: "Waterfall" },
    ],
  },
  {
    label: "Operations",
    icon: <Package className="w-3.5 h-3.5" />,
    prompts: [
      { text: "Which support issues are most common among churned customers?", tag: "Churn" },
      { text: "Show me p50, p95, p99 API latency by endpoint this week", tag: "Perf" },
      { text: "Identify any anomalies in my billing data from last 30 days", tag: "Anomaly" },
    ],
  },
];

// ============================================================================
// 3. EMPTY STATE COMPONENTS
// ============================================================================

interface FrictionlessIngestionStateProps {
  onConnectIntegration: (id: string) => void;
  onFileUpload: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const FrictionlessIngestionState: React.FC<FrictionlessIngestionStateProps> = ({
  onConnectIntegration,
  onFileUpload,
  fileInputRef,
}) => {
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleConnect = async (id: string) => {
    setConnectingId(id);
    await new Promise((r) => setTimeout(r, 1200)); // Simulate OAuth
    setConnectedIds((prev) => [...prev, id]);
    setConnectingId(null);
    onConnectIntegration(id);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFileUpload(files);
  };

  return (
    <div className="flex flex-col items-center w-full animate-in fade-in zoom-in-95 duration-700">
      {/* Hero */}
      <div className="text-center mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-bold tracking-widest uppercase mb-4">
          <Sparkles className="w-3 h-3" />
          Analytics Copilot — Ready
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Connect your stack.
          <br />
          <span className="text-blue-600">Get answers in seconds.</span>
        </h2>
        <p className="text-[15px] text-slate-500 max-w-sm leading-relaxed">
          No SQL, no dashboards to build. Connect a source below and ask anything in plain English.
        </p>
      </div>

      {/* Integration Grid */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            One-Click Connections
          </span>
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">
            Popular
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INTEGRATIONS.map((integration, i) => {
            const isConnected = connectedIds.includes(integration.id);
            const isConnecting = connectingId === integration.id;

            return (
              <button
                key={integration.id}
                onClick={() => !isConnected && handleConnect(integration.id)}
                disabled={isConnecting}
                style={{ animationDelay: `${i * 60}ms` }}
                className={cn(
                  "group relative flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-200 animate-in fade-in slide-in-from-bottom-3",
                  isConnected
                    ? "bg-emerald-50 border-emerald-200 cursor-default"
                    : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50 hover:-translate-y-0.5 cursor-pointer"
                )}
              >
                {integration.popular && !isConnected && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full tracking-wider uppercase">
                    Popular
                  </div>
                )}

                {/* Icon */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                    isConnected
                      ? "bg-emerald-100 border-emerald-200 text-emerald-600"
                      : `${integration.bgColor} ${integration.borderColor} ${integration.accentColor}`
                  )}
                >
                  {isConnected ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isConnecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    integration.icon
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {integration.name}
                    </span>
                    {isConnected && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5 leading-tight">
                    {integration.description}
                  </p>
                </div>

                {/* CTA */}
                {!isConnected && !isConnecting && (
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4 text-blue-500" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full max-w-2xl flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          or upload files
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>

      {/* File Drop Zone */}
      <div
        className={cn(
          "w-full max-w-2xl border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200",
          isDragging
            ? "border-blue-400 bg-blue-50/80 scale-[1.01]"
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors",
          isDragging ? "bg-blue-100 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-400"
        )}>
          <Upload className="w-5 h-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">
            {isDragging ? "Drop to analyze" : "Drop CSV, Parquet, or Excel"}
          </p>
          <p className="text-[12px] text-slate-400 mt-1">
            Up to 500MB · Zero-ETL · Instant DuckDB processing
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.parquet,.xlsx,.xls,.json"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) onFileUpload(files);
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// 4. SAAS STARTER PACK DASHBOARD (Post-connection empty state)
// ============================================================================

interface SaaSStarterPackProps {
  activeDatasetIds: string[];
  onSendPrompt: (prompt: string) => void;
}

const SaaSStarterPack: React.FC<SaaSStarterPackProps> = ({
  activeDatasetIds,
  onSendPrompt,
}) => {
  const [activeCategory, setActiveCategory] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-700">
      {/* Context Bar */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Your SaaS Command Center
          </h2>
          <p className="text-[13px] text-slate-500 mt-1">
            {activeDatasetIds.length} source{activeDatasetIds.length !== 1 ? "s" : ""} active — click any card to run instantly
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Engine Ready
          </span>
        </div>
      </div>

      {/* Metric Quick-Action Cards */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            SaaS Metrics — One Click to Analyze
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {METRIC_CARDS.map((card, i) => (
            <button
              key={card.id}
              onClick={() => onSendPrompt(card.prompt)}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{ animationDelay: `${i * 60}ms` }}
              className={cn(
                "group relative flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all duration-200 animate-in fade-in slide-in-from-bottom-3",
                `bg-gradient-to-br ${card.bgGradient}`,
                hoveredCard === card.id
                  ? "border-blue-300 shadow-lg shadow-blue-100/60 -translate-y-1 scale-[1.02]"
                  : "border-slate-200 hover:border-blue-200"
              )}
            >
              {/* Icon + trend */}
              <div className="flex items-start justify-between">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center bg-white/80 border border-white shadow-sm",
                  card.accentColor
                )}>
                  {card.icon}
                </div>
                {card.trend && (
                  <span className="text-[10px] font-bold text-slate-500 bg-white/70 border border-white px-2 py-0.5 rounded-full">
                    {card.trend}
                  </span>
                )}
              </div>

              {/* Labels */}
              <div>
                <p className="text-[13px] font-bold text-slate-900 leading-tight">
                  {card.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {card.metric}
                </p>
              </div>

              {/* Run indicator */}
              <div className={cn(
                "flex items-center gap-1.5 text-[11px] font-bold transition-colors",
                hoveredCard === card.id ? "text-blue-600" : "text-slate-400"
              )}>
                <ArrowRight className="w-3 h-3" />
                Run analysis
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Library */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            Prompt Library
          </span>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {PROMPT_LIBRARY.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all",
                activeCategory === i
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
              )}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Prompt List */}
        <div className="space-y-2">
          {PROMPT_LIBRARY[activeCategory].prompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onSendPrompt(prompt.text)}
              style={{ animationDelay: `${i * 50}ms` }}
              className="group w-full flex items-center justify-between gap-4 px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-sm hover:shadow-blue-50 transition-all animate-in fade-in slide-in-from-left-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Hash className="w-3.5 h-3.5 text-slate-300 shrink-0 group-hover:text-blue-400 transition-colors" />
                <span className="text-[13px] text-slate-700 font-medium truncate group-hover:text-slate-900 transition-colors">
                  {prompt.text}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {prompt.tag && (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    {prompt.tag}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. EXISTING UX SUB-COMPONENTS (Preserved from original)
// ============================================================================

const StatusStepper = ({
  steps,
  isComplete,
  isError,
}: {
  steps: string[];
  isComplete: boolean;
  isError: boolean;
}) => {
  if (steps.length === 0 || isComplete) return null;
  const currentStep = steps[steps.length - 1];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-full shadow-sm w-fit mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {isError ? (
        <AlertCircle className="w-4 h-4 text-rose-500" />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
      )}
      <span className="text-sm font-semibold text-slate-600">
        {isError ? "Processing halted." : currentStep}
      </span>
      {!isError && (
        <span className="flex gap-1 ml-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      )}
    </div>
  );
};

const PlanViewer = ({ plan }: { plan: QueryPlan }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!plan.is_achievable) {
    return (
      <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex gap-3 items-start animate-in fade-in">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
        <div>
          <strong className="block mb-1 text-rose-900 font-bold">Execution Blocked</strong>
          {plan.missing_data_reason || "The requested metrics cannot be calculated with the provided datasets."}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors uppercase tracking-wider"
      >
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-blue-500" />
          <span>Execution Plan: {plan.intent}</span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-slate-200 space-y-4 bg-white">
          {plan.steps.map((step) => (
            <div key={step.step_number} className="flex gap-3 text-sm">
              <div className="shrink-0 w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[11px] text-blue-700 font-bold border border-blue-100">
                {step.step_number}
              </div>
              <div className="pt-0.5">
                <span className="font-mono text-[10px] text-blue-600 font-bold uppercase mr-2 tracking-wider px-2 py-0.5 bg-blue-50 rounded border border-blue-100">
                  {step.operation}
                </span>
                <span className="text-slate-700 font-medium">{step.description}</span>
                <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Columns: {step.columns_involved.join(", ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SQLDisclosure = ({ sql }: { sql: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wider group"
      >
        <TerminalSquare className="w-3.5 h-3.5 group-hover:text-blue-500 transition-colors" />
        {isOpen ? "Hide Math Logic" : "View Math Logic"}
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {isOpen && (
        <div className="mt-3 bg-slate-900 rounded-xl p-4 overflow-x-auto text-left shadow-inner border border-slate-800 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Dialect: DuckDB</span>
            <button
              onClick={() => navigator.clipboard.writeText(sql)}
              className="text-[10px] text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <FileText className="w-3 h-3" /> Copy
            </button>
          </div>
          <pre className="text-[13px] font-mono text-blue-300 leading-relaxed"><code>{sql}</code></pre>
        </div>
      )}
    </div>
  );
};

const MathematicalInsights = ({ insights }: { insights: InsightPayload }) => {
  if (!insights.trends?.length && !insights.anomalies?.length && !insights.correlations?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
      {insights.anomalies?.map((a, i) => (
        <div key={`anomaly-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 shadow-sm font-medium">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          <span><strong>{a.is_positive ? "Spike" : "Drop"}</strong> in {a.column} ({a.z_score.toFixed(1)}σ)</span>
        </div>
      ))}
      {insights.trends?.map((t, i) => (
        <div key={`trend-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 shadow-sm font-medium">
          {t.direction === "increasing" ? <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> : <TrendingDown className="w-3.5 h-3.5 text-blue-500" />}
          <span><strong>{t.column}</strong> is {t.direction} ({t.percentage_change > 0 ? "+" : ""}{t.percentage_change.toFixed(1)}%)</span>
        </div>
      ))}
      {insights.correlations?.map((c, i) => (
        <div key={`corr-${i}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 shadow-sm font-medium">
          <Activity className="w-3.5 h-3.5 text-emerald-500" />
          <span><strong>{c.metric_a}</strong> & <strong>{c.metric_b}</strong> correlated</span>
        </div>
      ))}
    </div>
  );
};

const StructuredNarrativeBlock = ({ narrative }: { narrative: StructuredNarrative }) => (
  <div className="w-full mt-5 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 p-6 shadow-sm animate-in fade-in duration-700">
    <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2 tracking-tight">
      <Sparkles className="h-4 w-4 text-blue-600" />
      Executive Summary
    </h4>
    <p className="text-slate-700 text-[15px] leading-relaxed mb-5">{narrative.executive_summary}</p>
    {narrative.key_insights && narrative.key_insights.length > 0 && (
      <div className="mb-5">
        <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Key Drivers</h5>
        <ul className="space-y-2.5">
          {narrative.key_insights.map((insight, idx) => (
            <li key={idx} className="flex gap-3 text-[14px] text-slate-600 items-start leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-bold">$1</strong>') }} />
            </li>
          ))}
        </ul>
      </div>
    )}
    {narrative.recommended_action && (
      <div className="mt-5 pt-4 border-t border-blue-100">
        <h5 className="text-[11px] font-bold text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> Recommended Action
        </h5>
        <p className="text-[14px] text-blue-900 font-medium leading-relaxed">{narrative.recommended_action}</p>
      </div>
    )}
  </div>
);

const PaginatedTable = ({ data }: { data: any[] }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 8;
  const totalPages = Math.ceil((data?.length || 0) / rowsPerPage);

  if (!data || data.length === 0)
    return <div className="p-4 text-center text-slate-500 text-sm">No data available.</div>;

  const columns = Object.keys(data[0]);
  const currentData = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mt-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 font-bold text-xs uppercase tracking-wider whitespace-nowrap">
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentData.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((col) => (
                  <td key={`${i}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-slate-700 font-medium text-[13px]">
                    {typeof row[col] === "number" ? (row[col] % 1 !== 0 ? row[col].toFixed(2) : row[col]) : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Rows {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, data.length)} of {data.length}
          </span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

const ViewModeToggle = ({
  viewMode,
  setViewMode,
}: {
  viewMode: "chart" | "table";
  setViewMode: (v: "chart" | "table") => void;
}) => (
  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 w-fit mb-4">
    <button
      onClick={() => setViewMode("chart")}
      className={cn("p-1.5 rounded-md text-xs transition-all flex items-center gap-1.5", viewMode === "chart" ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-700")}
    >
      <BarChart3 className="w-3.5 h-3.5" /> Chart
    </button>
    <button
      onClick={() => setViewMode("table")}
      className={cn("p-1.5 rounded-md text-xs transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-700")}
    >
      <Table2 className="w-3.5 h-3.5" /> Table
    </button>
  </div>
);

interface MessageBubbleProps {
  msg: RichMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ msg }) => {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const resolvedSql = msg.payload?.sql_used ?? msg.sqlUsed;

  return (
    <div className={cn("flex flex-col w-full min-w-0 max-w-[90%]", msg.role === "user" ? "items-end" : "items-start")}>
      {msg.role === "user" && msg.content && (
        <div className="px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm bg-slate-900 text-white rounded-tr-none border border-slate-800">
          {msg.content}
        </div>
      )}
      {msg.role === "user" && msg.files && msg.files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 justify-end">
          {msg.files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 shadow-sm">
              <FileText size={14} className="text-blue-500" />
              <span className="truncate max-w-[150px] font-semibold">{f.name}</span>
            </div>
          ))}
        </div>
      )}
      {msg.role === "assistant" && (
        <div className="w-full">
          {msg.isCached && (
            <div className="mb-3 flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-bold tracking-widest uppercase w-fit shadow-sm">
              <Zap className="w-3 h-3 text-amber-500" /> Serverless Cache Hit ({msg.executionTimeMs}ms)
            </div>
          )}
          <StatusStepper steps={msg.statusSteps} isComplete={msg.isComplete} isError={msg.isError} />
          {msg.plan && <PlanViewer plan={msg.plan} />}
          {msg.jobId && !msg.payload && !msg.isError && (
            <div className="mt-4 flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900">Background Compute Worker Active</span>
                <span className="text-[11px] text-slate-500 font-mono mt-1 uppercase tracking-wider">Job ID: {msg.jobId.split("-")[0]}</span>
              </div>
            </div>
          )}
          <div className="w-full space-y-4">
            {msg.content && !msg.narrative && !msg.isError && (
              <div className="bg-white px-6 py-5 rounded-3xl rounded-tl-sm border border-slate-200 shadow-sm w-full mt-3">
                <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              </div>
            )}
            {msg.isError && msg.content && (
              <div className="mt-3 bg-rose-50 text-rose-700 border border-rose-200 px-5 py-4 rounded-2xl rounded-tl-sm text-sm font-medium flex items-start gap-3 shadow-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                {msg.content}
              </div>
            )}
            {msg.insights && <MathematicalInsights insights={msg.insights} />}
            {msg.narrative && <StructuredNarrativeBlock narrative={msg.narrative} />}
            {msg.payload && (
              <div className="mt-6 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
                {viewMode === "chart" ? (
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[300px]">
                    <DynamicChartFactory payload={msg.payload} anomalies={msg.insights?.anomalies} />
                  </div>
                ) : (
                  <PaginatedTable data={msg.payload.data} />
                )}
              </div>
            )}
            {resolvedSql && msg.isComplete && <SQLDisclosure sql={resolvedSql} />}
            {msg.isComplete && !msg.isError && (
              <div className="flex items-center gap-2 pt-2 pl-2">
                <button className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"><ThumbsUp className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"><ThumbsDown className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 6. MAIN ORCHESTRATOR
// ============================================================================

export const DashboardOrchestrator: React.FC<DashboardOrchestratorProps> = ({
  token,
  tenantId,
  initialDatasetIds = [],
  onConnectIntegration,
}) => {
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>(initialDatasetIds);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived empty-state discriminator
  const hasData = activeDatasetIds.length > 0;
  const hasMessages = messages.length > 0;
  const showEmptyState = !hasMessages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, progressStatus]);

  // Async Job Polling
  useEffect(() => {
    const activeJobs = messages.filter((m) => m.role === "assistant" && m.jobId && !m.payload && !m.isError);
    if (activeJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const jobMsg of activeJobs) {
        try {
          const res = await fetch(`/api/query/job/${jobMsg.jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 200) {
            const data = await res.json();
            if (data.status === "success") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jobMsg.id
                    ? { ...m, payload: data.payload, insights: data.insights, narrative: data.narrative, jobId: undefined, isComplete: true, statusSteps: [...m.statusSteps, "Background job complete."] }
                    : m
                )
              );
            } else if (data.status === "failed") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jobMsg.id
                    ? { ...m, isError: true, isComplete: true, content: data.error || "Background task failed.", jobId: undefined }
                    : m
                )
              );
            }
          }
        } catch (e) {
          console.error(`Polling failed for job ${jobMsg.jobId}`, e);
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [messages, token]);

  const historyContext = useMemo(
    () => messages.slice(-6).map((m) => ({ role: m.role, content: m.content || m.reasoning || "" })),
    [messages]
  );

  const uploadDirectToR2 = async (file: File): Promise<string> => {
    try {
      const initRes = await fetch("/api/ingestion/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ file_name: file.name, content_type: file.type }),
      });
      if (!initRes.ok) throw new Error("Upload initialization failed.");
      const { url, fields, object_key, dataset_id } = await initRes.json();

      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
      formData.append("file", file);

      const uploadRes = await fetch(url, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error(`Storage rejection for ${file.name}`);

      setProgressStatus(`Indexing ${file.name} for Zero-ETL...`);

      const workerRes = await fetch("/api/ingestion/process-parquet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataset_id, object_key }),
      });
      if (!workerRes.ok) throw new Error("Processing failed.");
      return dataset_id;
    } catch (e: any) {
      toast({ title: "Upload Failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleSendMessage = useCallback(async (text: string, files: File[] = []) => {
    if ((!text.trim() && files.length === 0) || isProcessing) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text, files, statusSteps: [], isComplete: true, isError: false, timestamp: new Date() },
    ]);

    setIsProcessing(true);
    setProgressStatus("Preparing workspace...");

    try {
      let newlyUploadedIds: string[] = [];
      if (files.length > 0) {
        setProgressStatus("Mounting dataset to compute engine...");
        newlyUploadedIds = await Promise.all(files.map((f) => uploadDirectToR2(f)));
        setActiveDatasetIds((prev) => [...new Set([...prev, ...newlyUploadedIds])]);
      }

      const currentActiveIds = [...new Set([...activeDatasetIds, ...newlyUploadedIds])];

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", statusSteps: [], isComplete: false, isError: false, timestamp: new Date() },
      ]);

      const response = await fetch("/api/chat/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: text, active_dataset_ids: currentActiveIds, history: historyContext }),
      });

      if (!response.ok || !response.body) throw new Error("Compute Engine disconnected.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";
      let accumulatedNarrative = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n\n");
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const payloadStr = line.replace(/^data: /, "").trim();
          if (!payloadStr) continue;

          try {
            const packet = JSON.parse(payloadStr);
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                switch (packet.type) {
                  case "status": setProgressStatus(packet.content); return { ...m, statusSteps: [...m.statusSteps, packet.content] };
                  case "plan": return { ...m, plan: packet.content as QueryPlan };
                  case "sql": return { ...m, sqlUsed: packet.content as string };
                  case "data": return { ...m, payload: packet.content as unknown as ExecutionPayload };
                  case "insights": return { ...m, insights: packet.content as InsightPayload };
                  case "narrative": return { ...m, narrative: packet.content as StructuredNarrative };
                  case "narrative_chunk": accumulatedNarrative += packet.content; return { ...m, content: accumulatedNarrative };
                  case "cache_hit": return { ...m, isCached: true, executionTimeMs: packet.execution_time_ms, plan: packet.content.plan, payload: packet.content.payload, insights: packet.content.insights, narrative: packet.content.narrative, isComplete: true };
                  case "job_queued": return { ...m, jobId: packet.content.job_id, content: "Highly complex query detected. Background worker activated — results arriving shortly." };
                  case "error": return { ...m, isError: true, content: packet.content, isComplete: true };
                  case "done": return { ...m, isComplete: true };
                  default: return m;
                }
              })
            );
          } catch { /* Silently ignore split JSON fragment parsing errors */ }
        }
      }
    } catch (error: any) {
      toast({ title: "Engine Error", description: error.message, variant: "destructive" });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isError: true, isComplete: true, content: `Error: ${error.message}` } : m
        )
      );
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  }, [isProcessing, activeDatasetIds, historyContext, token]);

  // Convenience: send a prompt as if typed in the input
  const handleSendPrompt = useCallback((prompt: string) => {
    handleSendMessage(prompt, []);
  }, [handleSendMessage]);

  // Handle integration connection (delegates to parent or falls back to file-upload-based mock)
  const handleConnectIntegration = useCallback(async (id: string) => {
    if (onConnectIntegration) {
      try {
        const datasetId = await onConnectIntegration(id);
        setActiveDatasetIds((prev) => [...new Set([...prev, datasetId])]);
        toast({ title: `${id} connected`, description: "Your data is now available for analysis." });
      } catch (e: any) {
        toast({ title: "Connection failed", description: e.message, variant: "destructive" });
      }
    } else {
      // Graceful fallback: just mark source active for demo purposes
      setActiveDatasetIds((prev) => [...new Set([...prev, `mock_${id}`])]);
      toast({ title: `${id} connected`, description: "Demo mode: mock data source added." });
    }
  }, [onConnectIntegration]);

  const handleFileUploadFromEmptyState = useCallback((files: File[]) => {
    handleSendMessage("", files);
  }, [handleSendMessage]);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans">
      {/* --- HEADER --- */}
      <header className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-600 rounded-lg shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900">
            DataOmen{" "}
            <span className="text-slate-400 font-medium ml-1 border-l border-slate-200 pl-2">Copilot</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Source count pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
            <div className={cn("w-2 h-2 rounded-full", activeDatasetIds.length > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              {activeDatasetIds.length} Source{activeDatasetIds.length !== 1 ? "s" : ""} Active
            </span>
          </div>

          {/* Quick connect button (visible when no data yet) */}
          {!hasData && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-full transition-colors shadow-sm shadow-blue-200"
            >
              <Upload className="w-3 h-3" />
              Upload Data
            </button>
          )}
        </div>
      </header>

      {/* --- SCROLLABLE CHAT FEED --- */}
      <ScrollArea className="flex-1 px-4 py-8 md:px-12 lg:px-24">
        <div className="max-w-4xl mx-auto space-y-10 pb-40">

          {/* ── EMPTY STATE SWITCHER ── */}
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center min-h-[55vh] py-8">
              {!hasData ? (
                // Phase 1: No data connected → Frictionless ingestion
                <FrictionlessIngestionState
                  onConnectIntegration={handleConnectIntegration}
                  onFileUpload={handleFileUploadFromEmptyState}
                  fileInputRef={fileInputRef}
                />
              ) : (
                // Phase 2: Data connected → SaaS Starter Pack
                <SaaSStarterPack
                  activeDatasetIds={activeDatasetIds}
                  onSendPrompt={handleSendPrompt}
                />
              )}
            </div>
          )}

          {/* ── MESSAGE RENDERING LOOP ── */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex w-full group", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <div className="mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm mr-4 bg-white border-slate-200 text-blue-600">
                  <Sparkles size={14} className="text-blue-600" />
                </div>
              )}
              <MessageBubble msg={msg} />
            </div>
          ))}

          <div ref={scrollRef} className="h-10" />
        </div>
      </ScrollArea>

      {/* --- OMNI INPUT LAYER --- */}
      <div className="shrink-0 bg-white border-t border-slate-200 p-4 sm:p-6 z-30">
        <div className="max-w-4xl mx-auto relative">
          {/* Inline file input for header button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.parquet,.xlsx,.xls,.json"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleFileUploadFromEmptyState(files);
              e.target.value = "";
            }}
          />
          <OmniMessageInput
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            progressStatus={progressStatus}
          />
        </div>
      </div>
    </div>
  );
};