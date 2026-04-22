"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Search, Database, MoreHorizontal, RefreshCw, ArrowUpRight, Snowflake,
  ShieldAlert, Cloud, Box, Layers, Trash2, CheckCircle2, CreditCard, 
  ShoppingBag, Loader2, ExternalLink, ShieldCheck, PlugZap, 
  FileText, FileSpreadsheet, X, AlertTriangle, Filter,
  ArrowUpDown, Wifi, ChevronDown, Check
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { FileUploadZone } from "@/components/ingestion/FileUploadZone"

// -----------------------------------------------------------------------------
// 1. TYPES — Backend-Aligned, Semantically Correct
// -----------------------------------------------------------------------------

type AssetType = 'table' | 'file' | 'document';
type AssetKind = 'tabular' | 'document' | 'warehouse' | 'application';
type SourceType = 'connector' | 'file';

interface Source {
  type: SourceType;
  subtype: string; // e.g., 'postgres', 'snowflake', 'pdf', 'csv'
}

type DatasetStatus = 'syncing' | 'indexing' | 'ready' | 'failed';

interface Dataset {
  id: string;
  name: string;
  source: Source;
  asset_type: AssetType;
  asset_kind: AssetKind;      // Authoritative styling key from backend
  row_count?: number;         // Strictly for tables/warehouses
  chunk_count?: number;       // Strictly for documents/files
  size: string;
  last_synced: string;
  status: DatasetStatus;
  stage?: string;             // 'extracting' | 'chunking' | 'embedding' | 'optimizing'
  progress?: number;          // 0-100
  error_message?: string;
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

// -----------------------------------------------------------------------------
// 2. CONSTANTS
// -----------------------------------------------------------------------------

const INTEGRATIONS: ConnectorConfig[] = [
  { 
    id: "snowflake", name: "Snowflake", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your enterprise cloud data warehouse natively.", 
    icon: <Snowflake className="w-6 h-6" />, color: "text-sky-400",
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
    icon: <Cloud className="w-6 h-6" />, color: "text-blue-400",
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project-123' },
      { name: 'dataset_id', label: 'Dataset ID', type: 'text', placeholder: 'analytics_production' },
      { name: 'service_account', label: 'Service Account JSON', type: 'password', placeholder: '{"type": "service_account", ...}', helperText: 'Paste the entire contents of your Service Account JSON key file.' },
    ]
  },
  { 
    id: "redshift", name: "Redshift", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your AWS Redshift clusters.", 
    icon: <Layers className="w-6 h-6" />, color: "text-orange-500",
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
    icon: <Database className="w-6 h-6" />, color: "text-blue-600",
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'db.example.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5432' },
      { name: 'database', label: 'Database Name', type: 'text', placeholder: 'production_db' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'readonly_user' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },
  { 
    id: "stripe", name: "Stripe", category: "Apps", authType: 'credentials',
    desc: "Live connection to your billing and subscription data.", 
    icon: <CreditCard className="w-6 h-6" />, color: "text-indigo-500",
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_...', helperText: 'Requires read-only access to Customers, Subscriptions, and Invoices.' },
    ]
  },
  { 
    id: "salesforce", name: "Salesforce", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM leads, opportunities, and accounts.", 
    icon: <Cloud className="w-6 h-6" />, color: "text-blue-500",
    fields: [
      { name: 'environment', label: 'Environment', type: 'select', options: [{ label: 'Production', value: 'login' }, { label: 'Sandbox', value: 'test' }] },
    ]
  },
  { 
    id: "shopify", name: "Shopify", category: "Apps", authType: 'oauth',
    desc: "Live connection to your e-commerce orders and customers.", 
    icon: <ShoppingBag className="w-6 h-6" />, color: "text-green-500",
    fields: [
      { name: 'shop_url', label: 'Shop Domain', type: 'text', placeholder: 'my-store.myshopify.com' },
    ]
  },
  { 
    id: "zendesk", name: "Zendesk", category: "Apps", authType: 'credentials',
    desc: "Analyze your customer support tickets and resolution times.", 
    icon: <Layers className="w-6 h-6" />, color: "text-teal-600",
    fields: [
      { name: 'subdomain', label: 'Zendesk Subdomain', type: 'text', placeholder: 'company' },
      { name: 'email', label: 'Admin Email', type: 'text', placeholder: 'admin@company.com' },
      { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••' },
    ]
  },
];

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

// -----------------------------------------------------------------------------
// 3. AUTH HOOK — Session Caching (Fixes #7)
// -----------------------------------------------------------------------------

const useAuth = () => {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    
    let mounted = true;
    const init = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data.session) setSession(data.session);
        if (error) console.error("Auth session error:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  const getToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) setSession(data.session);
    return token ?? null;
  }, [session]);

  return { session, getToken, isLoading };
};

// -----------------------------------------------------------------------------
// 4. DATA FETCHING — Exponential Backoff Polling (Fixes #4, #14)
// -----------------------------------------------------------------------------

const useDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { getToken } = useAuth();
  
  const abortRef = useRef<AbortController | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const fetchDatasets = useCallback(async (isSilent = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (!isSilent) setIsLoading(true);
    setIsError(false);

    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      const res = await fetch('/api/datasets', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: abortRef.current.signal
      });

      if (!res.ok) {
        if (res.status === 404) {
          if (isMountedRef.current) setDatasets([]);
          return;
        }
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Unable to reach sync engine (${res.status})`);
      }

      const data = await res.json();
      const normalized: Dataset[] = Array.isArray(data) ? data : (data.datasets || []);

      if (isMountedRef.current) {
        setDatasets(normalized);
        setErrorMessage(null);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (isMountedRef.current) {
        setIsError(true);
        setErrorMessage(err.message);
        if (!isSilent) setDatasets([]);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [getToken]);

  // Exponential backoff polling (Fixes #4)
  useEffect(() => {
    const hasActive = datasets.some(d => d.status === 'syncing' || d.status === 'indexing');
    
    if (hasActive) {
      const baseDelay = 2000;
      const maxDelay = 30000;
      const delay = Math.min(baseDelay * Math.pow(2, pollAttemptRef.current), maxDelay);
      
      pollTimeoutRef.current = setTimeout(() => {
        pollAttemptRef.current += 1;
        fetchDatasets(true);
      }, delay);
    } else {
      pollAttemptRef.current = 0;
    }

    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [datasets, fetchDatasets]);

  useEffect(() => {
    fetchDatasets();
    return () => { 
      isMountedRef.current = false; 
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDatasets]);

  return { datasets, isLoading, isError, errorMessage, refetch: fetchDatasets };
};

// -----------------------------------------------------------------------------
// 5. UI HELPERS
// -----------------------------------------------------------------------------

const AssetIcon = ({ kind, status }: { kind: AssetKind; status: DatasetStatus }) => {
  const isProcessing = status === 'syncing' || status === 'indexing';
  const className = `w-5 h-5 ${isProcessing ? 'text-blue-500' : ''}`;
  
  switch (kind) {
    case 'document': return <FileText className={`w-5 h-5 ${isProcessing ? '' : 'text-purple-500'}`} />;
    case 'tabular': return <FileSpreadsheet className={`w-5 h-5 ${isProcessing ? '' : 'text-emerald-500'}`} />;
    case 'warehouse': return <Database className={`w-5 h-5 ${isProcessing ? '' : 'text-sky-500'}`} />;
    case 'application': return <Cloud className={`w-5 h-5 ${isProcessing ? '' : 'text-indigo-500'}`} />;
    default: return <Box className="w-5 h-5 text-muted-foreground" />;
  }
};

const StatusBadge = ({ status, stage, progress }: { status: DatasetStatus; stage?: string; progress?: number }) => {
  if (status === 'ready') {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-600">Indexed</span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="w-4 h-4 text-destructive" />
        <span className="text-xs font-medium text-destructive">Failed</span>
      </div>
    );
  }
  
  const label = status === 'syncing' ? 'Syncing' : 'Indexing';
  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <div className="flex items-center gap-1.5">
        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
        <span className="text-xs font-medium text-blue-600">
          {label}{stage ? ` • ${stage}` : ''}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500" 
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} 
          />
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 6. MAIN COMPONENT
// -----------------------------------------------------------------------------

export default function KnowledgeHubPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { getToken } = useAuth();

  // -- Dataset List State --
  const { datasets, isLoading, isError, errorMessage, refetch } = useDatasets();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [datasetSearch, setDatasetSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DatasetStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');

  // -- Connector Grid State --
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory>('All');
  const [connectorSearch, setConnectorSearch] = useState('');

  // -- Connect Modal State --
  const [selectedConnector, setSelectedConnector] = useState<ConnectorConfig | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // -- Delete State (Fixes #5) --
  const [deleteTarget, setDeleteTarget] = useState<Dataset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // -- Derived: Filtered & Sorted Datasets (Fixes #11) --
  const filteredDatasets = useMemo(() => {
    let result = [...datasets];

    if (datasetSearch.trim()) {
      const q = datasetSearch.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.source.subtype.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date') return new Date(b.last_synced).getTime() - new Date(a.last_synced).getTime();
      return 0;
    });

    return result;
  }, [datasets, datasetSearch, statusFilter, sortBy]);

  // -- Derived: Connector Grid --
  const filteredConnectors = useMemo(() => {
    let filtered = INTEGRATIONS;
    if (activeCategory !== 'All') filtered = filtered.filter(c => c.category === activeCategory);
    if (connectorSearch) {
      const sq = connectorSearch.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(sq) || c.id.toLowerCase().includes(sq));
    }
    return filtered;
  }, [activeCategory, connectorSearch]);

  // -- Duplicate Detection (Fixes #16) --
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    datasets.forEach(d => {
      const key = `${d.name}::${d.source.subtype}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [datasets]);

  // -- Handlers --

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredDatasets.length && filteredDatasets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDatasets.map(d => d.id)));
    }
  };

  const handleOpenConfig = (connector: ConnectorConfig) => {
    setSelectedConnector(connector);
    setIsSuccess(false);
    setConnectError(null);
    const defaults: Record<string, string> = {};
    connector.fields.forEach(f => {
      if (f.type === 'select' && f.options?.length) defaults[f.name] = f.options[0].value;
    });
    setFormData(defaults);
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Real connection logic (Fixes #6)
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnector) return;

    setIsConnecting(true);
    setConnectError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      const payload = {
        integration_id: selectedConnector.id,
        source: {
          type: 'connector' as const,
          subtype: selectedConnector.id,
        },
        auth_type: selectedConnector.authType,
        config: formData,
      };

      const res = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Connection failed: ${res.statusText}`);
      }

      setIsSuccess(true);
      toast({
        title: "Connection Secured",
        description: `Successfully linked ${selectedConnector.name}. Initializing schema sync.`,
      });
      refetch(true);
    } catch (err: any) {
      setConnectError(err.message);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err.message,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleForceSync = async (datasetId: string, name: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/datasets/${datasetId}/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Sync request rejected by server.");
      
      toast({ title: "Sync Initiated", description: `Pulling latest data from ${name}...` });
      refetch(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync Failed", description: err.message });
    }
  };

  const initiateDisconnect = (dataset: Dataset) => {
    setDeleteTarget(dataset);
    setDeleteConfirmText('');
    setPendingDeleteId(dataset.id);
  };

  const handleConfirmDisconnect = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.name) return;
    
    setIsDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/datasets/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete asset from engine.");
      }

      toast({
        title: "Asset Permanently Scrubbed",
        description: `${deleteTarget.name} and all its semantic vectors have been securely deleted.`,
      });
      
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      
      refetch(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: error.message,
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
      setPendingDeleteId(null);
      setDeleteConfirmText('');
    }
  };

  const handleBulkDelete = async () => {
    // In a real app, you'd batch this. Here we loop with confirmation or a single bulk endpoint.
    toast({ title: "Bulk Delete", description: "Use the API for bulk operations." });
  };

  const closeConfigModal = () => {
    setSelectedConnector(null);
    setIsSuccess(false);
    setFormData({});
    setConnectError(null);
  };

  const isDatasetPendingDelete = (id: string) => pendingDeleteId === id;

  // -----------------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            Knowledge Hub
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Manage your AI Copilot's brain. Upload files for RAG or securely connect data warehouses for analytics.
          </p>
        </div>
      </div>

      {/* SECTION 1: FILE UPLOAD */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Upload Context
        </h2>
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <FileUploadZone 
            onUploadSuccess={() => {
              // Check for duplicates after refresh
              refetch(true);
              setTimeout(() => {
                // Trigger a toast if duplicates now exist
                // (Handled reactively by the duplicates memo above)
              }, 1000);
            }} 
          />
        </div>
        {duplicates.size > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Duplicate assets detected. Consider removing redundant sources to save on embedding costs.</span>
          </div>
        )}
      </section>

      {/* SECTION 2: ACTIVE ASSETS */}
      <section className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Active Knowledge Base
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full px-2.5">
              {datasets.length} Active
            </Badge>
          </h2>
          
          {/* Dataset Controls (Fixes #11) */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search assets..."
                className="pl-9 rounded-full focus-visible:ring-primary/50"
                value={datasetSearch}
                onChange={(e) => setDatasetSearch(e.target.value)}
              />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 rounded-full">
                  <Filter className="w-3.5 h-3.5" />
                  {statusFilter === 'all' ? 'All Status' : statusFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => setStatusFilter('all')}>All Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('ready')}>Ready</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('syncing')}>Syncing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('indexing')}>Indexing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('failed')}>Failed</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 rounded-full">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => setSortBy('date')}>Last Synced</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('name')}>Name</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bulk Actions Bar (Fixes #10) */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl bg-muted/50" />)}
          </div>
        ) : isError ? (
          <div className="w-full border border-destructive/30 bg-destructive/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <ShieldAlert className="w-8 h-8 text-destructive mb-3" />
            <p className="text-foreground font-semibold">Failed to load assets</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{errorMessage}</p>
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="w-full border border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-muted/10">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border border-border">
              <PlugZap className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold">No assets indexed yet.</p>
            <p className="text-sm text-muted-foreground mt-1 mb-0 max-w-sm">
              Upload a file above or connect an integration below to populate your agent's memory.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {/* Header Row */}
            <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="flex items-center">
                <Checkbox 
                  checked={filteredDatasets.length > 0 && selectedIds.size === filteredDatasets.length}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </div>
              <div>Asset</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>

            {filteredDatasets.map((dataset) => {
              const isSelected = selectedIds.has(dataset.id);
              const isPendingDelete = isDatasetPendingDelete(dataset.id);
              const isDuplicate = duplicates.has(`${dataset.name}::${dataset.source.subtype}`);

              return (
                <div 
                  key={dataset.id} 
                  className={`
                    flex flex-col md:grid md:grid-cols-[auto_1fr_auto_auto] gap-4 p-4 rounded-xl border bg-card shadow-sm transition-all
                    ${isPendingDelete ? 'opacity-40 pointer-events-none' : 'hover:border-primary/30'}
                    ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border'}
                  `}
                >
                  {/* Col 1: Select + Icon */}
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(dataset.id)}
                      aria-label={`Select ${dataset.name}`}
                    />
                    <div className={`
                      w-10 h-10 rounded-lg bg-muted flex items-center justify-center shadow-inner shrink-0
                      ${dataset.status === 'syncing' || dataset.status === 'indexing' ? 'animate-pulse' : ''}
                    `}>
                      <AssetIcon kind={dataset.asset_kind} status={dataset.status} />
                    </div>
                  </div>

                  {/* Col 2: Info */}
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{dataset.name}</h3>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 h-4 bg-muted/50 border-border">
                        {dataset.source.subtype}
                      </Badge>
                      {isDuplicate && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">
                          Duplicate
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>
                        {dataset.asset_type === 'document' && dataset.chunk_count != null
                          ? `${formatNumber(dataset.chunk_count)} chunks`
                          : dataset.row_count != null
                            ? `${formatNumber(dataset.row_count)} rows`
                            : '—'
                        }
                      </span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>{dataset.size}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>Synced {dataset.last_synced}</span>
                    </p>
                    {dataset.status === 'failed' && dataset.error_message && (
                      <p className="text-[11px] text-destructive mt-1 truncate" title={dataset.error_message}>
                        {dataset.error_message}
                      </p>
                    )}
                  </div>

                  {/* Col 3: Status */}
                  <div className="flex items-center">
                    <StatusBadge 
                      status={dataset.status} 
                      stage={dataset.stage} 
                      progress={dataset.progress} 
                    />
                  </div>

                  {/* Col 4: Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:bg-muted" 
                          disabled={isPendingDelete}
                        >
                          {isPendingDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[180px] rounded-xl shadow-xl">
                        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Manage Asset</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => router.push('/chat')}>
                          <ArrowUpRight className="mr-2 h-4 w-4 text-muted-foreground" /> Query in Chat
                        </DropdownMenuItem>
                        {dataset.asset_kind !== 'document' && (
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleForceSync(dataset.id, dataset.name)}>
                            <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" /> Force Sync
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive" 
                          onClick={() => initiateDisconnect(dataset)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete & Scrub
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

      {/* SECTION 3: CONNECTOR LIBRARY */}
      <section className="space-y-6 pt-6 border-t border-border/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Integration Library</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search integrations..."
              className="pl-9 bg-background rounded-full focus-visible:ring-primary/50"
              value={connectorSearch}
              onChange={(e) => setConnectorSearch(e.target.value)}
            />
          </div>
        </div>
        
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {(['All', 'Data Warehouses', 'Databases', 'Apps'] as ConnectorCategory[]).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border ${
                activeCategory === category 
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                  : 'bg-background text-foreground border-border hover:bg-muted'
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
                className="group flex flex-col p-5 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all cursor-pointer shadow-sm hover:shadow-md h-full relative overflow-hidden"
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
                {connectError && (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{connectError}</span>
                  </div>
                )}
                
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
                Return to Dashboard
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DESTRUCTIVE DELETE CONFIRMATION (Fixes #5) ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl border-destructive/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete & Scrub Asset
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-3">
              <p>
                This will permanently delete <strong>{deleteTarget?.name}</strong> and scrub all associated vector embeddings from the index. This action is irreversible.
              </p>
              <div className="bg-muted p-3 rounded-lg text-xs font-mono text-muted-foreground border border-border">
                DELETE /api/datasets/{deleteTarget?.id}
              </div>
              <p className="text-sm font-medium text-foreground">
                Type the asset name to confirm:
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget?.name}
                className="mt-1"
                autoComplete="off"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDisconnect();
              }}
              disabled={deleteConfirmText !== deleteTarget?.name || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}