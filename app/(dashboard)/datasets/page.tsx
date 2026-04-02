'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { 
  Search, 
  Database, 
  MoreHorizontal, 
  RefreshCw,
  ArrowUpRight,
  Snowflake,
  ShieldAlert,
  Cloud,
  Box,
  Layers,
  Trash2,
  CheckCircle2,
  CreditCard,
  ShoppingBag,
  Binary,
  Loader2,
  ExternalLink,
  ShieldCheck,
  PlugZap,
  FileText,
  UploadCloud,
  X,
  File,
  AlertCircle,
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

// -----------------------------------------------------------------------------
// Types & Backend-Aligned Schemas
// -----------------------------------------------------------------------------

/**
 * IMPROVEMENT 1: Extended Dataset interface to support both structured data
 * sources (databases/warehouses) AND unstructured document assets.
 *
 * - `is_document`: when true, this record represents an indexed file (PDF, DOCX, etc.)
 * rather than a live database connection.
 * - `chunk_count`: for document assets, the number of vector chunks stored in Qdrant.
 * Displayed in place of `rowCount` when `is_document` is true.
 */
interface Dataset {
  id: string;
  name: string;
  sourceType: string;
  rowCount: number;
  size: string;
  lastSynced: string;
  status: 'Ready' | 'Syncing' | 'Failed';
  // --- NEW: document-specific fields ---
  is_document?: boolean;
  chunk_count?: number;
}

type ConnectorCategory = 'All' | 'Data Warehouses' | 'Databases' | 'Apps';
type AuthParadigm = 'credentials' | 'oauth';

interface IntegrationField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  helperText?: string;
  options?: { label: string; value: string }[];
}

interface ConnectorConfig {
  id: string; 
  name: string;
  category: ConnectorCategory;
  authType: AuthParadigm;
  desc: string;
  icon: React.ReactNode;
  color: string;
  isNew?: boolean;
  fields: IntegrationField[];
}

// Pending upload file state (used by FileUploadZone)
interface PendingFile {
  id: string;
  file: File;
  progress: number; // 0–100
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

// -----------------------------------------------------------------------------
// Authoritative Integration Library
// -----------------------------------------------------------------------------
const INTEGRATIONS: ConnectorConfig[] = [
  // Data Warehouses
  { 
    id: "snowflake", name: "Snowflake", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your enterprise cloud data warehouse natively.", icon: <Snowflake className="w-6 h-6" />, color: "text-sky-600 bg-sky-50 border border-sky-100",
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
    desc: "Connect your Google BigQuery datasets for instant analysis.", icon: <Cloud className="w-6 h-6" />, color: "text-blue-600 bg-blue-50 border border-blue-100",
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project-123' },
      { name: 'dataset_id', label: 'Dataset ID', type: 'text', placeholder: 'analytics_production' },
      { name: 'service_account', label: 'Service Account JSON', type: 'password', placeholder: '{"type": "service_account", ...}', helperText: 'Paste the entire contents of your Service Account JSON key file.' },
    ]
  },
  { 
    id: "redshift", name: "Redshift", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your AWS Redshift clusters.", icon: <Layers className="w-6 h-6" />, color: "text-orange-600 bg-orange-50 border border-orange-100",
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'cluster.redshift.amazonaws.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5439' },
      { name: 'database', label: 'Database', type: 'text', placeholder: 'dev' },
      { name: 'user', label: 'Username', type: 'text' },
      { name: 'password', label: 'Password', type: 'password' },
    ]
  },

  // Databases
  { 
    id: "postgres", name: "PostgreSQL", category: "Databases", authType: 'credentials',
    desc: "Connect your Postgres analytical replica.", icon: <Database className="w-6 h-6" />, color: "text-blue-600 bg-blue-50 border border-blue-100",
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
    desc: "Connect to local or cloud-hosted DuckDB files.", icon: <Binary className="w-6 h-6" />, color: "text-yellow-600 bg-yellow-50 border border-yellow-100",
    fields: [
      { name: 'database_path', label: 'Database Path', type: 'text', placeholder: 's3://bucket/data.duckdb', helperText: 'Provide the S3 URI or mounted volume path.' },
    ]
  },

  // SaaS Apps
  { 
    id: "stripe", name: "Stripe", category: "Apps", authType: 'credentials',
    desc: "Live connection to your billing and subscription data.", icon: <CreditCard className="w-6 h-6" />, color: "text-indigo-600 bg-indigo-50 border border-indigo-100",
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_...', helperText: 'Requires read-only access to Customers, Subscriptions, and Invoices.' },
    ]
  },
  { 
    id: "salesforce", name: "Salesforce", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM leads, opportunities, and accounts.", icon: <Cloud className="w-6 h-6" />, color: "text-blue-600 bg-blue-50 border border-blue-100",
    fields: [
      { name: 'environment', label: 'Environment', type: 'select', options: [{ label: 'Production', value: 'login' }, { label: 'Sandbox', value: 'test' }] },
    ]
  },
  { 
    id: "hubspot", name: "HubSpot", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM contacts, deals, and pipelines.", icon: <Box className="w-6 h-6" />, color: "text-orange-600 bg-orange-50 border border-orange-100",
    fields: [
      { name: 'portal_id', label: 'Portal ID (Optional)', type: 'text', placeholder: '12345678' },
    ]
  },
  { 
    id: "shopify", name: "Shopify", category: "Apps", authType: 'oauth',
    desc: "Live connection to your e-commerce orders and customers.", icon: <ShoppingBag className="w-6 h-6" />, color: "text-emerald-600 bg-emerald-50 border border-emerald-100",
    fields: [
      { name: 'shop_url', label: 'Shop Domain', type: 'text', placeholder: 'my-store.myshopify.com' },
    ]
  },
  { 
    id: "zendesk", name: "Zendesk", category: "Apps", authType: 'credentials',
    desc: "Analyze your customer support tickets and resolution times.", icon: <Layers className="w-6 h-6" />, color: "text-teal-600 bg-teal-50 border border-teal-100",
    fields: [
      { name: 'subdomain', label: 'Zendesk Subdomain', type: 'text', placeholder: 'company' },
      { name: 'email', label: 'Admin Email', type: 'text', placeholder: 'admin@company.com' },
      { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••' },
    ]
  },
  { 
    id: "google_ads", name: "Google Ads", category: "Apps", authType: 'credentials', isNew: true,
    desc: "Analyze your campaign performance and ad spend.", icon: <Box className="w-6 h-6" />, color: "text-amber-600 bg-amber-50 border border-amber-100",
    fields: [
      { name: 'developer_token', label: 'Developer Token', type: 'password' },
      { name: 'client_id', label: 'OAuth Client ID', type: 'text' },
      { name: 'client_secret', label: 'OAuth Client Secret', type: 'password' },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password' },
    ]
  },
  { 
    id: "meta_ads", name: "Meta Ads", category: "Apps", authType: 'credentials', isNew: true,
    desc: "Analyze your Facebook and Instagram ad campaigns.", icon: <Box className="w-6 h-6" />, color: "text-blue-600 bg-blue-50 border border-blue-100",
    fields: [
      { name: 'access_token', label: 'System User Access Token', type: 'password' },
      { name: 'ad_account_id', label: 'Ad Account ID', type: 'text', placeholder: 'act_123456789' },
    ]
  },
];
// Accepted file MIME types and extensions
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'text/markdown',
];
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.csv,.md';
const MAX_FILE_SIZE_MB = 50;

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

// -----------------------------------------------------------------------------
// Utility: get a Supabase session token (shared across handlers)
// -----------------------------------------------------------------------------
async function getSessionToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Authentication required.");
  return session.access_token;
}

// -----------------------------------------------------------------------------
// Data Fetching Hook (With Smart Polling)
// -----------------------------------------------------------------------------
const useDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDatasets = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const token = await getSessionToken();
      const response = await fetch('/api/v1/datasets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 404) { setDatasets([]); return; }
        throw new Error("Unable to reach the synchronization engine.");
      }
      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err: any) {
      console.warn("Dataset retrieval caught:", err.message);
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  // Smart Polling: only active when something is syncing
  useEffect(() => {
    const isSyncing = datasets.some(d => d.status === 'Syncing');
    let interval: NodeJS.Timeout;
    if (isSyncing) {
      interval = setInterval(() => fetchDatasets(true), 5000);
    }
    return () => clearInterval(interval);
  }, [datasets, fetchDatasets]);

  return { datasets, isLoading, refetch: fetchDatasets };
};

// -----------------------------------------------------------------------------
// IMPROVEMENT 3: FileUploadZone Component
// Handles drag-and-drop + click-to-browse file uploads with per-file progress.
// Calls POST /api/v1/documents/upload which ingests the file, chunks it, and
// indexes it into the Qdrant vector store. On success, the new document asset
// appears in the "Connected Sources" list with is_document: true.
// -----------------------------------------------------------------------------
interface FileUploadZoneProps {
  onUploadComplete: () => void;
}

function FileUploadZone({ onUploadComplete }: FileUploadZoneProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const updateFile = (id: string, patch: Partial<PendingFile>) =>
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const removeFile = (id: string) =>
    setPendingFiles(prev => prev.filter(f => f.id !== id));

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type || 'unknown'}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File exceeds ${MAX_FILE_SIZE_MB} MB limit.`;
    }
    return null;
  };

  const enqueueFiles = (rawFiles: FileList | File[]) => {
    const incoming: PendingFile[] = Array.from(rawFiles).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setPendingFiles(prev => [...prev, ...incoming]);

    // Fire off uploads immediately for each valid file
    incoming.forEach(pf => {
      const validationError = validateFile(pf.file);
      if (validationError) {
        updateFile(pf.id, { status: 'error', errorMessage: validationError });
        return;
      }
      uploadFile(pf);
    });
  };

  const uploadFile = async (pf: PendingFile) => {
    updateFile(pf.id, { status: 'uploading', progress: 5 });

    try {
      const token = await getSessionToken();

      // Simulate chunked upload progress before the actual request resolves.
      // Replace the interval with XHR if you need real byte-level progress.
      const progressInterval = setInterval(() => {
        updateFile(pf.id, { 
          progress: Math.min(85, (Math.random() * 15) + 0) 
        });
      }, 400);
      // Accumulate so it feels alive
      let fakeProgress = 5;
      const ticker = setInterval(() => {
        fakeProgress = Math.min(85, fakeProgress + Math.random() * 12);
        updateFile(pf.id, { progress: Math.floor(fakeProgress) });
      }, 350);

      const formData = new FormData();
      formData.append('file', pf.file);

      const response = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      clearInterval(progressInterval);
      clearInterval(ticker);

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || `Upload failed (${response.status})`);
      }

      updateFile(pf.id, { status: 'done', progress: 100 });

      toast({
        title: "Document Indexed",
        description: `"${pf.file.name}" has been chunked and stored in the vector database.`,
      });

      // Trigger a silent refetch so the new document appears in Connected Sources
      onUploadComplete();

      // Clean up the done entry after a short delay
      setTimeout(() => removeFile(pf.id), 3000);

    } catch (err: any) {
      updateFile(pf.id, { status: 'error', errorMessage: err.message });
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: err.message,
      });
    }
  };

  // Drag handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) enqueueFiles(e.dataTransfer.files);
  };
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) enqueueFiles(e.target.files);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3 
          rounded-2xl border-2 border-dashed p-8 text-center 
          cursor-pointer transition-all duration-200 select-none
          ${isDragging 
            ? 'border-primary bg-primary/5 scale-[1.01]' 
            : 'border-border bg-muted/10 hover:bg-muted/20 hover:border-primary/40'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={onInputChange}
        />
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-primary/10' : 'bg-muted'} border border-border`}>
          <UploadCloud className={`w-6 h-6 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <p className="font-semibold text-foreground text-sm">
            {isDragging ? 'Drop files to upload' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, DOCX, TXT, CSV, MD — up to {MAX_FILE_SIZE_MB} MB each
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-purple-500/10 border-purple-500/30 text-purple-600">
          Vector Indexed
        </Badge>
      </div>

      {/* Per-file upload rows */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          {pendingFiles.map(pf => (
            <div key={pf.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                pf.status === 'error' ? 'bg-destructive/10 text-destructive' :
                pf.status === 'done'  ? 'bg-emerald-500/10 text-emerald-500' :
                'bg-purple-500/10 text-purple-500'
              }`}>
                {pf.status === 'error'   ? <AlertCircle className="w-4 h-4" /> :
                 pf.status === 'done'    ? <CheckCircle2 className="w-4 h-4" /> :
                 pf.status === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 <File className="w-4 h-4" />
                }
              </div>

              {/* Name + Progress */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pf.file.name}</p>
                {pf.status === 'error' ? (
                  <p className="text-xs text-destructive mt-0.5">{pf.errorMessage}</p>
                ) : pf.status === 'uploading' ? (
                  <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${pf.progress}%` }} 
                    />
                  </div>
                ) : pf.status === 'done' ? (
                  <p className="text-xs text-emerald-600 mt-0.5">Indexed successfully</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Queued…</p>
                )}
              </div>

              {/* Dismiss */}
              {(pf.status === 'done' || pf.status === 'error') && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(pf.id); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// IMPROVEMENT 2 Helper: Wired Disconnect — calls backend which scrubs Qdrant
// -----------------------------------------------------------------------------
/**
 * Calls DELETE /api/v1/datasets/:id on the backend.
 *
 * For document assets (is_document === true), the backend MUST invoke:
 *   await vector_service.delete_asset_index(tenant_id, asset_id)
 * This permanently removes all vector chunks from the Qdrant collection
 * scoped to that tenant/asset before deleting the metadata record.
 *
 * For structured data sources (databases, SaaS), the backend tears down
 * the connection and revokes any stored credentials from Vault.
 */
async function callDisconnectApi(datasetId: string): Promise<void> {
  const token = await getSessionToken();

  const response = await fetch(`/api/v1/datasets/${datasetId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to disconnect (${response.status})`);
  }
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function IntegrationsHubPage() {
  const { toast } = useToast()
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory>('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Connector config modal
  const [selectedConnector, setSelectedConnector] = useState<ConnectorConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // IMPROVEMENT 2: Delete confirmation dialog state
  const [disconnectTarget, setDisconnectTarget] = useState<Dataset | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { datasets, isLoading, refetch } = useDatasets();

  // Filter Connectors Grid
  const filteredConnectors = useMemo(() => {
    let filtered = INTEGRATIONS;
    if (activeCategory !== 'All') filtered = filtered.filter(c => c.category === activeCategory);
    if (searchQuery) {
      const sq = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(sq) || c.id.toLowerCase().includes(sq));
    }
    return filtered;
  }, [activeCategory, searchQuery]);

  // Modal Handlers
  const handleOpenConfig = (connector: ConnectorConfig) => {
    setSelectedConnector(connector);
    setIsSuccess(false);
    const defaults: Record<string, string> = {}
    connector.fields.forEach(f => {
      if (f.type === 'select' && f.options?.length) defaults[f.name] = f.options[0].value;
    });
    setFormData(defaults);
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnector) return;
    setIsConnecting(true);
    try {
      if (selectedConnector.authType === 'oauth') {
        await new Promise(res => setTimeout(res, 1000));
        setIsSuccess(true);
      } else {
        const token = await getSessionToken();
        const response = await fetch('/api/v1/integrations/connect', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ connector_id: selectedConnector.id, credentials: formData }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Connection failed.');
        }
        setIsSuccess(true);
        toast({
          title: "Connection Secured",
          description: `Successfully linked ${selectedConnector.name}. Initializing schema sync.`,
        });
      }
      refetch(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err.message || "Please verify your credentials and try again.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Action: Force Sync
  const handleForceSync = async (dataset: Dataset) => {
    toast({ title: "Sync Initiated", description: `Pulling the latest data from ${dataset.name}…` });
    try {
      const token = await getSessionToken();
      await fetch(`/api/v1/datasets/${dataset.id}/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {
      // Non-critical; the next poll will pick up any state change
    }
    refetch(true);
  };

  // IMPROVEMENT 2: Wired disconnect — shows confirmation, then calls real API
  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    setIsDisconnecting(true);

    try {
      await callDisconnectApi(disconnectTarget.id);

      // Optimistically remove from UI before the refetch
      toast({
        title: disconnectTarget.is_document ? "Document Scrubbed" : "Dataset Disconnected",
        description: disconnectTarget.is_document
          ? `All vector chunks for "${disconnectTarget.name}" have been permanently deleted from the index.`
          : `"${disconnectTarget.name}" has been removed and credentials revoked from Vault.`,
      });

      setDisconnectTarget(null);
      refetch(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Disconnect Failed",
        description: err.message || "Could not reach the server. Please try again.",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const closeConfigModal = () => {
    setSelectedConnector(null);
    setIsSuccess(false);
    setFormData({});
  };

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500 bg-[#fafafa] min-h-screen">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            Knowledge Hub
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Connect data warehouses, databases, SaaS tools, and upload documents — all indexed for your AI engine.
          </p>
        </div>
      </div>

      {/* ── SECTION 1: CONNECTED SOURCES ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Connected Sources
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full px-2.5">
            {datasets.length} Active
          </Badge>
        </h2>

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl bg-muted/50" />)}
          </div>
        ) : datasets.length === 0 ? (
          <div className="w-full border border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-muted/10">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border border-border">
              <PlugZap className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold">No data sources connected yet.</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Upload documents or connect an integration below to start querying with AI.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {datasets.map((dataset) => {
              // IMPROVEMENT 1: Differentiate between document and structured assets
              const isDoc = !!dataset.is_document;

              return (
                <div key={dataset.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/30 transition-colors group">
                  <div className="flex items-center gap-4">
                    {/* IMPROVEMENT 1: Purple FileText icon for documents */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-inner transition-all ${
                      isDoc
                        ? 'bg-purple-500/10 text-purple-500'
                        : dataset.status === 'Syncing'
                          ? 'bg-muted text-blue-500 animate-pulse'
                          : 'bg-muted text-primary'
                    }`}>
                      {isDoc
                        ? <FileText className="w-5 h-5" />
                        : <Database className="w-5 h-5" />
                      }
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{dataset.name}</h3>
                        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider py-0 h-4 border-border ${
                          isDoc
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-600'
                            : 'bg-muted/50'
                        }`}>
                          {isDoc ? 'Document' : dataset.sourceType}
                        </Badge>
                      </div>

                      {/* IMPROVEMENT 1: Show chunk count for documents, row count for databases */}
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        {isDoc ? (
                          <>
                            <span>{formatNumber(dataset.chunk_count ?? 0)} vector chunks</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>{dataset.size}</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>Indexed {dataset.lastSynced}</span>
                          </>
                        ) : (
                          <>
                            <span>{formatNumber(dataset.rowCount)} rows</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>{dataset.size}</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>Synced {dataset.lastSynced}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="items-center gap-1.5 hidden md:flex">
                      {dataset.status === 'Ready' ? (
                        <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-xs font-medium text-emerald-600">Ready</span></>
                      ) : dataset.status === 'Syncing' ? (
                        <><RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-xs font-medium text-blue-600">Syncing...</span></>
                      ) : (
                        <><ShieldAlert className="w-4 h-4 text-destructive" /><span className="text-xs font-medium text-destructive">Failed</span></>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:bg-muted">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[170px] rounded-xl shadow-xl">
                        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Manage Source</DropdownMenuLabel>
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
                        {/* IMPROVEMENT 2: Opens confirmation dialog instead of acting immediately */}
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
              );
            })}
          </div>
        )}
      </section>

      {/* ── SECTION 2: FILE UPLOAD ZONE (IMPROVEMENT 3) ── */}
      {/*
       * Placed above the Integration Library so users have one unified screen
       * for all knowledge ingestion — both structured (connectors) and
       * unstructured (documents).
       */}
      <section className="space-y-4 pt-4 border-t border-border/50">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Upload Documents
            <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-purple-500/10 border-purple-500/20 text-purple-600">
              RAG Indexed
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload PDFs, Word docs, CSVs, and more. Files are chunked and stored in the vector database for retrieval-augmented generation.
          </p>
        </div>
        <FileUploadZone onUploadComplete={() => refetch(true)} />
      </section>

      {/* ── SECTION 3: CONNECTOR LIBRARY ── */}
      <section className="space-y-6 pt-4 border-t border-border/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Integration Library</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search integrations..."
              className="pl-9 bg-background rounded-full focus-visible:ring-primary/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {(['All', 'Data Warehouses', 'Databases', 'Apps'] as ConnectorCategory[]).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 border ${
                 activeCategory === category
                   ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50 hover:text-slate-900 shadow-sm'
             }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Connector Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
          {filteredConnectors.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-2xl">
              No connectors found matching your search.
            </div>
          ) : (
            filteredConnectors.map(connector => (
              <div
                key={connector.id}
                onClick={() => handleOpenConfig(connector)}
                className="group flex flex-col p-6 rounded-2xl border border-gray-200/80 bg-white hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer shadow-sm h-full relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[100px] -z-0 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-background border shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform ${connector.color}`}>
                      {connector.icon}
                    </div>
                    {connector.isNew && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase tracking-wider">
                        New
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-bold text-base text-foreground mb-1">{connector.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{connector.desc}</p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-4">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest bg-muted px-2 py-0.5 rounded-md">
                      {connector.category.replace('Data ', '')}
                    </span>
                    <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                      Configure <ArrowUpRight className="w-3 h-3 ml-1" />
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── UNIFIED CONFIGURATION MODAL ── */}
      <Dialog open={!!selectedConnector} onOpenChange={(open) => !open && closeConfigModal()}>
        <DialogContent className="sm:max-w-[550px] overflow-hidden p-0 bg-background border-border shadow-xl">
          {selectedConnector && !isSuccess && (
            <form onSubmit={handleConnectSubmit} className="flex flex-col max-h-[85vh] animate-in fade-in slide-in-from-right-4 duration-300">
              <DialogHeader className="p-6 pb-4 border-b bg-muted/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-md bg-background shadow-sm border ${selectedConnector.color}`}>
                    {selectedConnector.icon}
                  </div>
                  <DialogTitle className="text-xl font-bold">
                    Connect {selectedConnector.name}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-left text-sm pt-1">
                  {selectedConnector.authType === 'oauth'
                    ? "You will be redirected securely to grant authorization."
                    : "Enter your credentials. Keys are encrypted in Vault prior to storage."}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-5">
                  {selectedConnector.fields.map((field) => (
                    <div key={field.name} className="space-y-2">
                      <Label htmlFor={field.name} className="text-foreground font-medium">
                        {field.label}
                      </Label>

                      {field.type === 'select' ? (
                        <select
                          id={field.name}
                          name={field.name}
                          required
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                          onChange={handleFieldChange}
                          disabled={isConnecting}
                          value={formData[field.name] || ''}
                        >
                          {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id={field.name}
                          name={field.name}
                          type={field.type}
                          placeholder={field.placeholder}
                          required
                          className="bg-background border-border focus-visible:ring-primary/50"
                          onChange={handleFieldChange}
                          disabled={isConnecting}
                        />
                      )}

                      {field.helperText && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {field.helperText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="p-6 border-t bg-background flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>AES-256 Encrypted</span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button type="button" variant="ghost" onClick={closeConfigModal} disabled={isConnecting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isConnecting} className="min-w-[160px]">
                    {isConnecting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {selectedConnector.authType === 'oauth' ? 'Redirecting...' : 'Verifying...'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {selectedConnector.authType === 'oauth' ? 'Authenticate' : 'Save Connection'}
                        {selectedConnector.authType === 'oauth' && <ExternalLink className="h-4 w-4" />}
                      </div>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}

          {/* Success State */}
          {selectedConnector && isSuccess && (
            <div className="h-[400px] p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="h-20 w-20 relative rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-3 tracking-tight">Connection Established</h2>
              <p className="text-muted-foreground mb-8 max-w-sm leading-relaxed">
                Your <strong className="text-foreground">{selectedConnector.name}</strong> data is now securely linked. The AI engine is mapping the schema in the background.
              </p>
              <Button className="w-full sm:w-auto min-w-[200px]" onClick={closeConfigModal}>
                Return to Hub
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── IMPROVEMENT 2: DISCONNECT CONFIRMATION DIALOG ── */}
      {/*
       * Shown before any delete/disconnect action. For document assets, the copy
       * explicitly warns that vector chunks will be permanently scrubbed from
       * the Qdrant index — making the destructive intent unmistakable.
       */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => { if (!open && !isDisconnecting) setDisconnectTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {disconnectTarget?.is_document ? 'Delete & Scrub Document?' : 'Disconnect Data Source?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {disconnectTarget?.is_document ? (
                <>
                  <span className="block">
                    This will permanently delete <strong>"{disconnectTarget.name}"</strong> and
                    scrub all <strong>{formatNumber(disconnectTarget.chunk_count ?? 0)} vector chunks</strong> from
                    the Qdrant index. The AI will no longer have access to this document.
                  </span>
                  <span className="block text-destructive font-medium text-xs mt-2">
                    This action cannot be undone. The file must be re-uploaded to restore access.
                  </span>
                </>
              ) : (
                <>
                  <span className="block">
                    This will disconnect <strong>"{disconnectTarget?.name}"</strong> and permanently
                    revoke the stored credentials from Vault. Any scheduled syncs will be cancelled.
                  </span>
                  <span className="block text-destructive font-medium text-xs mt-2">
                    This action cannot be undone. You will need to re-enter credentials to reconnect.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectConfirm}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-[130px]"
            >
              {isDisconnecting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {disconnectTarget?.is_document ? 'Scrubbing…' : 'Disconnecting…'}
                </div>
              ) : (
                disconnectTarget?.is_document ? 'Delete & Scrub' : 'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}