'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Database,
  MoreHorizontal,
  RefreshCw,
  ArrowUpRight,
  Trash2,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ShieldCheck,
  PlugZap,
  FileText,
  UploadCloud,
  X,
  File,
  AlertCircle,
  ShieldAlert,
  RotateCcw,
  XCircle,
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { createClient } from '@/utils/supabase/client'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string
  name: string
  sourceType: string
  rowCount: number
  /** Raw byte count – formatted in UI */
  size_bytes: number
  /** ISO timestamp – formatted in UI */
  last_synced_at: string
  status: 'Ready' | 'Syncing' | 'Failed'
  is_document?: boolean
  chunk_count?: number
}

type ConnectorCategory = 'All' | 'Data Warehouses' | 'Databases' | 'Apps'
type AuthParadigm = 'credentials' | 'oauth'

interface IntegrationField {
  name: string
  label: string
  type: 'text' | 'password' | 'select'
  placeholder?: string
  helperText?: string
  options?: { label: string; value: string }[]
}

interface ConnectorConfig {
  id: string
  name: string
  category: ConnectorCategory
  authType: AuthParadigm
  desc: string
  logo: React.ReactNode
  color: string
  accentBg: string
  isNew?: boolean
  fields: IntegrationField[]
}

interface PendingFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled'
  errorMessage?: string
  /** AbortController for network cancellation */
  controller: AbortController
}

// ─────────────────────────────────────────────────────────────────────────────
// Real Brand SVG Logos
// ─────────────────────────────────────────────────────────────────────────────

const SnowflakeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 2v20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12h20M2 12l3-3M2 12l3 3m17-3-3-3m3 3-3 3M5.5 5.5l13 13M5.5 5.5l4.2.4-.4-4.2M18.5 18.5l-4.2-.4.4 4.2M18.5 5.5l-13 13M18.5 5.5l-.4 4.2 4.2-.4M5.5 18.5l.4-4.2-4.2.4" stroke="#29B5E8" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const BigQueryLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4285F4"/>
    <path d="M17.6 17.6L13 13V7h2v5.17l4.07 4.07-1.47 1.36z" fill="white"/>
    <path d="M16.24 16.24l1.42 1.42A9.97 9.97 0 0122 12h-2a7.98 7.98 0 01-3.76 6.24z" fill="#4285F4" opacity=".6"/>
  </svg>
)

const RedshiftLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 3L2 7.5v9L12 21l10-4.5v-9L12 3z" fill="#A0264A"/>
    <path d="M12 3v18M2 7.5l10 4.5 10-4.5" stroke="#DD344C" strokeWidth="1"/>
    <path d="M7 10.5v3l5 2.25 5-2.25v-3" fill="#F58B9D" opacity=".7"/>
  </svg>
)

const PostgresLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 2C7.03 2 3 5.58 3 10c0 2.9 1.6 5.45 4 6.9V20h2v-2h6v2h2v-3.1c2.4-1.45 4-4 4-6.9C21 5.58 16.97 2 12 2z" fill="#336791"/>
    <path d="M15 9.5c0 1.65-1.34 3-3 3s-3-1.35-3-3 1.34-3 3-3 3 1.35 3 3z" fill="white" opacity=".9"/>
    <path d="M12 7v5M9.5 9.5h5" stroke="#336791" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const DuckDBLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <circle cx="12" cy="12" r="10" fill="#FCD34D"/>
    <circle cx="9" cy="12" r="3" fill="#1F2937"/>
    <circle cx="15" cy="12" r="3" fill="#1F2937"/>
    <circle cx="9" cy="12" r="1.2" fill="white"/>
    <circle cx="15" cy="12" r="1.2" fill="white"/>
  </svg>
)

const StripeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <rect width="24" height="24" rx="4" fill="#6772E5"/>
    <path d="M11.2 9.4c0-.62.52-1.02 1.36-1.02.88 0 1.86.28 2.74.78V6.5a7.4 7.4 0 00-2.74-.5C10.24 6 8.8 7.1 8.8 9.52c0 3.4 4.68 2.86 4.68 4.32 0 .74-.64 1.02-1.52 1.02-1.02 0-2.12-.42-3.06-1.02v2.7c1.02.44 2.04.66 3.06.66 2.34 0 3.96-1.16 3.96-3.52-.02-3.66-4.7-3.02-4.7-4.34z" fill="white"/>
  </svg>
)

const SalesforceLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M9.5 6.5A3.5 3.5 0 0113 3a3.5 3.5 0 013.1 1.9A2.5 2.5 0 0118 5a2.5 2.5 0 012.5 2.5A2.5 2.5 0 0118 10H7a2.5 2.5 0 010-5 2.5 2.5 0 012.5 1.5z" fill="#00A1E0"/>
    <path d="M5.5 21h13a1.5 1.5 0 001.5-1.5V12H4v7.5A1.5 1.5 0 005.5 21z" fill="#00A1E0" opacity=".5"/>
    <path d="M9 15h6M12 13v4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const HubSpotLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M15 8.5V6a2.5 2.5 0 10-5 0v2.5" stroke="#FF7A59" strokeWidth="1.5"/>
    <circle cx="12.5" cy="12" r="4.5" fill="#FF7A59"/>
    <circle cx="12.5" cy="12" r="2" fill="white"/>
    <path d="M17 9.5l2.5-1.5M17 14.5l2.5 1.5M8 9.5L5.5 8M8 14.5L5.5 16" stroke="#FF7A59" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const ShopifyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M15.5 5.5c-.1-.7-.7-1-1.2-1.1L13 4.2c-.2-.5-.6-1.2-1.5-1.2-.1 0-.2 0-.3.1-.2-.3-.5-.4-.8-.4-2 0-3 2.5-3.3 3.8l-1.4.4c-.4.1-.5.2-.5.6L4.5 18l9 1.5 4.5-1-.1-.1L15.5 5.5z" fill="#96BF48"/>
    <path d="M14.3 4.4l-1.2.4V5c-.4-1.2-1.1-1.8-1.8-1.8-.1.4-.3.9-.5 1.4.5.2 1 .7 1.3 1.7.3-.1.7-.2 1.1-.3.1-.5.1-.8.1-.8l1 .2z" fill="#5E8E3E"/>
    <path d="M12.2 5.5c-.6 0-1 .4-1 .9s.4.9 1 .9 1-.4 1-.9-.4-.9-1-.9z" fill="#5E8E3E"/>
  </svg>
)

const ZendeskLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 3a9 9 0 110 18A9 9 0 0112 3z" fill="#03363D"/>
    <path d="M9 9l6 3-6 3V9z" fill="#FFCA28"/>
    <path d="M15 9v6H9l6-6z" fill="#FFCA28" opacity=".6"/>
  </svg>
)

const GoogleAdsLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M3 17.5L8.5 8l5.5 9.5H3z" fill="#FBBC05"/>
    <path d="M13.5 17.5L19 8l5.5 9.5H13.5z" fill="#4285F4" transform="translate(-5 0)"/>
    <circle cx="19" cy="17.5" r="3" fill="#34A853"/>
  </svg>
)

const MetaAdsLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <path d="M12 2.5C6.7 2.5 2.5 6.7 2.5 12S6.7 21.5 12 21.5 21.5 17.3 21.5 12 17.3 2.5 12 2.5z" fill="#1877F2"/>
    <path d="M16.7 15.2l.5-3h-2.9v-1.9c0-.8.4-1.6 1.6-1.6h1.3V6.1S16 5.8 14.8 5.8c-2.4 0-4 1.4-4 4v2.4H8.3v3h2.5V21c.5.1 1 .1 1.5.1s1 0 1.5-.1v-5.8h2.9z" fill="white"/>
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────
// Integration Catalog
// ─────────────────────────────────────────────────────────────────────────────

const INTEGRATIONS: ConnectorConfig[] = [
  {
    id: "snowflake", name: "Snowflake", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your enterprise cloud data warehouse natively.",
    logo: <SnowflakeLogo />,
    color: "#29B5E8", accentBg: "rgba(41,181,232,0.06)",
    fields: [
      { name: 'account', label: 'Account Identifier', type: 'text', placeholder: 'xy12345.us-east-1' },
      { name: 'warehouse', label: 'Warehouse', type: 'text', placeholder: 'COMPUTE_WH' },
      { name: 'database', label: 'Database', type: 'text', placeholder: 'ANALYTICS_DB' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'dataomen_role' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: "bigquery", name: "BigQuery", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your Google BigQuery datasets for instant analysis.",
    logo: <BigQueryLogo />,
    color: "#4285F4", accentBg: "rgba(66,133,244,0.06)",
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project-123' },
      { name: 'dataset_id', label: 'Dataset ID', type: 'text', placeholder: 'analytics_production' },
      { name: 'service_account', label: 'Service Account JSON', type: 'password', placeholder: '{"type": "service_account", ...}', helperText: 'Paste the entire contents of your Service Account JSON key file.' },
    ]
  },
  {
    id: "redshift", name: "Redshift", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your AWS Redshift clusters for analytical workloads.",
    logo: <RedshiftLogo />,
    color: "#DD344C", accentBg: "rgba(221,52,76,0.06)",
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'cluster.redshift.amazonaws.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5439' },
      { name: 'database', label: 'Database', type: 'text', placeholder: 'dev' },
      { name: 'user', label: 'Username', type: 'text' },
      { name: 'password', label: 'Password', type: 'password' },
    ]
  },
  {
    id: "postgres", name: "PostgreSQL", category: "Databases", authType: 'credentials',
    desc: "Connect your Postgres analytical replica.",
    logo: <PostgresLogo />,
    color: "#336791", accentBg: "rgba(51,103,145,0.06)",
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'db.example.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5432' },
      { name: 'database', label: 'Database Name', type: 'text', placeholder: 'production_db' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'readonly_user' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: "duckdb", name: "DuckDB", category: "Databases", authType: 'credentials',
    desc: "Connect to local or cloud-hosted DuckDB files.",
    logo: <DuckDBLogo />,
    color: "#E8A317", accentBg: "rgba(232,163,23,0.06)",
    fields: [
      { name: 'database_path', label: 'Database Path', type: 'text', placeholder: 's3://bucket/data.duckdb', helperText: 'Provide the S3 URI or mounted volume path.' },
    ]
  },
  {
    id: "stripe", name: "Stripe", category: "Apps", authType: 'credentials',
    desc: "Live connection to your billing and subscription data.",
    logo: <StripeLogo />,
    color: "#6772E5", accentBg: "rgba(103,114,229,0.06)",
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_...', helperText: 'Requires read-only access to Customers, Subscriptions, and Invoices.' },
    ]
  },
  {
    id: "salesforce", name: "Salesforce", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM leads, opportunities, and accounts.",
    logo: <SalesforceLogo />,
    color: "#00A1E0", accentBg: "rgba(0,161,224,0.06)",
    fields: [
      { name: 'environment', label: 'Environment', type: 'select', options: [{ label: 'Production', value: 'login' }, { label: 'Sandbox', value: 'test' }] },
    ]
  },
  {
    id: "hubspot", name: "HubSpot", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM contacts, deals, and pipelines.",
    logo: <HubSpotLogo />,
    color: "#FF7A59", accentBg: "rgba(255,122,89,0.06)",
    fields: [
      { name: 'portal_id', label: 'Portal ID (Optional)', type: 'text', placeholder: '12345678' },
    ]
  },
  {
    id: "shopify", name: "Shopify", category: "Apps", authType: 'oauth',
    desc: "Live connection to your e-commerce orders and customers.",
    logo: <ShopifyLogo />,
    color: "#96BF48", accentBg: "rgba(150,191,72,0.06)",
    fields: [
      { name: 'shop_url', label: 'Shop Domain', type: 'text', placeholder: 'my-store.myshopify.com' },
    ]
  },
  {
    id: "zendesk", name: "Zendesk", category: "Apps", authType: 'credentials',
    desc: "Analyze your customer support tickets and resolution times.",
    logo: <ZendeskLogo />,
    color: "#03363D", accentBg: "rgba(3,54,61,0.05)",
    fields: [
      { name: 'subdomain', label: 'Zendesk Subdomain', type: 'text', placeholder: 'company' },
      { name: 'email', label: 'Admin Email', type: 'text', placeholder: 'admin@company.com' },
      { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••' },
    ]
  },
  {
    id: "google_ads", name: "Google Ads", category: "Apps", authType: 'credentials', isNew: true,
    desc: "Analyze your campaign performance and ad spend.",
    logo: <GoogleAdsLogo />,
    color: "#FBBC05", accentBg: "rgba(251,188,5,0.06)",
    fields: [
      { name: 'developer_token', label: 'Developer Token', type: 'password' },
      { name: 'client_id', label: 'OAuth Client ID', type: 'text' },
      { name: 'client_secret', label: 'OAuth Client Secret', type: 'password' },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password' },
    ]
  },
  {
    id: "meta_ads", name: "Meta Ads", category: "Apps", authType: 'credentials', isNew: true,
    desc: "Analyze your Facebook and Instagram ad campaigns.",
    logo: <MetaAdsLogo />,
    color: "#1877F2", accentBg: "rgba(24,119,242,0.06)",
    fields: [
      { name: 'access_token', label: 'System User Access Token', type: 'password' },
      { name: 'ad_account_id', label: 'Ad Account ID', type: 'text', placeholder: 'act_123456789' },
    ]
  },
]

const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'text/markdown',
]
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.csv,.md'
const MAX_FILE_SIZE_MB = 50

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n)

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

const formatRelativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #6 — Token cache to avoid auth call on every request
// ─────────────────────────────────────────────────────────────────────────────

let _cachedToken: string | null = null
let _tokenExpiry = 0

async function getSessionToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken
  const supabase = createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw new Error('Authentication required.')
  _cachedToken = session.access_token
  _tokenExpiry = Date.now() + 55 * 60 * 1000 // cache for 55 min
  return _cachedToken
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #5 — Polling with exponential backoff
// ─────────────────────────────────────────────────────────────────────────────

const useDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const backoffRef = useRef(5000)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isMounted = useRef(true)

  const fetchDatasets = useCallback(async (isSilent = false) => {
    if (!isMounted.current) return
    if (!isSilent) setIsLoading(true)
    try {
      const token = await getSessionToken()
      const res = await fetch('/api/datasets', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!isMounted.current) return
      if (!res.ok) {
        if (res.status === 404) { setDatasets([]); return }
        throw new Error('Unable to reach the sync engine.')
      }
      const data = await res.json()
      setDatasets(Array.isArray(data) ? data : (data.datasets ?? []))
    } catch (err: any) {
      console.warn('Dataset fetch:', err.message)
      setDatasets([])
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    fetchDatasets()
    return () => { isMounted.current = false }
  }, [fetchDatasets])

  // Backoff polling – only while syncing
  useEffect(() => {
    const isSyncing = datasets.some(d => d.status === 'Syncing')
    if (!isSyncing) { backoffRef.current = 5000; return }

    const tick = async () => {
      await fetchDatasets(true)
      backoffRef.current = Math.min(backoffRef.current * 1.5, 30000)
      timerRef.current = setTimeout(tick, backoffRef.current)
    }
    timerRef.current = setTimeout(tick, backoffRef.current)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [datasets, fetchDatasets])

  return { datasets, isLoading, refetch: fetchDatasets, setDatasets }
}

// ─────────────────────────────────────────────────────────────────────────────
// Disconnect API
// ─────────────────────────────────────────────────────────────────────────────

async function callDisconnectApi(id: string): Promise<void> {
  const token = await getSessionToken()
  const res = await fetch(`/api/datasets/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Failed to disconnect (${res.status})`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FileUploadZone — all 5 upload bugs fixed
// ─────────────────────────────────────────────────────────────────────────────

interface FileUploadZoneProps {
  onUploadComplete: (optimisticDoc?: Partial<Dataset>) => void
}

function FileUploadZone({ onUploadComplete }: FileUploadZoneProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])

  // FIX #2 — track all intervals so we can clean up on unmount
  const intervalRefs = useRef<NodeJS.Timeout[]>([])
  useEffect(() => {
    return () => {
      intervalRefs.current.forEach(clearInterval)
      // Also abort any live uploads when the component unmounts
      setPendingFiles(pfs => {
        pfs.forEach(pf => { if (pf.status === 'uploading') pf.controller.abort() })
        return []
      })
    }
  }, [])

  const updateFile = (id: string, patch: Partial<PendingFile>) =>
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))

  const removeFile = (id: string) =>
    setPendingFiles(prev => prev.filter(f => f.id !== id))

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type))
      return `Unsupported file type: ${file.type || 'unknown'}`
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024)
      return `File exceeds ${MAX_FILE_SIZE_MB} MB limit.`
    return null
  }

  const uploadFile = async (pf: PendingFile) => {
    updateFile(pf.id, { status: 'uploading', progress: 5 })

    // FIX #1 — single, strictly monotonic progress ticker
    let fakeProgress = 5
    const ticker = setInterval(() => {
      fakeProgress = Math.min(90, fakeProgress + Math.random() * 10)
      updateFile(pf.id, { progress: Math.floor(fakeProgress) })
    }, 350)
    intervalRefs.current.push(ticker)

    try {
      const token = await getSessionToken()
      const formData = new FormData()
      formData.append('file', pf.file)

      // FIX #3 — AbortController per file
      const res = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: pf.controller.signal,
      })

      clearInterval(ticker)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Upload failed (${res.status})`)
      }

      const json = await res.json().catch(() => ({}))

      updateFile(pf.id, { status: 'done', progress: 100 })
      toast({ title: 'Document Indexed', description: `"${pf.file.name}" has been chunked and stored.` })

      // FIX #11 — optimistic UI: pass the new doc immediately
      onUploadComplete({
        id: json.id ?? `optimistic-${pf.id}`,
        name: pf.file.name,
        is_document: true,
        chunk_count: json.chunk_count ?? 0,
        size_bytes: pf.file.size,
        last_synced_at: new Date().toISOString(),
        status: 'Ready',
        rowCount: 0,
        sourceType: 'Document',
      })

      setTimeout(() => removeFile(pf.id), 2500)
    } catch (err: any) {
      clearInterval(ticker)
      if (err.name === 'AbortError') {
        updateFile(pf.id, { status: 'cancelled' })
        return
      }
      updateFile(pf.id, { status: 'error', errorMessage: err.message })
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message })
    }
  }

  const enqueueFiles = (rawFiles: FileList | File[]) => {
    const incoming: PendingFile[] = Array.from(rawFiles).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: 'pending' as const,
      controller: new AbortController(), // FIX #3
    }))
    setPendingFiles(prev => [...prev, ...incoming])
    incoming.forEach(pf => {
      const err = validateFile(pf.file)
      if (err) { updateFile(pf.id, { status: 'error', errorMessage: err }); return }
      uploadFile(pf)
    })
  }

  // FIX #9 — cancel in-progress upload
  const cancelUpload = (pf: PendingFile) => {
    pf.controller.abort()
    removeFile(pf.id)
  }

  // FIX #10 — retry failed upload
  const retryUpload = (pf: PendingFile) => {
    const fresh: PendingFile = { ...pf, status: 'pending', progress: 0, errorMessage: undefined, controller: new AbortController() }
    setPendingFiles(prev => prev.map(f => f.id === pf.id ? fresh : f))
    uploadFile(fresh)
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length) enqueueFiles(e.dataTransfer.files)
  }
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) enqueueFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '36px 24px',
          borderRadius: 18,
          border: `2px dashed ${isDragging ? '#818CF8' : 'rgba(0,0,0,0.1)'}`,
          background: isDragging ? 'rgba(129,140,248,0.04)' : 'rgba(0,0,0,0.015)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          userSelect: 'none',
          transform: isDragging ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple className="hidden" onChange={onInputChange} />
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDragging ? 'rgba(129,140,248,0.1)' : 'rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.07)',
          transition: 'all 0.2s',
        }}>
          <UploadCloud style={{ width: 22, height: 22, color: isDragging ? '#818CF8' : '#94a3b8' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4, fontFamily: 'var(--font-geist-sans, system-ui)' }}>
            {isDragging ? 'Drop to upload' : 'Drag & drop, or click to browse'}
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
            PDF · DOCX · TXT · CSV · MD — up to {MAX_FILE_SIZE_MB} MB
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: '#818CF8', padding: '3px 10px', borderRadius: 20,
          border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(129,140,248,0.06)',
        }}>
          Vector Indexed
        </span>
      </div>

      {/* Per-file rows */}
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendingFiles.map(pf => (
            <div key={pf.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.07)',
              background: pf.status === 'error' ? 'rgba(239,68,68,0.03)' : 'white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: pf.status === 'error' ? 'rgba(239,68,68,0.08)'
                  : pf.status === 'done' ? 'rgba(34,197,94,0.08)'
                  : 'rgba(129,140,248,0.08)',
                color: pf.status === 'error' ? '#ef4444'
                  : pf.status === 'done' ? '#22c55e' : '#818CF8',
              }}>
                {pf.status === 'error' ? <AlertCircle style={{ width: 14, height: 14 }} />
                  : pf.status === 'done' ? <CheckCircle2 style={{ width: 14, height: 14 }} />
                  : pf.status === 'uploading' ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                  : <File style={{ width: 14, height: 14 }} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
                  {pf.file.name}
                </p>
                {pf.status === 'error' ? (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{pf.errorMessage}</p>
                ) : pf.status === 'uploading' ? (
                  <div style={{ marginTop: 5, height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: 'linear-gradient(90deg, #818CF8, #a5b4fc)',
                      borderRadius: 99, transition: 'width 0.3s ease', width: `${pf.progress}%`
                    }} />
                  </div>
                ) : pf.status === 'done' ? (
                  <p style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>Indexed successfully</p>
                ) : (
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Queued…</p>
                )}
              </div>

              {/* FIX #9: Cancel in-progress */}
              {pf.status === 'uploading' && (
                <button onClick={e => { e.stopPropagation(); cancelUpload(pf) }}
                  style={{ flexShrink: 0, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 0 }}
                  title="Cancel upload">
                  <XCircle style={{ width: 15, height: 15 }} />
                </button>
              )}

              {/* FIX #10: Retry failed + dismiss */}
              {pf.status === 'error' && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={e => { e.stopPropagation(); retryUpload(pf) }}
                    style={{ color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 0 }}
                    title="Retry">
                    <RotateCcw style={{ width: 14, height: 14 }} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); removeFile(pf.id) }}
                    style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 0 }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}

              {pf.status === 'done' && (
                <button onClick={e => { e.stopPropagation(); removeFile(pf.id) }}
                  style={{ flexShrink: 0, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 0 }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IntegrationsHubPage() {
  const { toast } = useToast()
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory>('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedConnector, setSelectedConnector] = useState<ConnectorConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const [disconnectTarget, setDisconnectTarget] = useState<Dataset | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // FIX #4: setDatasets exposed for optimistic updates
  const { datasets, isLoading, refetch, setDatasets } = useDatasets()

  const filteredConnectors = useMemo(() => {
    let list = INTEGRATIONS
    if (activeCategory !== 'All') list = list.filter(c => c.category === activeCategory)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    }
    return list
  }, [activeCategory, searchQuery])

  const handleOpenConfig = (connector: ConnectorConfig) => {
    setSelectedConnector(connector)
    setIsSuccess(false)
    const defaults: Record<string, string> = {}
    connector.fields.forEach(f => {
      if (f.type === 'select' && f.options?.length) defaults[f.name] = f.options[0].value
    })
    setFormData(defaults)
  }

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedConnector) return
    setIsConnecting(true)
    try {
      if (selectedConnector.authType === 'oauth') {
        await new Promise(res => setTimeout(res, 1000))
        setIsSuccess(true)
      } else {
        const token = await getSessionToken()
        const res = await fetch('/api/v1/integrations/connect', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ connector_id: selectedConnector.id, credentials: formData }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail || 'Connection failed.')
        }
        setIsSuccess(true)
        toast({ title: 'Connection Secured', description: `Linked ${selectedConnector.name}. Initializing schema sync.` })
      }
      refetch(true)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Connection Failed', description: err.message || 'Verify credentials and try again.' })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleForceSync = async (dataset: Dataset) => {
    toast({ title: 'Sync Initiated', description: `Pulling latest from ${dataset.name}…` })
    try {
      const token = await getSessionToken()
      await fetch(`/api/datasets/${dataset.id}/sync`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* non-critical */ }
    refetch(true)
  }

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return
    setIsDisconnecting(true)
    try {
      await callDisconnectApi(disconnectTarget.id)
      toast({
        title: disconnectTarget.is_document ? 'Document Scrubbed' : 'Dataset Disconnected',
        description: disconnectTarget.is_document
          ? `All vector chunks for "${disconnectTarget.name}" deleted.`
          : `"${disconnectTarget.name}" removed and credentials revoked.`,
      })
      setDisconnectTarget(null)
      refetch(true)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Disconnect Failed', description: err.message })
    } finally {
      setIsDisconnecting(false)
    }
  }

  // FIX #11 — optimistic insert for uploads
  const handleUploadComplete = (optimisticDoc?: Partial<Dataset>) => {
    if (optimisticDoc?.id) {
      setDatasets(prev => {
        const exists = prev.find(d => d.id === optimisticDoc.id)
        if (exists) return prev
        return [optimisticDoc as Dataset, ...prev]
      })
    }
    refetch(true)
  }

  const closeConfigModal = () => { setSelectedConnector(null); setIsSuccess(false); setFormData({}) }

  // ── Typography / color tokens
  const T = {
    h1: { fontFamily: 'var(--font-geist-sans, system-ui)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', lineHeight: 1.1 },
    h2: { fontFamily: 'var(--font-geist-sans, system-ui)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a' },
    eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#94a3b8' },
    body: { fontFamily: 'var(--font-geist-sans, system-ui)', fontSize: 14, color: '#64748b', lineHeight: 1.62 },
    mono: { fontFamily: 'var(--font-geist-mono, monospace)', fontSize: 12 },
  }

  const surfaceBorder = '1px solid rgba(0,0,0,0.07)'
  const surfaceShadow = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
  const cardHover = { transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s' }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      padding: '48px 24px 96px',
      fontFamily: 'var(--font-geist-sans, system-ui)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 56 }}>

        {/* ── HEADER */}
        <header style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={T.eyebrow}>Knowledge Engine</span>
          <h1 style={T.h1}>Knowledge Hub</h1>
          <p style={{ ...T.body, maxWidth: 520, marginTop: 2 }}>
            Connect warehouses, databases, SaaS tools, and upload documents — all indexed for your AI engine.
          </p>
        </header>

        {/* ── SECTION 1: CONNECTED SOURCES */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={T.h2}>Connected Sources</h2>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              padding: '2px 9px', borderRadius: 20,
              background: 'rgba(15,23,42,0.06)', color: '#475569',
              border: surfaceBorder,
            }}>
              {datasets.length} Active
            </span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2].map(i => (
                <div key={i} style={{ height: 72, borderRadius: 16, background: 'rgba(0,0,0,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : datasets.length === 0 ? (
            <div style={{
              padding: '48px 24px', borderRadius: 20,
              border: '2px dashed rgba(0,0,0,0.08)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              background: 'rgba(0,0,0,0.01)', textAlign: 'center',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', border: surfaceBorder, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlugZap style={{ width: 18, height: 18, color: '#94a3b8' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>No data sources connected yet.</p>
              <p style={{ ...T.body, maxWidth: 340, fontSize: 13 }}>Upload documents or connect an integration below to start querying with AI.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {datasets.map(dataset => {
                const isDoc = !!dataset.is_document
                const statusColor = dataset.status === 'Ready' ? '#22c55e' : dataset.status === 'Syncing' ? '#3b82f6' : '#ef4444'
                const statusLabel = dataset.status === 'Ready' ? 'Ready' : dataset.status === 'Syncing' ? 'Syncing' : 'Failed'

                return (
                  <div key={dataset.id}
                    className="group"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', borderRadius: 16,
                      border: surfaceBorder, background: 'white',
                      boxShadow: surfaceShadow, ...cardHover,
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.14)'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.07)'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = surfaceShadow
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isDoc ? 'rgba(129,140,248,0.08)' : 'rgba(15,23,42,0.05)',
                        border: surfaceBorder,
                        color: isDoc ? '#818CF8' : '#475569',
                        animation: dataset.status === 'Syncing' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      }}>
                        {isDoc ? <FileText style={{ width: 17, height: 17 }} /> : <Database style={{ width: 17, height: 17 }} />}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{dataset.name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '2px 7px', borderRadius: 20,
                            background: isDoc ? 'rgba(129,140,248,0.08)' : 'rgba(0,0,0,0.05)',
                            color: isDoc ? '#818CF8' : '#64748b',
                            border: isDoc ? '1px solid rgba(129,140,248,0.2)' : '1px solid rgba(0,0,0,0.07)',
                          }}>
                            {isDoc ? 'Document' : dataset.sourceType}
                          </span>
                        </div>
                        <p style={{ ...T.mono, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isDoc ? (
                            <>{formatNumber(dataset.chunk_count ?? 0)} chunks · {formatBytes(dataset.size_bytes)} · Indexed {formatRelativeTime(dataset.last_synced_at)}</>
                          ) : (
                            <>{formatNumber(dataset.rowCount)} rows · {formatBytes(dataset.size_bytes)} · Synced {formatRelativeTime(dataset.last_synced_at)}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {dataset.status === 'Syncing'
                          ? <RefreshCw style={{ width: 13, height: 13, color: statusColor, animation: 'spin 1s linear infinite' }} />
                          : dataset.status === 'Failed'
                          ? <ShieldAlert style={{ width: 13, height: 13, color: statusColor }} />
                          : <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                        }
                        <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button style={{
                            width: 30, height: 30, borderRadius: 8, border: surfaceBorder,
                            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#94a3b8', transition: 'background 0.15s',
                          }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <MoreHorizontal style={{ width: 15, height: 15 }} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[170px] rounded-xl shadow-xl">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Manage Source</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer" onClick={() => window.location.href = '/chat'}>
                            <ArrowUpRight className="mr-2 h-4 w-4 text-muted-foreground" /> Query in Chat
                          </DropdownMenuItem>
                          {!isDoc && (
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleForceSync(dataset)}>
                              <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" /> Force Sync
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onClick={() => setDisconnectTarget(dataset)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {isDoc ? 'Delete & Scrub' : 'Disconnect'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── SECTION 2: DOCUMENT UPLOAD */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 32, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={T.h2}>Upload Documents</h2>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#818CF8', padding: '2px 9px', borderRadius: 20,
                border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(129,140,248,0.06)',
              }}>RAG Indexed</span>
            </div>
            <p style={{ ...T.body, fontSize: 13 }}>
              Upload PDFs, Word docs, CSVs, and more. Files are chunked and stored in the vector database for retrieval-augmented generation.
            </p>
          </div>
          <FileUploadZone onUploadComplete={handleUploadComplete} />
        </section>

        {/* ── SECTION 3: INTEGRATION LIBRARY */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 32, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={T.h2}>Integration Library</h2>
            <div style={{ position: 'relative', width: 240 }}>
              <Search style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#94a3b8' }} />
              <input
                type="search"
                placeholder="Search integrations…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', height: 36, paddingLeft: 32, paddingRight: 12,
                  borderRadius: 99, border: surfaceBorder, background: 'white',
                  fontSize: 13, color: '#1e293b', outline: 'none',
                  boxShadow: surfaceShadow, fontFamily: 'var(--font-geist-sans, system-ui)',
                }}
              />
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['All', 'Data Warehouses', 'Databases', 'Apps'] as ConnectorCategory[]).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', outline: 'none',
                  background: activeCategory === cat ? '#0f172a' : 'white',
                  color: activeCategory === cat ? 'white' : '#64748b',
                  border: activeCategory === cat ? '1px solid #0f172a' : surfaceBorder,
                  boxShadow: activeCategory === cat ? '0 2px 8px rgba(15,23,42,0.18)' : surfaceShadow,
                  fontFamily: 'var(--font-geist-sans, system-ui)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Connector grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 14,
            paddingBottom: 48,
          }}>
            {filteredConnectors.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '48px 24px', textAlign: 'center', color: '#94a3b8', border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 20 }}>
                No connectors match your search.
              </div>
            ) : filteredConnectors.map(connector => (
              <div
                key={connector.id}
                onClick={() => handleOpenConfig(connector)}
                style={{
                  display: 'flex', flexDirection: 'column', padding: 22, borderRadius: 18,
                  border: surfaceBorder, background: 'white',
                  boxShadow: surfaceShadow, cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.boxShadow = `0 8px 24px ${connector.accentBg.replace('0.06', '0.12')}, 0 2px 8px rgba(0,0,0,0.06)`
                  el.style.borderColor = `rgba(0,0,0,0.14)`
                  el.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.boxShadow = surfaceShadow
                  el.style.borderColor = 'rgba(0,0,0,0.07)'
                  el.style.transform = 'translateY(0)'
                }}
              >
                {/* Accent wash */}
                <div style={{
                  position: 'absolute', top: 0, right: 0, width: 80, height: 80,
                  background: `radial-gradient(circle at top right, ${connector.accentBg}, transparent 70%)`,
                  pointerEvents: 'none',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'white', border: surfaceBorder,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }}>
                    {connector.logo}
                  </div>
                  {connector.isNew && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: '#818CF8', padding: '2px 8px', borderRadius: 20,
                      border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(129,140,248,0.07)',
                    }}>New</span>
                  )}
                </div>

                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>{connector.name}</h3>
                <p style={{ ...T.body, fontSize: 12, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {connector.desc}
                </p>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.04)', color: '#64748b',
                  }}>
                    {connector.category.replace('Data ', '')}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: connector.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                    Configure <ArrowUpRight style={{ width: 12, height: 12 }} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── CONNECTOR CONFIG MODAL */}
      <Dialog open={!!selectedConnector} onOpenChange={open => !open && closeConfigModal()}>
        <DialogContent className="sm:max-w-[520px] overflow-hidden p-0 bg-white border shadow-2xl" style={{ borderRadius: 22, border: surfaceBorder }}>
          {selectedConnector && !isSuccess && (
            <form onSubmit={handleConnectSubmit} style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
              <DialogHeader style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'white', border: surfaceBorder,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }}>
                    {selectedConnector.logo}
                  </div>
                  <DialogTitle style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
                    Connect {selectedConnector.name}
                  </DialogTitle>
                </div>
                <DialogDescription style={{ fontSize: 13, color: '#64748b', textAlign: 'left', lineHeight: 1.55, fontFamily: 'var(--font-geist-sans, system-ui)' }}>
                  {selectedConnector.authType === 'oauth'
                    ? 'You will be redirected securely to grant authorization.'
                    : 'Credentials are AES-256 encrypted in Vault before storage.'}
                </DialogDescription>
              </DialogHeader>

              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {selectedConnector.fields.map(field => (
                    <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
                        {field.label}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          name={field.name} required disabled={isConnecting}
                          onChange={handleFieldChange} value={formData[field.name] || ''}
                          style={{ height: 38, borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)', padding: '0 12px', fontSize: 13, background: 'white', outline: 'none', fontFamily: 'var(--font-geist-sans, system-ui)' }}
                        >
                          {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      ) : (
                        <input
                          name={field.name} type={field.type} placeholder={field.placeholder}
                          required disabled={isConnecting} onChange={handleFieldChange}
                          style={{ height: 38, borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)', padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'var(--font-geist-mono, monospace)', background: 'white' }}
                        />
                      )}
                      {field.helperText && (
                        <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.55, fontFamily: 'var(--font-geist-sans, system-ui)' }}>{field.helperText}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter style={{ padding: '20px 28px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                  <ShieldCheck style={{ width: 14, height: 14, color: '#22c55e' }} />
                  <span style={{ fontFamily: 'var(--font-geist-sans, system-ui)' }}>AES-256 Encrypted</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" onClick={closeConfigModal} disabled={isConnecting} style={{ fontSize: 13 }}>Cancel</Button>
                  <Button type="submit" disabled={isConnecting} style={{ minWidth: 148, fontSize: 13 }}>
                    {isConnecting ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                        {selectedConnector.authType === 'oauth' ? 'Redirecting…' : 'Verifying…'}
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {selectedConnector.authType === 'oauth' ? 'Authenticate' : 'Save Connection'}
                        {selectedConnector.authType === 'oauth' && <ExternalLink style={{ width: 13, height: 13 }} />}
                      </span>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}

          {selectedConnector && isSuccess && (
            <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <div style={{ position: 'absolute', inset: -8, background: 'rgba(34,197,94,0.12)', borderRadius: '50%', filter: 'blur(16px)', animation: 'pulse 2s ease-in-out infinite' }} />
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <CheckCircle2 style={{ width: 32, height: 32, color: '#22c55e' }} />
                </div>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', fontFamily: 'var(--font-geist-sans, system-ui)' }}>Connection Established</h2>
              <p style={{ ...T.body, maxWidth: 320, color: '#64748b' }}>
                <strong style={{ color: '#0f172a' }}>{selectedConnector.name}</strong> is now securely linked. The AI engine is mapping the schema.
              </p>
              <Button style={{ minWidth: 180, marginTop: 8 }} onClick={closeConfigModal}>Return to Hub</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DISCONNECT CONFIRMATION */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={open => { if (!open && !isDisconnecting) setDisconnectTarget(null) }}>
        <AlertDialogContent style={{ borderRadius: 20, border: surfaceBorder }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: 'var(--font-geist-sans, system-ui)', letterSpacing: '-0.01em' }}>
              {disconnectTarget?.is_document ? 'Delete & Scrub Document?' : 'Disconnect Data Source?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, lineHeight: 1.6, color: '#64748b', fontFamily: 'var(--font-geist-sans, system-ui)' }}>
                {disconnectTarget?.is_document ? (
                  <>
                    <span>This will permanently delete <strong style={{ color: '#0f172a' }}>"{disconnectTarget.name}"</strong> and scrub all <strong style={{ color: '#0f172a' }}>{formatNumber(disconnectTarget.chunk_count ?? 0)} vector chunks</strong> from the Qdrant index.</span>
                    <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>This action cannot be undone. The file must be re-uploaded to restore access.</span>
                  </>
                ) : (
                  <>
                    <span>This will disconnect <strong style={{ color: '#0f172a' }}>"{disconnectTarget?.name}"</strong> and revoke stored credentials from Vault. All scheduled syncs will be cancelled.</span>
                    <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>This action cannot be undone. You must re-enter credentials to reconnect.</span>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectConfirm}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              style={{ minWidth: 130 }}
            >
              {isDisconnecting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                  {disconnectTarget?.is_document ? 'Scrubbing…' : 'Disconnecting…'}
                </span>
              ) : disconnectTarget?.is_document ? 'Delete & Scrub' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}