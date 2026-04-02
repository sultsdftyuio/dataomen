'use client'

import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import {
  Database, ArrowRight, CheckCircle2, Loader2, ChevronLeft,
  ShieldCheck, Search, Lock, ShoppingBag, ExternalLink,
  CreditCard, Zap, Droplet, Server, Box, AlertCircle,
  RefreshCw, Info, Eye, EyeOff, ChevronDown, ChevronRight,
  Table2, Sparkles, AlertTriangle, Edit2, RotateCcw,
  BarChart2, TrendingDown, DollarSign, Users, XCircle,
  CheckSquare, Shield, KeyRound, Wifi, Cpu, LineChart,
  Fingerprint, FileCheck, Clock, Ban, Settings, Brain,
  Lightbulb, Target, Activity, Layers, Rocket, Plus,
  Terminal, Bug, ChevronUp, TrendingUp, Wallet,
  TrendingUp as TrendUp, MessageSquare, PieChart, Zap as ZapIcon
} from 'lucide-react'

import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { z } from 'zod'

interface AnimatePresenceProps {
  children: React.ReactNode
  mode?: 'wait' | 'sync' | 'popLayout'
}

const AnimatePresence: React.FC<React.PropsWithChildren<AnimatePresenceProps>> = ({ children }) => <>{children}</>

const motion = {
  div: ({ children, initial, animate, exit, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => (
    <div {...props}>{children}</div>
  ),
  button: ({ children, initial, animate, exit, transition, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => (
    <button {...props}>{children}</button>
  ),
}
// ═════════════════════════════════════════════════════════════════════════════
// STATE MACHINE - Architectural Foundation
// ═════════════════════════════════════════════════════════════════════════════

type MachineState =
  | { type: 'idle' }
  | { type: 'selecting' }
  | { type: 'inputting'; integrationId: IntegrationType }
  | { type: 'verifying'; integrationId: IntegrationType; jobId: string }
  | { type: 'mapping'; integrationId: IntegrationType; tables: DetectedTable[] }
  | { type: 'analyzing'; integrationId: IntegrationType; tables: DetectedTable[] }
  | { type: 'review'; integrationId: IntegrationType; result: ConnectionResult }
  | { type: 'saving'; integrationId: IntegrationType }
  | { type: 'success'; integrationId: IntegrationType; insights: FirstInsight[] }
  | { type: 'error'; integrationId: IntegrationType; error: ConnectionError; showDebug?: boolean }
  | { type: 'oauth_redirecting'; integrationId: IntegrationType }

type MachineAction =
  | { type: 'SELECT_INTEGRATION'; integrationId: IntegrationType }
  | { type: 'BACK_TO_SELECT' }
  | { type: 'START_VERIFICATION'; jobId: string }
  | { type: 'TABLE_DETECTED'; table: DetectedTable }
  | { type: 'MAPPING_COMPLETE'; tables: DetectedTable[] }
  | { type: 'ANALYSIS_COMPLETE'; result: ConnectionResult }
  | { type: 'START_SAVING' }
  | { type: 'SAVE_SUCCESS'; insights: FirstInsight[] }
  | { type: 'ERROR'; error: ConnectionError }
  | { type: 'RETRY' }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'CLOSE' }
  | { type: 'START_OAUTH' }

interface MachineContext {
  formData: Record<string, string>
  fieldErrors: Record<string, string>
  detectedTables: DetectedTable[]
  currentPhase: BackendPhaseKey
  autofillMeta: { dbName?: string; host?: string }
}

const initialContext: MachineContext = {
  formData: {},
  fieldErrors: {},
  detectedTables: [],
  currentPhase: 'connecting',
  autofillMeta: {},
}

function machineReducer(state: MachineState, action: MachineAction, context: MachineContext): MachineState {
  switch (state.type) {
    case 'idle':
      if (action.type === 'SELECT_INTEGRATION') return { type: 'inputting', integrationId: action.integrationId }
      return state
    case 'selecting':
      if (action.type === 'SELECT_INTEGRATION') return { type: 'inputting', integrationId: action.integrationId }
      return state
    case 'inputting':
      switch (action.type) {
        case 'BACK_TO_SELECT': return { type: 'selecting' }
        case 'START_VERIFICATION': return { type: 'verifying', integrationId: state.integrationId, jobId: action.jobId }
        case 'START_OAUTH': return { type: 'oauth_redirecting', integrationId: state.integrationId }
        case 'CLOSE': return { type: 'idle' }
        default: return state
      }
    case 'verifying':
      switch (action.type) {
        case 'TABLE_DETECTED': return { type: 'mapping', integrationId: state.integrationId, tables: [...context.detectedTables, action.table] }
        case 'MAPPING_COMPLETE': return { type: 'analyzing', integrationId: state.integrationId, tables: action.tables }
        case 'ERROR': return { type: 'error', integrationId: state.integrationId, error: action.error }
        default: return state
      }
    case 'mapping':
      switch (action.type) {
        case 'TABLE_DETECTED': return { type: 'mapping', integrationId: state.integrationId, tables: [...state.tables, action.table] }
        case 'ANALYSIS_COMPLETE': return { type: 'review', integrationId: state.integrationId, result: action.result }
        case 'ERROR': return { type: 'error', integrationId: state.integrationId, error: action.error }
        default: return state
      }
    case 'analyzing':
      switch (action.type) {
        case 'ANALYSIS_COMPLETE': return { type: 'review', integrationId: state.integrationId, result: action.result }
        case 'ERROR': return { type: 'error', integrationId: state.integrationId, error: action.error }
        default: return state
      }
    case 'review':
      switch (action.type) {
        case 'START_SAVING': return { type: 'saving', integrationId: state.integrationId }
        case 'BACK_TO_SELECT': return { type: 'selecting' }
        case 'RETRY': return { type: 'inputting', integrationId: state.integrationId }
        default: return state
      }
    case 'saving':
      switch (action.type) {
        case 'SAVE_SUCCESS': return { type: 'success', integrationId: state.integrationId, insights: action.insights }
        case 'ERROR': return { type: 'error', integrationId: state.integrationId, error: action.error }
        default: return state
      }
    case 'success':
      if (action.type === 'CLOSE') return { type: 'idle' }
      return state
    case 'error':
      switch (action.type) {
        case 'RETRY': return { type: 'inputting', integrationId: state.integrationId }
        case 'BACK_TO_SELECT': return { type: 'selecting' }
        case 'TOGGLE_DEBUG': return { ...state, showDebug: !state.showDebug }
        case 'CLOSE': return { type: 'idle' }
        default: return state
      }
    case 'oauth_redirecting': return state
    default: return state
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═════════════════════════════════════════════════════════════════════════════

type IntegrationType = 'supabase' | 'vercel' | 'railway' | 'render' | 'stripe' | 'lemonsqueezy' | 'postgres' | 'shopify'
type AuthParadigm = 'credentials' | 'oauth' | 'uri'
type BackendPhaseKey = 'connecting' | 'authenticating' | 'validating_schema' | 'mapping_tables' | 'generating_insights' | 'done' | 'error'
type ConfidenceLevel = 'high' | 'medium' | 'low'

interface ConnectionError {
  message: string
  type: 'ip_allowlist' | 'invalid_credentials' | 'timeout' | 'ssl_error' | 'permission_denied' | 'unknown'
  fix?: string
  actionLabel?: string
  actionHref?: string
  debugInfo?: DebugInfo
}

interface DebugInfo {
  timestamp: string
  requestId: string
  queryAttempts: { query: string; duration: number; error?: string }[]
  connectionDetails: { host?: string; port?: number; ssl?: boolean; version?: string }
}

interface FirstInsight {
  label: string
  value: string
  change: { value: number; direction: 'up' | 'down' }
  icon: React.ElementType
  color: string
}

interface DetectedTable {
  name: string
  rowCount: string
  mappingStatus: 'ok' | 'warning' | 'error'
  confidence: ConfidenceLevel
  purpose?: string
  suggestedDashboards?: string[]
}

interface ConnectionResult {
  success: boolean
  partialSuccess?: boolean
  tables: DetectedTable[]
  unmappedTables?: string[]
  partialReason?: string
  aiAnalysis?: {
    detectedPatterns: string[]
    suggestedDashboards: { name: string; icon: React.ElementType; description: string }[]
    dataQuality: 'excellent' | 'good' | 'fair' | 'poor'
  }
}

interface IntegrationConfig {
  id: IntegrationType
  name: string
  category: 'Database' | 'Payment Provider' | 'E-commerce'
  authType: AuthParadigm
  description: string
  icon: React.ElementType
  color: string
  isPopular?: boolean
  fields: IntegrationField[]
  validationSchema: z.ZodObject<any>
  tableInsights?: Record<string, TableInsight>
  insights?: InsightPreview[]
}

interface TableInsight {
  purpose: string
  dashboards: string[]
  confidence: ConfidenceLevel
}

interface InsightPreview {
  label: string
  icon: React.ElementType
  color: string
  description?: string
}

interface IntegrationField {
  name: string
  label: string
  type: 'text' | 'password' | 'select'
  placeholder?: string
  helperText?: string
  whyWeNeedThis?: string
  options?: { label: string; value: string }[]
  validationHint?: string
  autofillSource?: boolean
  autoDetectPattern?: RegExp
}

interface PhaseMeta {
  label: string
  message: string
  subMessage: string
  icon: React.ElementType
  color: string
  progress: number
}

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED PHASE METADATA - Emotional Feedback
// ═════════════════════════════════════════════════════════════════════════════

const PHASE_META: Record<BackendPhaseKey, PhaseMeta> = {
  connecting: {
    label: 'Connecting…',
    message: 'Establishing secure connection…',
    subMessage: 'Encrypting credentials with AES-256-GCM',
    icon: Wifi,
    color: 'text-blue-500',
    progress: 15,
  },
  authenticating: {
    label: 'Authenticating…',
    message: 'Verifying your credentials…',
    subMessage: 'Checking read-only access permissions',
    icon: KeyRound,
    color: 'text-amber-500',
    progress: 30,
  },
  validating_schema: {
    label: 'Validating schema…',
    message: 'Analyzing your database structure…',
    subMessage: 'Detecting tables, columns, and relationships',
    icon: Database,
    color: 'text-purple-500',
    progress: 50,
  },
  mapping_tables: {
    label: 'Mapping tables…',
    message: 'Understanding your data model…',
    subMessage: 'Matching tables to analytics patterns',
    icon: Layers,
    color: 'text-indigo-500',
    progress: 75,
  },
  generating_insights: {
    label: 'Generating insights…',
    message: 'Building your dashboards…',
    subMessage: 'Creating personalized analytics views',
    icon: Sparkles,
    color: 'text-emerald-500',
    progress: 90,
  },
  done: {
    label: 'Done',
    message: 'Connection successful!',
    subMessage: 'Your data is ready for analysis',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    progress: 100,
  },
  error: {
    label: 'Error',
    message: 'Connection failed',
    subMessage: "We'll help you fix this",
    icon: AlertCircle,
    color: 'text-red-500',
    progress: 100,
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// CENTRALIZED VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

const Validation = {
  stripe: z.object({
    api_key: z.string().min(10).regex(/^(sk|rk)_/, 'Must start with sk_ or rk_')
  }),
  supabase: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  vercel: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  lemonsqueezy: z.object({
    api_key: z.string().min(20)
  }),
  railway: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  shopify: z.object({
    shop_url: z.string().min(3).refine(v => v.endsWith('.myshopify.com') || !v.includes('.'), {
      message: 'Enter store name or full .myshopify.com domain'
    })
  }),
}

function validateField(schema: z.ZodObject<any>, name: string, value: string): string | null {
  const result = schema.safeParse({ [name]: value })
  if (!result.success) {
    const error = result.error.errors.find(e => e.path[0] === name)
    return error?.message || null
  }
  return null
}

function validateForm(schema: z.ZodObject<any>, data: Record<string, string>): Record<string, string> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors: Record<string, string> = {}
    result.error.errors.forEach(err => {
      errors[err.path[0] as string] = err.message
    })
    return errors
  }
  return {}
}

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS WITH RICH METADATA
// ═════════════════════════════════════════════════════════════════════════════

const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payment Provider',
    authType: 'credentials',
    description: '1-click connect for MRR, churn, and subscription RAG dashboards.',
    icon: CreditCard,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    isPopular: true,
    validationSchema: Validation.stripe,
    insights: [
      { label: 'MRR dashboard', icon: DollarSign, color: 'text-emerald-600', description: 'Track monthly recurring revenue trends' },
      { label: 'Churn analysis', icon: TrendingDown, color: 'text-red-500', description: 'Identify at-risk customers' },
      { label: 'Revenue trends', icon: BarChart2, color: 'text-blue-600', description: 'Visualize growth patterns' },
    ],
    tableInsights: {
      customers: { purpose: 'Customer lifecycle tracking', dashboards: ['LTV Analysis', 'Cohort Retention'], confidence: 'high' },
      subscriptions: { purpose: 'Revenue & churn analytics', dashboards: ['MRR Trends', 'Churn Prediction'], confidence: 'high' },
      charges: { purpose: 'Transaction analysis', dashboards: ['Revenue Breakdown', 'Payment Failures'], confidence: 'medium' },
    },
    fields: [{
      name: 'api_key',
      label: 'Restricted API Key',
      type: 'password',
      placeholder: 'rk_live_…',
      helperText: 'Create a restricted key in Stripe with read-only access.',
      whyWeNeedThis: 'Used to fetch subscription lifecycle events, customer churn signals, and MRR data. We never store your full secret key.',
      validationHint: 'Must start with rk_ or sk_',
      autoDetectPattern: /^(sk|rk)_(live|test)_/,
    }]
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'Database',
    authType: 'uri',
    description: 'Instantly connect your production Supabase PostgreSQL database.',
    icon: Box,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    isPopular: true,
    validationSchema: Validation.supabase,
    insights: [
      { label: 'User growth', icon: Users, color: 'text-blue-600', description: 'Track signup and activation metrics' },
      { label: 'Event funnels', icon: BarChart2, color: 'text-purple-600', description: 'Analyze user journey paths' },
      { label: 'Retention curves', icon: TrendingDown, color: 'text-amber-500', description: 'Measure user stickiness' },
    ],
    tableInsights: {
      users: { purpose: 'User growth & segmentation', dashboards: ['User Growth', 'Activation Funnel'], confidence: 'high' },
      subscriptions: { purpose: 'Subscription analytics', dashboards: ['MRR Tracking', 'Plan Distribution'], confidence: 'high' },
      events: { purpose: 'Product analytics', dashboards: ['Event Funnels', 'Feature Usage'], confidence: 'medium' },
    },
    fields: [{
      name: 'connection_string',
      label: 'Connection String (URI)',
      type: 'password',
      placeholder: 'postgresql://postgres.[ref]:[password]@aws-0-region.pooler.supabase.com:6543/postgres',
      helperText: 'Found in Supabase → Settings → Database → Connection string.',
      whyWeNeedThis: 'We run read-only queries to map your schema and auto-generate analytics dashboards. We never write to your database.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\/postgres\./,
    }]
  },
  {
    id: 'vercel',
    name: 'Vercel Postgres',
    category: 'Database',
    authType: 'uri',
    description: 'Sync users and events directly from your Vercel-hosted DB.',
    icon: Zap,
    color: 'text-slate-900 bg-slate-100 border-slate-200',
    isPopular: true,
    validationSchema: Validation.vercel,
    insights: [
      { label: 'Account activity', icon: Users, color: 'text-blue-600', description: 'Monitor user engagement' },
      { label: 'Purchase trends', icon: DollarSign, color: 'text-emerald-600', description: 'Track revenue patterns' },
    ],
    tableInsights: {
      accounts: { purpose: 'User account analytics', dashboards: ['User Activity', 'Account Health'], confidence: 'high' },
      sessions: { purpose: 'Engagement tracking', dashboards: ['Session Duration', 'Active Users'], confidence: 'medium' },
      purchases: { purpose: 'Revenue analysis', dashboards: ['Sales Trends', 'Purchase Funnel'], confidence: 'high' },
    },
    fields: [{
      name: 'connection_string',
      label: 'POSTGRES_URL',
      type: 'password',
      placeholder: 'postgres://default:***@ep-mute-***.us-east-1.aws.neon.tech:5432/verceldb',
      helperText: 'Copy POSTGRES_URL from Vercel → Storage → your DB → .env.local tab.',
      whyWeNeedThis: 'Allows Arcli to query your Neon-backed Vercel DB in read-only mode to power dashboards.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\/default:/,
    }]
  },
  {
    id: 'lemonsqueezy',
    name: 'Lemon Squeezy',
    category: 'Payment Provider',
    authType: 'credentials',
    description: 'Sync software sales, licenses, and affiliate data.',
    icon: Droplet,
    color: 'text-purple-600 bg-purple-50 border-purple-100',
    validationSchema: Validation.lemonsqueezy,
    insights: [
      { label: 'Revenue by product', icon: DollarSign, color: 'text-emerald-600', description: 'See top-performing products' },
      { label: 'License activations', icon: CheckSquare, color: 'text-blue-600', description: 'Track software usage' },
    ],
    tableInsights: {
      orders: { purpose: 'Sales analytics', dashboards: ['Revenue Overview', 'Product Performance'], confidence: 'high' },
      licenses: { purpose: 'License management', dashboards: ['Activation Rate', 'License Health'], confidence: 'high' },
    },
    fields: [{
      name: 'api_key',
      label: 'API Key',
      type: 'password',
      placeholder: 'eyJ0eXAiOiJKV1QiLCJhbG…',
      helperText: 'Generate from Lemon Squeezy → Settings → API.',
      whyWeNeedThis: 'Used to pull order history, license activations, and subscription data for your revenue dashboard.',
      autoDetectPattern: /^eyJ/,
    }]
  },
  {
    id: 'railway',
    name: 'Railway / Render',
    category: 'Database',
    authType: 'uri',
    description: 'Connect standard managed PostgreSQL databases instantly.',
    icon: Server,
    color: 'text-blue-600 bg-blue-50 border-blue-100',
    validationSchema: Validation.railway,
    tableInsights: {
      customers: { purpose: 'Customer data analytics', dashboards: ['Customer Insights', 'Segmentation'], confidence: 'high' },
      orders: { purpose: 'Order & revenue tracking', dashboards: ['Order Volume', 'Revenue Trends'], confidence: 'high' },
    },
    fields: [{
      name: 'connection_string',
      label: 'External Database URL',
      type: 'password',
      placeholder: 'postgresql://user:pass@host:port/db',
      helperText: 'Found in Railway/Render database settings under "External URL".',
      whyWeNeedThis: 'Powers read-only schema detection and dashboard generation. Ensure Arcli IPs are allowlisted.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\//,
    }]
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'E-commerce',
    authType: 'oauth',
    description: 'Sync high-frequency e-commerce orders and customers.',
    icon: ShoppingBag,
    color: 'text-green-600 bg-green-50 border-green-100',
    validationSchema: Validation.shopify,
    insights: [
      { label: 'Order volume', icon: BarChart2, color: 'text-green-600', description: 'Track daily sales performance' },
      { label: 'Customer LTV', icon: Users, color: 'text-blue-600', description: 'Analyze customer value over time' },
      { label: 'Revenue trends', icon: DollarSign, color: 'text-emerald-600', description: 'Monitor business growth' },
    ],
    tableInsights: {
      orders: { purpose: 'Sales & order analytics', dashboards: ['Order Dashboard', 'Sales Trends'], confidence: 'high' },
      customers: { purpose: 'Customer analytics', dashboards: ['Customer LTV', 'Repeat Purchase Rate'], confidence: 'high' },
      products: { purpose: 'Product performance', dashboards: ['Top Products', 'Inventory Insights'], confidence: 'medium' },
    },
    fields: [{
      name: 'shop_url',
      label: 'Shop Domain',
      type: 'text',
      placeholder: 'my-store.myshopify.com',
      helperText: 'Enter your exact myshopify.com domain.',
      whyWeNeedThis: 'We use OAuth to securely access your order and customer data — no passwords stored.',
      validationHint: 'e.g. my-store or my-store.myshopify.com',
      autoDetectPattern: /\.myshopify\.com$/,
    }]
  }
]

const CATEGORIES = ['Database', 'Payment Provider', 'E-commerce'] as const

// ═════════════════════════════════════════════════════════════════════════════
// POLLING SERVICE WITH SSE UPGRADE PATH
// ═════════════════════════════════════════════════════════════════════════════

interface PollingCallbacks {
  onPhase: (phase: BackendPhaseKey) => void
  onTable: (table: DetectedTable) => void
  onComplete: (result: ConnectionResult) => void
  onError: (error: ConnectionError) => void
}

class ConnectionService {
  private abortController: AbortController | null = null
  private eventSource: EventSource | null = null
  private fallbackInterval: NodeJS.Timeout | null = null
  private useSSE = false

  async start(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    this.abortController = new AbortController()
    if (this.useSSE && typeof EventSource !== 'undefined') {
      try { await this.connectSSE(jobId, token, callbacks); return }
      catch { /* fallback */ }
    }
    await this.startPolling(jobId, token, callbacks)
  }

  private async connectSSE(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    return new Promise((resolve, reject) => {
      const es = new EventSource(`/api/v1/integrations/test/stream?job_id=${jobId}&token=${token}`)
      this.eventSource = es
      es.onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handleEvent(data, callbacks)
        if (data.phase === 'done' || data.phase === 'error') { es.close(); resolve() }
      }
      es.onerror = () => { es.close(); reject(new Error('SSE failed')) }
    })
  }

  private async startPolling(jobId: string, token: string, callbacks: PollingCallbacks): Promise<void> {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/integrations/test/status?job_id=${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: this.abortController?.signal,
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        this.handleEvent(data, callbacks)
        if (data.phase !== 'done' && data.phase !== 'error') {
          this.fallbackInterval = setTimeout(poll, 600)
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') callbacks.onError(this.parseError(err.message))
      }
    }
    poll()
  }

  private handleEvent(data: any, callbacks: PollingCallbacks): void {
    if (data.phase) callbacks.onPhase(data.phase)
    if (data.detectedTable) callbacks.onTable(data.detectedTable)
    if (data.phase === 'done' && data.result) callbacks.onComplete(data.result)
    if (data.phase === 'error') callbacks.onError(this.parseError(data.error || 'Connection failed'))
  }

  private parseError(message: string): ConnectionError {
    const patterns: { pattern: RegExp; error: Omit<ConnectionError, 'message'> }[] = [
      { pattern: /connection.*refused|ECONNREFUSED/i, error: { type: 'ip_allowlist', fix: 'Add Arcli IPs to your allowlist: 44.223.108.0/24', actionLabel: 'View all IPs', actionHref: '/docs/security/ip-allowlist' } },
      { pattern: /password.*authentication|invalid.*credential/i, error: { type: 'invalid_credentials', fix: 'Verify your password and ensure the connection string is complete', actionLabel: 'Test credentials' } },
      { pattern: /timeout|ETIMEDOUT|sleeping/i, error: { type: 'timeout', fix: 'Wake your database (Railway/Render free tier) or check network settings', actionLabel: 'How to wake', actionHref: '/docs/troubleshooting/database-sleep' } },
      { pattern: /ssl|certificate|TLS/i, error: { type: 'ssl_error', fix: 'Ensure your database supports TLS 1.2+ and certificates are valid', actionLabel: 'SSL troubleshooting', actionHref: '/docs/troubleshooting/ssl' } },
      { pattern: /permission|access.*denied|insufficient.*privilege/i, error: { type: 'permission_denied', fix: 'Grant SELECT permissions on the tables you want to analyze', actionLabel: 'Required permissions', actionHref: '/docs/security/required-permissions' } },
    ]
    for (const { pattern, error } of patterns) {
      if (pattern.test(message)) return { message, ...error }
    }
    return { message, type: 'unknown', fix: 'Please check your credentials and try again' }
  }

  stop(): void {
    this.abortController?.abort()
    this.eventSource?.close()
    if (this.fallbackInterval) clearTimeout(this.fallbackInterval)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function tryExtractDbMeta(uri: string): { dbName?: string; host?: string } {
  try {
    const match = uri.match(/^postgres(?:ql)?:\/\/[^@]+@([^/:]+)(?::\d+)?\/(.+)$/)
    if (match) return { host: match[1], dbName: match[2].split('?')[0] }
  } catch {}
  return {}
}

function detectIntegrationFromInput(input: string): IntegrationType | null {
  const patterns: { pattern: RegExp; id: IntegrationType }[] = [
    { pattern: /^postgres(ql)?:\/\/postgres\./, id: 'supabase' },
    { pattern: /^postgres(ql)?:\/\/default:/, id: 'vercel' },
    { pattern: /^(sk|rk)_(live|test)_/, id: 'stripe' },
    { pattern: /^eyJ/, id: 'lemonsqueezy' },
    { pattern: /\.myshopify\.com$/, id: 'shopify' },
  ]
  for (const { pattern, id } of patterns) if (pattern.test(input)) return id
  return null
}

// ═════════════════════════════════════════════════════════════════════════════
// RICH UI COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function PasswordInput({ id, name, placeholder, disabled, onChange, value }: {
  id: string; name: string; placeholder?: string; disabled?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; value: string
}) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? 'text' : 'password'} placeholder={placeholder} required disabled={disabled}
        className="h-12 bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 font-mono text-sm shadow-inner rounded-xl pr-10 transition-all"
        onChange={onChange} value={value} />
      <button type="button" tabIndex={-1} disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
        onClick={() => setShow(s => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function WhyTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="ml-1.5 text-slate-400 hover:text-blue-500 transition-colors inline-flex items-center">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[240px] text-xs leading-relaxed font-medium bg-slate-900 text-white border-slate-800 p-3">
          <span className="font-bold text-blue-300 block mb-1">Why we need this</span>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const styles = { high: 'bg-emerald-100 text-emerald-700 border-emerald-200', medium: 'bg-amber-100 text-amber-700 border-amber-200', low: 'bg-slate-100 text-slate-600 border-slate-200' }
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${styles[level]}`}>{level} confidence</span>
}

// ═════════════════════════════════════════════════════════════════════════════
// GUIDED STEP INDICATOR
// ═════════════════════════════════════════════════════════════════════════════

function GuidedStepIndicator({ steps, currentStep }: { steps: { id: string; label: string; icon: React.ElementType }[]; currentStep: string }) {
  const currentIndex = steps.findIndex(s => s.id === currentStep)
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, i) => {
        const Icon = step.icon
        const isActive = i === currentIndex
        const isComplete = i < currentIndex
        return (
          <React.Fragment key={step.id}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 ${
              isActive ? 'bg-blue-50 border border-blue-200 shadow-sm' : isComplete ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'
            }`}>
              <div className={`p-1 rounded-lg ${isActive ? 'bg-blue-500 text-white' : isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-blue-700' : isComplete ? 'text-emerald-700' : 'text-slate-400'}`}>{step.label}</span>
              {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            </div>
            {i < steps.length - 1 && <div className={`w-6 h-0.5 rounded-full ${isComplete ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED PHASE PROGRESS PANEL - Emotional Feedback
// ═════════════════════════════════════════════════════════════════════════════

function PhaseProgressPanel({ phase, detectedTables }: { phase: BackendPhaseKey; detectedTables: DetectedTable[] }) {
  const meta = PHASE_META[phase]
  const Icon = meta.icon
  const recentTables = detectedTables.slice(-3)
  
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-white shadow-sm ${meta.color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">{meta.message}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.subMessage}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-blue-600">{meta.progress}%</span>
          </div>
        </div>
        <div className="mt-4 h-2 bg-slate-200/50 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${meta.progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`h-full rounded-full ${phase === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} />
        </div>
        {detectedTables.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-blue-100/50">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Live Detection
            </p>
            <div className="space-y-1.5">
              <AnimatePresence>
                {recentTables.map((table) => (
                  <motion.div key={table.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between text-xs py-1.5 px-2 bg-white/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-mono font-medium text-slate-700">{table.name}</span>
                    </div>
                    <span className="text-slate-400 font-medium">{table.rowCount} rows</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {detectedTables.length > 3 && (
                <p className="text-[10px] text-slate-400 pl-5.5">+{detectedTables.length - 3} more tables detected</p>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// OAUTH PRE-EDUCATION PANEL
// ═════════════════════════════════════════════════════════════════════════════

function OAuthPreEducation({ providerName, permissions }: { providerName: string; permissions: string[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-100 bg-blue-50/50 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-bold text-blue-800">What happens next</span>
      </div>
      <div className="p-4 space-y-3">
        {[
          { step: '1', text: `You'll be redirected to ${providerName} to authorize access` },
          { step: '2', text: 'We\'ll only request read access to:', isList: true },
          { step: '3', text: 'You\'ll return here automatically once authorized' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="p-1.5 bg-white rounded-lg shadow-sm flex-shrink-0">
              <span className="text-xs font-bold text-blue-600">{item.step}</span>
            </div>
            <div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
              {item.isList && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {permissions.map(p => (
                    <span key={p} className="text-[10px] font-bold px-2 py-0.5 bg-white border border-blue-100 text-blue-700 rounded-lg">{p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-blue-100">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Lock className="h-3 w-3" />
            <span>Your credentials are never stored on our servers</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED SECURITY PROOF PANEL
// ═════════════════════════════════════════════════════════════════════════════

function EnhancedSecurityProofPanel() {
  const proofs = [
    { icon: KeyRound, label: 'Credentials encrypted', detail: 'AES-256-GCM via HashiCorp Vault', badge: 'Enterprise-grade' },
    { icon: Shield, label: 'Access scoped read-only', detail: 'No INSERT, UPDATE, or DELETE permissions', badge: 'Zero risk' },
    { icon: Wifi, label: 'Connection via TLS 1.3', detail: 'End-to-end encryption enforced', badge: 'Secure' },
    { icon: Fingerprint, label: 'No data stored', detail: 'Only metadata & schema cached', badge: 'Privacy-first' },
    { icon: FileCheck, label: 'SOC 2 Type II Certified', detail: 'Annual security audits', badge: 'Compliant' },
    { icon: Ban, label: 'Revoke anytime', detail: 'One-click disconnect in settings', badge: 'You control' },
  ]
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-bold text-slate-800">Security & Privacy</span>
      </div>
      <div className="divide-y divide-slate-100">
        {proofs.map(p => (
          <div key={p.label} className="flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 transition-colors">
            <div className="p-1.5 bg-emerald-50 rounded-lg flex-shrink-0 group-hover:scale-110 transition-transform">
              <p.icon className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-800">{p.label}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{p.badge}</span>
              </div>
              <p className="text-[11px] text-slate-500">{p.detail}</p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AI ANALYSIS PANEL
// ═════════════════════════════════════════════════════════════════════════════

function AIAnalysisPanel({ analysis }: { analysis: NonNullable<ConnectionResult['aiAnalysis']> }) {
  const qualityColors = { excellent: 'bg-emerald-100 text-emerald-600', good: 'bg-blue-100 text-blue-600', fair: 'bg-amber-100 text-amber-600', poor: 'bg-red-100 text-red-600' }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/80 to-pink-50/80 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-purple-100 flex items-center gap-2">
        <Brain className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-bold text-purple-800">AI-Powered Analysis</span>
        <Badge className="ml-auto text-[10px] bg-purple-100 text-purple-700 border-purple-200 font-bold">BETA</Badge>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${qualityColors[analysis.dataQuality]}`}>
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">Data Quality</p>
            <p className="text-[10px] text-slate-500 capitalize">{analysis.dataQuality}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detected Patterns</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.detectedPatterns.map(p => (
              <span key={p} className="text-[10px] font-bold px-2 py-1 bg-white border border-purple-100 text-purple-700 rounded-lg">{p}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested Dashboards</p>
          <div className="space-y-1.5">
            {analysis.suggestedDashboards.map(d => (
              <div key={d.name} className="flex items-center gap-2 p-2 bg-white/50 rounded-lg border border-purple-50">
                <d.icon className="h-3.5 w-3.5 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">{d.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{d.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED SCHEMA PREVIEW WITH BUSINESS CONTEXT
// ═════════════════════════════════════════════════════════════════════════════

function EnhancedSchemaPreview({ tables, integration }: { tables: DetectedTable[]; integration: IntegrationConfig }) {
  const statusIcon = (s: DetectedTable['mappingStatus']) => {
    if (s === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
    if (s === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
    return <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-emerald-100 bg-emerald-50/50 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
        <Table2 className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-bold text-emerald-800">Detected Tables</span>
        <Badge className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 font-bold animate-pulse">LIVE</Badge>
      </div>
      <div className="divide-y divide-emerald-100/70">
        {tables.map((t, index) => {
          const insight = integration.tableInsights?.[t.name]
          return (
            <motion.div key={t.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
              className="px-4 py-3 group hover:bg-emerald-50/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(t.mappingStatus)}
                  <span className="text-sm font-mono font-bold text-slate-700">{t.name}</span>
                  {t.mappingStatus === 'warning' && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">partial</span>
                  )}
                  <ConfidenceBadge level={t.confidence} />
                </div>
                <span className="text-xs text-slate-500 font-semibold">{t.rowCount} rows</span>
              </div>
              {insight && (
                <div className="mt-2 pl-6 space-y-1">
                  <p className="text-[11px] text-slate-600"><span className="font-semibold text-emerald-700">Used for:</span> {insight.purpose}</p>
                  <div className="flex flex-wrap gap-1">
                    {insight.dashboards.map(d => (
                      <span key={d} className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-emerald-100 text-emerald-600 rounded">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIONABLE ERROR PANEL
// ═════════════════════════════════════════════════════════════════════════════

function ActionableErrorPanel({ error, onRetry }: { error: ConnectionError; onRetry: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-red-100 bg-red-50 overflow-hidden mb-6">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-xl flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">{error.message}</p>
            {error.fix && <p className="text-xs text-red-600 mt-1 leading-relaxed">{error.fix}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button type="button" size="sm" onClick={onRetry} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
              </Button>
              {error.actionHref ? (
                <a href={error.actionHref} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors">
                  {error.actionLabel} <ExternalLink className="h-3 w-3" />
                </a>
              ) : error.actionLabel ? (
                <span className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-100 rounded-lg">{error.actionLabel}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// DEBUG PANEL
// ═════════════════════════════════════════════════════════════════════════════

function DebugPanel({ error, onClose }: { error: ConnectionError; onClose: () => void }) {
  if (!error.debugInfo) return null
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      className="mt-4 rounded-xl border border-slate-200 bg-slate-900 overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold text-slate-300">Debug Information</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><ChevronUp className="h-4 w-4" /></button>
      </div>
      <div className="p-4 font-mono text-[11px] text-slate-400 space-y-2">
        <div className="flex justify-between"><span>Request ID:</span><span className="text-slate-300">{error.debugInfo.requestId}</span></div>
        <div className="flex justify-between"><span>Timestamp:</span><span className="text-slate-300">{error.debugInfo.timestamp}</span></div>
        <div className="mt-3">
          <span className="text-slate-500">Query Attempts:</span>
          {error.debugInfo.queryAttempts.map((q, i) => (
            <div key={i} className="mt-1 pl-3 border-l-2 border-slate-700">
              <div className="text-slate-500 truncate">{q.query}</div>
              <div className="flex gap-3 mt-0.5">
                <span className={q.error ? 'text-red-400' : 'text-emerald-400'}>{q.error ? '✗ Failed' : '✓ Success'} ({q.duration}ms)</span>
                {q.error && <span className="text-red-400">{q.error}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRST INSIGHT CARD - Time to First Insight
// ═════════════════════════════════════════════════════════════════════════════

function FirstInsightCard({ insight }: { insight: FirstInsight }) {
  const Icon = insight.icon
  const isPositive = insight.change.direction === 'up' && insight.change.value > 0
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${insight.color}`}><Icon className="h-5 w-5" /></div>
        <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? <TrendUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {Math.abs(insight.change.value)}%
        </div>
      </div>
      <div className="text-2xl font-black text-slate-900">{insight.value}</div>
      <div className="text-sm font-medium text-slate-500">{insight.label}</div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MOMENTUM CTA PANEL
// ═════════════════════════════════════════════════════════════════════════════

function MomentumCTAPanel({ dashboards, onSelect }: { dashboards: { name: string; icon: React.ElementType; description: string; color: string }[]; onSelect: (name: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-100">
        <p className="text-sm font-bold text-blue-800 flex items-center gap-2">
          <Rocket className="h-4 w-4" /> What would you like to explore?
        </p>
      </div>
      <div className="p-3 grid gap-2">
        {dashboards.map((d, i) => (
          <motion.button key={d.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            onClick={() => onSelect(d.name)}
            className="flex items-center gap-3 p-3 bg-white hover:bg-blue-50 border border-blue-100 hover:border-blue-200 rounded-xl transition-all group text-left">
            <div className={`p-2 rounded-lg ${d.color}`}><d.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{d.name}</p>
              <p className="text-[11px] text-slate-500">{d.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTO-DETECTION TOAST
// ═════════════════════════════════════════════════════════════════════════════

function AutoDetectionToast({ integrationName, onAccept, onDismiss }: { integrationName: string; onAccept: () => void; onDismiss: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="absolute top-4 left-4 right-4 z-10 bg-slate-900 text-white rounded-xl p-3 flex items-center gap-3 shadow-xl">
      <Sparkles className="h-4 w-4 text-blue-400" />
      <span className="text-sm">Detected <span className="font-bold">{integrationName}</span></span>
      <button onClick={onDismiss} className="ml-auto text-xs font-bold text-slate-400 hover:text-white px-2">No thanks</button>
      <button onClick={onAccept} className="text-xs font-bold bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors">Use This</button>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function IntegrationConnectModal({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  const serviceRef = useRef<ConnectionService | null>(null)
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // State machine
  const [machineState, setMachineState] = useState<MachineState>({ type: 'idle' })
  const [context, setContext] = useState<MachineContext>(initialContext)
  
  // UI state (not machine state)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [autoDetectToast, setAutoDetectToast] = useState<IntegrationType | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Cleanup
  useEffect(() => () => serviceRef.current?.stop(), [])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMachineState({ type: 'idle' })
      setContext(initialContext)
      setSearchQuery('')
      setAutoDetectToast(null)
    }
  }, [isOpen])

  // Dispatch helper
  const dispatch = useCallback((action: MachineAction) => {
    setMachineState(prev => machineReducer(prev, action, context))
  }, [context])

  const updateContext = useCallback((updates: Partial<MachineContext>) => {
    setContext(prev => ({ ...prev, ...updates }))
  }, [])

  // Get integration helper
  const getIntegration = (id: IntegrationType) => INTEGRATIONS.find(i => i.id === id)!

  // Form handlers
  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const newFormData = { ...context.formData, [name]: value }
    updateContext({ formData: newFormData })

    // Clear error
    if (context.fieldErrors[name]) {
      updateContext({ fieldErrors: { ...context.fieldErrors, [name]: '' } })
    }

    // Smart autofill for connection strings
    const field = machineState.type === 'inputting' ? getIntegration(machineState.integrationId).fields.find(f => f.name === name) : null
    if (field?.autofillSource) {
      const meta = tryExtractDbMeta(value)
      updateContext({ autofillMeta: meta })
    }

    // Auto-detect integration from pasted input
    if (value.length > 20 && machineState.type === 'selecting') {
      const detected = detectIntegrationFromInput(value)
      if (detected) setAutoDetectToast(detected)
    }

    // Debounced validation
    if (field?.validationHint && value.length > 5) {
      setIsValidating(true)
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current)
      validationTimerRef.current = setTimeout(() => {
        if (machineState.type === 'inputting') {
          const integration = getIntegration(machineState.integrationId)
          const error = validateField(integration.validationSchema, name, value)
          if (error) updateContext({ fieldErrors: { ...context.fieldErrors, [name]: error } })
        }
        setIsValidating(false)
      }, 400)
    }
  }

  // Start verification
  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (machineState.type !== 'inputting') return

    const integration = getIntegration(machineState.integrationId)
    const errors = validateForm(integration.validationSchema, context.formData)
    if (Object.keys(errors).length > 0) {
      updateContext({ fieldErrors: errors })
      return
    }

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Authentication required')

      const res = await fetch('/api/v1/integrations/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: integration.id, credentials: context.formData }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to start connection test')
      }

      const { job_id } = await res.json()
      dispatch({ type: 'START_VERIFICATION', jobId: job_id })

      serviceRef.current = new ConnectionService()
      serviceRef.current.start(job_id, session.access_token, {
        onPhase: (phase) => updateContext({ currentPhase: phase }),
        onTable: (table) => {
          updateContext({ detectedTables: [...context.detectedTables, table] })
          dispatch({ type: 'TABLE_DETECTED', table })
        },
        onComplete: (result) => dispatch({ type: 'ANALYSIS_COMPLETE', result }),
        onError: (error) => dispatch({ type: 'ERROR', error }),
      })
    } catch (err: any) {
      dispatch({ type: 'ERROR', error: { message: err.message, type: 'unknown' } })
    }
  }

  // Save connection
  const handleSave = async () => {
    if (machineState.type !== 'review') return
    dispatch({ type: 'START_SAVING' })

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Authentication required')

      const res = await fetch('/api/v1/integrations/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_id: machineState.integrationId, credentials: context.formData }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to save')
      }

      await fetch('/api/ingest/trigger/initial_sync_job', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      // First insights (mock - replace with real API)
      const insights: FirstInsight[] = [
        { label: 'Monthly Recurring Revenue', value: '$12,430', change: { value: 12, direction: 'up' }, icon: DollarSign, color: 'bg-emerald-100 text-emerald-600' },
        { label: 'Active Customers', value: '1,284', change: { value: 8, direction: 'up' }, icon: Users, color: 'bg-blue-100 text-blue-600' },
        { label: 'Churn Rate', value: '2.4%', change: { value: 0.5, direction: 'down' }, icon: TrendingDown, color: 'bg-amber-100 text-amber-600' },
      ]

      dispatch({ type: 'SAVE_SUCCESS', insights })
    } catch (err: any) {
      dispatch({ type: 'ERROR', error: { message: err.message, type: 'unknown' } })
    }
  }

  // OAuth
  const handleOAuth = async () => {
    if (machineState.type !== 'inputting') return
    dispatch({ type: 'START_OAUTH' })
    // OAuth redirect logic here
  }

  // Filtered integrations
  const filteredIntegrations = INTEGRATIONS.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.category.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = filteredIntegrations.filter(i => i.category === cat)
    return acc
  }, {} as Record<string, IntegrationConfig[]>)

  // Guided steps for credentials flow
  const guidedSteps = machineState.type === 'inputting' && getIntegration(machineState.integrationId).authType !== 'oauth' ? [
    { id: 'input', label: 'Enter credentials', icon: KeyRound },
    { id: 'verify', label: 'Verify access', icon: ShieldCheck },
    { id: 'map', label: 'Map data', icon: Database },
    { id: 'insights', label: 'Generate insights', icon: Sparkles },
  ] : []

  const getGuidedSubStep = (): string => {
    if (machineState.type === 'verifying') return 'verify'
    if (machineState.type === 'mapping') return 'map'
    if (machineState.type === 'analyzing') return 'insights'
    return 'input'
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => dispatch({ type: 'CLOSE' })}>
      <DialogContent className="sm:max-w-[700px] overflow-hidden p-0 bg-white border-gray-200/80 shadow-2xl rounded-3xl">
        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Idle / Selecting
          ═══════════════════════════════════════════════════════════════════ */}
          {(machineState.type === 'idle' || machineState.type === 'selecting') && (
            <motion.div key="selecting" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col max-h-[85vh]">
              <AnimatePresence>
                {autoDetectToast && (
                  <AutoDetectionToast
                    integrationName={getIntegration(autoDetectToast).name}
                    onAccept={() => { dispatch({ type: 'SELECT_INTEGRATION', integrationId: autoDetectToast }); setAutoDetectToast(null) }}
                    onDismiss={() => setAutoDetectToast(null)}
                  />
                )}
              </AnimatePresence>

              <DialogHeader className="p-6 pb-5 border-b border-gray-100 bg-slate-50/50">
                <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900">Connect Your Stack</DialogTitle>
                <DialogDescription className="mt-1 font-medium text-slate-500">
                  Link your data source. We'll map your schema and show insights instantly.
                </DialogDescription>
                <div className="relative mt-5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search or paste connection string..."
                    className="pl-9 bg-white border-gray-200 focus-visible:ring-blue-500/20 shadow-inner rounded-xl"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                <div className="space-y-4">
                  {CATEGORIES.map(cat => {
                    const items = grouped[cat]
                    if (!items.length) return null
                    const isExpanded = expandedCategory === null || expandedCategory === cat
                    return (
                      <div key={cat}>
                        <button className="w-full flex items-center gap-2 text-left mb-3 group" onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}>
                          <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">{cat}</span>
                          <div className="flex-1 h-px bg-slate-200" />
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        {isExpanded && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {items.map(integration => (
                              <Card key={integration.id} className="p-4 cursor-pointer border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group bg-white shadow-sm rounded-2xl"
                                onClick={() => dispatch({ type: 'SELECT_INTEGRATION', integrationId: integration.id })}>
                                <div className="flex items-start gap-3">
                                  <div className={`p-2.5 rounded-xl border shadow-sm ${integration.color}`}>
                                    <integration.icon className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">{integration.name}</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">{integration.description}</p>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="p-5 border-t border-gray-100 bg-white flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                <Lock className="h-3.5 w-3.5" />
                AES-256 encrypted · Read-only · SOC 2 certified
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Inputting
          ═══════════════════════════════════════════════════════════════════ */}
          {machineState.type === 'inputting' && (
            <motion.div key="inputting" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col max-h-[85vh]">
              {(() => {
                const integration = getIntegration(machineState.integrationId)
                const isOAuth = integration.authType === 'oauth'
                return (
                  <>
                    <DialogHeader className="p-6 pb-5 border-b border-gray-100 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-9 w-9 -ml-2 hover:bg-white border border-transparent hover:border-gray-200 rounded-xl"
                          onClick={() => dispatch({ type: 'BACK_TO_SELECT' })}>
                          <ChevronLeft className="h-5 w-5 text-slate-600" />
                        </Button>
                        <div className={`p-2 rounded-xl border shadow-sm ${integration.color}`}>
                          <integration.icon className="h-5 w-5" />
                        </div>
                        <DialogTitle className="text-xl font-extrabold text-slate-900">Connect {integration.name}</DialogTitle>
                      </div>
                    </DialogHeader>

                    {/* Guided step indicator for credentials flow */}
                    {!isOAuth && <div className="px-6 pt-4"><GuidedStepIndicator steps={guidedSteps} currentStep={getGuidedSubStep()} /></div>}

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                      <form onSubmit={isOAuth ? handleOAuth : handleTestConnection} className="max-w-md mx-auto space-y-5">
                        {/* OAuth Pre-education */}
                        {isOAuth && <OAuthPreEducation providerName={integration.name} permissions={['Orders', 'Customers', 'Products']} />}

                        {/* Input fields */}
                        {integration.fields.map(field => (
                          <div key={field.name} className="space-y-2">
                            <Label className="text-slate-700 font-bold flex items-center">
                              {field.label}
                              {field.whyWeNeedThis && <WhyTooltip text={field.whyWeNeedThis} />}
                            </Label>

                            {field.type === 'password' ? (
                              <PasswordInput id={field.name} name={field.name} placeholder={field.placeholder}
                                onChange={handleFieldChange} value={context.formData[field.name] || ''} />
                            ) : (
                              <Input id={field.name} name={field.name} type="text" placeholder={field.placeholder}
                                className="h-12 bg-slate-50 border-gray-200 focus-visible:ring-blue-500/20 rounded-xl font-mono text-sm"
                                onChange={handleFieldChange} value={context.formData[field.name] || ''} />
                            )}

                            {/* Smart autofill preview */}
                            {field.autofillSource && context.autofillMeta.dbName && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                className="flex items-center gap-3 text-[11px] font-semibold mt-1.5 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                <span className="text-emerald-700">
                                  Detected: {context.autofillMeta.host && <span className="font-mono">{context.autofillMeta.host}</span>} / <span className="font-mono">{context.autofillMeta.dbName}</span>
                                </span>
                              </motion.div>
                            )}

                            {/* Background validation indicator */}
                            {isValidating && !context.fieldErrors[field.name] && (
                              <div className="flex items-center gap-1.5 text-[11px] text-blue-500 font-medium">
                                <Loader2 className="h-3 w-3 animate-spin" /> Validating...
                              </div>
                            )}

                            {context.fieldErrors[field.name] && (
                              <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {context.fieldErrors[field.name]}
                              </p>
                            )}
                            {!context.fieldErrors[field.name] && field.validationHint && (
                              <p className="text-[11px] font-medium text-slate-400">{field.validationHint}</p>
                            )}
                            {field.helperText && !context.fieldErrors[field.name] && (
                              <p className="text-[11px] font-medium text-slate-400">{field.helperText}</p>
                            )}
                          </div>
                        ))}
                      </form>
                    </div>

                    <DialogFooter className="p-6 border-t border-gray-100 bg-slate-50/50">
                      <Button variant="ghost" onClick={() => dispatch({ type: 'CLOSE' })} className="font-bold text-slate-600">Cancel</Button>
                      <Button onClick={isOAuth ? handleOAuth : handleTestConnection}
                        disabled={Object.keys(context.fieldErrors).length > 0}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl">
                        {isOAuth ? (
                          <>Continue to {integration.name} <ExternalLink className="ml-2 h-4 w-4" /></>
                        ) : (
                          <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                )
              })()}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Verifying / Mapping / Analyzing
          ═══════════════════════════════════════════════════════════════════ */}
          {(machineState.type === 'verifying' || machineState.type === 'mapping' || machineState.type === 'analyzing') && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col max-h-[85vh] p-8">
              <PhaseProgressPanel phase={context.currentPhase} detectedTables={context.detectedTables} />
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Review
          ═══════════════════════════════════════════════════════════════════ */}
          {machineState.type === 'review' && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col max-h-[85vh]">
              {(() => {
                const integration = getIntegration(machineState.integrationId)
                return (
                  <>
                    <DialogHeader className="p-6 pb-5 border-b border-gray-100 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                          <DialogTitle className="text-xl font-extrabold text-slate-900">Connection Verified</DialogTitle>
                          <p className="text-sm text-slate-500">
                            Found {machineState.result.tables.length} tables · {machineState.result.tables.filter(t => t.mappingStatus === 'ok').length} mapped
                          </p>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                      {/* Enhanced schema preview with business context */}
                      <EnhancedSchemaPreview tables={machineState.result.tables} integration={integration} />

                      {/* AI Analysis panel */}
                      {machineState.result.aiAnalysis && <AIAnalysisPanel analysis={machineState.result.aiAnalysis} />}

                      {/* Insights preview */}
                      {integration.insights && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-blue-100 bg-blue-50/40 overflow-hidden">
                          <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-bold text-blue-800">We'll generate for you</span>
                          </div>
                          <div className="px-4 py-3 flex flex-wrap gap-2">
                            {integration.insights.map(insight => (
                              <div key={insight.label} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-blue-100 text-slate-700 shadow-sm">
                                <insight.icon className={`h-3.5 w-3.5 ${insight.color}`} />
                                {insight.label}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Partial success warning */}
                      {machineState.result.partialSuccess && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 flex items-start gap-3">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-amber-800">Partial connection</p>
                            <p className="text-xs text-amber-600 mt-1">
                              {machineState.result.partialReason}
                              {machineState.result.unmappedTables && machineState.result.unmappedTables.length > 0 && (
                                <> Tables excluded: <span className="font-mono">{machineState.result.unmappedTables.join(', ')}</span></>
                              )}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    <DialogFooter className="p-6 border-t border-gray-100 bg-slate-50/50">
                      <Button variant="ghost" onClick={() => dispatch({ type: 'BACK_TO_SELECT' })} className="font-bold text-slate-600">Cancel</Button>
                      <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
                        Save & Continue <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </DialogFooter>
                  </>
                )
              })()}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Saving
          ═══════════════════════════════════════════════════════════════════ */}
          {machineState.type === 'saving' && (
            <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
              <p className="text-lg font-bold text-slate-900">Saving connection...</p>
              <p className="text-sm text-slate-500">Starting initial data sync</p>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Success - Time to First Insight
          ═══════════════════════════════════════════════════════════════════ */}
          {machineState.type === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col max-h-[85vh] p-8">
              <div className="text-center mb-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </motion.div>
                <h2 className="text-2xl font-extrabold text-slate-900">You're Connected!</h2>
                <p className="text-sm text-slate-500 mt-1">Here's what we found in your data:</p>
              </div>

              {/* First Insights - THE MONEY SHOT */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {machineState.insights.map((insight, i) => <FirstInsightCard key={insight.label} insight={insight} />)}
              </div>

              {/* Enhanced security proof panel */}
              <div className="mb-6">
                <EnhancedSecurityProofPanel />
              </div>

              {/* Momentum CTAs */}
              <MomentumCTAPanel
                dashboards={[
                  { name: 'View MRR Dashboard', icon: DollarSign, description: 'Track revenue growth', color: 'bg-emerald-100 text-emerald-600' },
                  { name: 'Explore User Funnels', icon: Users, description: 'Analyze user journeys', color: 'bg-blue-100 text-blue-600' },
                  { name: 'Ask AI About Your Data', icon: Brain, description: 'Chat with your metrics', color: 'bg-purple-100 text-purple-600' },
                ]}
                onSelect={(name) => { toast({ title: `Opening ${name}...` }); onSuccess?.(); dispatch({ type: 'CLOSE' }) }}
              />

              <div className="mt-auto flex gap-3 pt-6">
                <Button variant="outline" className="flex-1 font-bold border-gray-200"
                  onClick={() => { dispatch({ type: 'CLOSE' }); setTimeout(() => dispatch({ type: 'BACK_TO_SELECT' }), 300) }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Another
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  onClick={() => { onSuccess?.(); dispatch({ type: 'CLOSE' }) }}>
                  <Sparkles className="mr-2 h-4 w-4" /> Go to Dashboard
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STATE: Error - With Debug Mode
          ═══════════════════════════════════════════════════════════════════ */}
          {machineState.type === 'error' && (
            <motion.div key="error" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col max-h-[85vh] p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">Connection Failed</h2>
                <p className="text-sm text-slate-500 mt-1">{machineState.error.message}</p>
              </div>

              {/* Actionable error panel */}
              <ActionableErrorPanel error={machineState.error} onRetry={() => dispatch({ type: 'RETRY' })} />

              {/* Debug toggle */}
              <button onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 mb-2">
                <Terminal className="h-4 w-4" /> {machineState.showDebug ? 'Hide' : 'Show'} Debug Info
              </button>

              <AnimatePresence>
                {machineState.showDebug && machineState.error.debugInfo && (
                  <DebugPanel error={machineState.error} onClose={() => dispatch({ type: 'TOGGLE_DEBUG' })} />
                )}
              </AnimatePresence>

              <div className="mt-auto flex gap-3">
                <Button variant="outline" className="flex-1 font-bold border-gray-200" onClick={() => dispatch({ type: 'BACK_TO_SELECT' })}>
                  Choose Different
                </Button>
                <Button className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold" onClick={() => dispatch({ type: 'RETRY' })}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}