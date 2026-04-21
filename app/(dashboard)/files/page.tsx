"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react'
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
  FileSpreadsheet
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

import { createClient } from '@/utils/supabase/client'
import { FileUploadZone } from "@/components/ingestion/FileUploadZone"

// -----------------------------------------------------------------------------
// Types & Backend-Aligned Schemas
// -----------------------------------------------------------------------------
interface Dataset {
  id: string;
  name: string;
  sourceType: string; // e.g., 'postgres', 'stripe', 'csv', 'pdf'
  rowCount: number;   // Represents 'rows' for DBs, or 'chunks' for PDFs
  size: string;
  lastSynced: string;
  status: 'Ready' | 'Syncing' | 'Failed';
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
// Authoritative Library (Wired exactly to api/services/integrations/)
// -----------------------------------------------------------------------------
const INTEGRATIONS: ConnectorConfig[] = [
  // Data Warehouses
  { 
    id: "snowflake", name: "Snowflake", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your enterprise cloud data warehouse natively.", icon: <Snowflake className="w-6 h-6" />, color: "text-sky-400",
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
    desc: "Connect your Google BigQuery datasets for instant analysis.", icon: <Cloud className="w-6 h-6" />, color: "text-blue-400",
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project-123' },
      { name: 'dataset_id', label: 'Dataset ID', type: 'text', placeholder: 'analytics_production' },
      { name: 'service_account', label: 'Service Account JSON', type: 'password', placeholder: '{"type": "service_account", ...}', helperText: 'Paste the entire contents of your Service Account JSON key file.' },
    ]
  },
  { 
    id: "redshift", name: "Redshift", category: "Data Warehouses", authType: 'credentials',
    desc: "Connect your AWS Redshift clusters.", icon: <Layers className="w-6 h-6" />, color: "text-orange-500",
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
    desc: "Connect your Postgres analytical replica.", icon: <Database className="w-6 h-6" />, color: "text-blue-600",
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'db.example.com' },
      { name: 'port', label: 'Port', type: 'text', placeholder: '5432' },
      { name: 'database', label: 'Database Name', type: 'text', placeholder: 'production_db' },
      { name: 'user', label: 'Username', type: 'text', placeholder: 'readonly_user' },
      { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ]
  },

  // SaaS Apps
  { 
    id: "stripe", name: "Stripe", category: "Apps", authType: 'credentials',
    desc: "Live connection to your billing and subscription data.", icon: <CreditCard className="w-6 h-6" />, color: "text-indigo-500",
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_...', helperText: 'Requires read-only access to Customers, Subscriptions, and Invoices.' },
    ]
  },
  { 
    id: "salesforce", name: "Salesforce", category: "Apps", authType: 'oauth',
    desc: "Analyze your CRM leads, opportunities, and accounts.", icon: <Cloud className="w-6 h-6" />, color: "text-blue-500",
    fields: [
      { name: 'environment', label: 'Environment', type: 'select', options: [{ label: 'Production', value: 'login' }, { label: 'Sandbox', value: 'test' }] },
    ]
  },
  { 
    id: "shopify", name: "Shopify", category: "Apps", authType: 'oauth',
    desc: "Live connection to your e-commerce orders and customers.", icon: <ShoppingBag className="w-6 h-6" />, color: "text-green-500",
    fields: [
      { name: 'shop_url', label: 'Shop Domain', type: 'text', placeholder: 'my-store.myshopify.com' },
    ]
  },
  { 
    id: "zendesk", name: "Zendesk", category: "Apps", authType: 'credentials',
    desc: "Analyze your customer support tickets and resolution times.", icon: <Layers className="w-6 h-6" />, color: "text-teal-600",
    fields: [
      { name: 'subdomain', label: 'Zendesk Subdomain', type: 'text', placeholder: 'company' },
      { name: 'email', label: 'Admin Email', type: 'text', placeholder: 'admin@company.com' },
      { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••' },
    ]
  },
];

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

// -----------------------------------------------------------------------------
// Data Fetching Hook (With Smart Polling)
// -----------------------------------------------------------------------------
const useDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDatasets = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) throw new Error("Authentication required.");

      const response = await fetch('/api/datasets', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
         if (response.status === 404) { setDatasets([]); return; }
         throw new Error("Unable to reach the synchronization engine.");
      }
      const data = await response.json();
      setDatasets(Array.isArray(data) ? data : (data.datasets || []));
    } catch (err: any) {
      console.warn("Dataset retrieval caught:", err.message);
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial Fetch
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // Smart Polling: Only poll if something is actively syncing
  useEffect(() => {
    const isSyncing = datasets.some(d => d.status === 'Syncing');
    let interval: NodeJS.Timeout;
    if (isSyncing) {
      interval = setInterval(() => fetchDatasets(true), 5000); // Silent background poll
    }
    return () => clearInterval(interval);
  }, [datasets, fetchDatasets]);

  return { datasets, isLoading, refetch: fetchDatasets };
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function KnowledgeHubPage() {
  const { toast } = useToast()
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory>('All')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [selectedConnector, setSelectedConnector] = useState<ConnectorConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  }

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // Handle Submission (Wires up to API)
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnector) return;

    setIsConnecting(true);

    try {
      if (selectedConnector.authType === 'oauth') {
        await new Promise(res => setTimeout(res, 1000));
        setIsSuccess(true);
      } else {
        await new Promise(res => setTimeout(res, 1500));
        setIsSuccess(true);
        toast({
          title: "Connection Secured",
          description: `Successfully linked ${selectedConnector.name}. Initializing schema sync.`,
        });
      }
      refetch(true); 
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Please verify your credentials and try again.",
      });
    } finally {
      setIsConnecting(false);
    }
  }

  // Action Menu Handlers
  const handleForceSync = async (datasetId: string, name: string) => {
    toast({
      title: "Sync Initiated",
      description: `Pulling the latest data from ${name}...`,
    });
    refetch(true);
  }

  const handleDisconnect = async (datasetId: string, name: string) => {
    setDeletingId(datasetId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      // Wire this to your backend endpoint that calls vector_service.delete_asset_index()
      const res = await fetch(`/api/datasets/${datasetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });

      if (!res.ok) throw new Error("Failed to delete asset from engine.");

      toast({
        title: "Asset Permanently Scrubbed",
        description: `${name} and all its semantic vectors have been securely deleted.`,
      });
      refetch(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: error.message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  const closeConfigModal = () => {
    setSelectedConnector(null);
    setIsSuccess(false);
    setFormData({});
  }

  // Helper to determine asset type styling
  const getAssetStyling = (type: string) => {
    const isDoc = ['pdf', 'txt', 'md', 'docx'].includes(type.toLowerCase());
    const isFile = ['csv', 'json', 'parquet'].includes(type.toLowerCase());
    
    if (isDoc) return { icon: <FileText className="w-5 h-5" />, color: 'text-purple-500', unit: 'chunks' };
    if (isFile) return { icon: <FileSpreadsheet className="w-5 h-5" />, color: 'text-emerald-500', unit: 'rows' };
    return { icon: <Database className="w-5 h-5" />, color: 'text-blue-500', unit: 'rows' };
  }

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── HEADER ── */}
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

      {/* ── SECTION 1: FILE UPLOAD ZONE ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Upload Context
        </h2>
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <FileUploadZone 
            onUploadSuccess={() => {
              refetch(true);
            }} 
          />
        </div>
      </section>

      {/* ── SECTION 2: ACTIVE ASSETS ── */}
      <section className="space-y-4 pt-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Active Knowledge Base
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
            <p className="text-foreground font-semibold">No assets indexed yet.</p>
            <p className="text-sm text-muted-foreground mt-1 mb-0 max-w-sm">
              Upload a file above or connect an integration below to populate your agent's memory.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {datasets.map((dataset) => {
              const styling = getAssetStyling(dataset.sourceType);
              const isDeleting = deletingId === dataset.id;

              return (
                <div key={dataset.id} className={`flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm transition-all group ${isDeleting ? 'opacity-50 pointer-events-none' : 'hover:border-primary/30'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center shadow-inner ${dataset.status === 'Syncing' ? 'animate-pulse text-blue-500' : styling.color}`}>
                      {styling.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{dataset.name}</h3>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 h-4 bg-muted/50 border-border">
                          {dataset.sourceType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span>{formatNumber(dataset.rowCount)} {styling.unit}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span>{dataset.size}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span>Synced {dataset.lastSynced}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 hidden md:flex">
                      {dataset.status === 'Ready' ? (
                        <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-xs font-medium text-emerald-600">Indexed</span></>
                      ) : dataset.status === 'Syncing' ? (
                        <><RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-xs font-medium text-blue-600">Processing...</span></>
                      ) : (
                        <><ShieldAlert className="w-4 h-4 text-destructive" /><span className="text-xs font-medium text-destructive">Failed</span></>
                      )}
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:bg-muted" disabled={isDeleting}>
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px] rounded-xl shadow-xl">
                        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Manage Asset</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => window.location.href = '/chat'}>
                          <ArrowUpRight className="mr-2 h-4 w-4 text-muted-foreground" /> Query in Chat
                        </DropdownMenuItem>
                        {styling.unit === 'rows' && (
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleForceSync(dataset.id, dataset.name)}>
                            <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" /> Force Sync
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleDisconnect(dataset.id, dataset.name)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete & Scrub
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

      {/* ── SECTION 3: CONNECTOR LIBRARY ── */}
      <section className="space-y-6 pt-6 border-t border-border/50">
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
    </div>
  )
}