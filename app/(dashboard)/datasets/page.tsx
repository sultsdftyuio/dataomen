'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { 
  Search, 
  Database, 
  MoreHorizontal, 
  HardDrive, 
  FileSpreadsheet,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
  Snowflake,
  ShieldAlert,
  Server,
  Cloud,
  Box,
  Layers,
  Settings2,
  Trash2,
  PlugZap,
  CheckCircle2
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { IntegrationConnectModal } from "@/components/ingestion/IntegrationConnectModal"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Types & Core Schemas
// -----------------------------------------------------------------------------
interface Dataset {
  id: string;
  name: string;
  sourceType: string;
  rowCount: number;
  size: string;
  lastSynced: string;
  status: 'Ready' | 'Syncing' | 'Failed';
}

type ConnectorCategory = 'All' | 'Data Warehouses' | 'Databases' | 'Apps';

interface Connector {
  id: string;
  name: string;
  type: string;
  category: ConnectorCategory;
  desc: string;
  icon: React.ReactNode;
  isNew?: boolean;
}

// -----------------------------------------------------------------------------
// The Connector Library (Matches your api/services/integrations folder)
// -----------------------------------------------------------------------------
const CONNECTORS: Connector[] = [
  // Databases
  { id: "pg", name: "PostgreSQL", type: "Database", category: "Databases", desc: "Connect your Postgres data for instant AI analysis.", icon: <Database className="w-5 h-5 text-blue-500" /> },
  { id: "ms", name: "MySQL", type: "Database", category: "Databases", desc: "Connect your MySQL data for instant AI analysis.", icon: <Database className="w-5 h-5 text-sky-600" /> },
  { id: "sql", name: "SQL Server", type: "Database", category: "Databases", desc: "Connect your SQL Server data for instant AI analysis.", icon: <Server className="w-5 h-5 text-red-500" /> },
  { id: "sb", name: "Supabase", type: "Database", category: "Databases", desc: "Connect your Supabase data for instant AI analysis.", icon: <Database className="w-5 h-5 text-emerald-500" /> },

  // Data Warehouses
  { id: "bq", name: "BigQuery", type: "Warehouse", category: "Data Warehouses", desc: "Connect your BigQuery data for instant AI analysis.", icon: <Cloud className="w-5 h-5 text-blue-400" /> },
  { id: "sf", name: "Snowflake", type: "Warehouse", category: "Data Warehouses", desc: "Connect your Snowflake data for instant AI analysis.", icon: <Snowflake className="w-5 h-5 text-sky-400" /> },
  { id: "rs", name: "Redshift", type: "Warehouse", category: "Data Warehouses", desc: "Connect your AWS Redshift data for instant AI analysis.", icon: <Layers className="w-5 h-5 text-orange-500" /> },

  // SaaS Apps / Integrations
  { id: "st", name: "Stripe", type: "Integration", category: "Apps", desc: "Live connection to your Stripe billing and subscription data.", icon: <PlugZap className="w-5 h-5 text-indigo-500" /> },
  { id: "hs", name: "HubSpot", type: "Integration", category: "Apps", desc: "Analyze your CRM contacts, deals, and pipeline metrics.", icon: <Box className="w-5 h-5 text-orange-600" /> },
  { id: "sf_crm", name: "Salesforce", type: "Integration", category: "Apps", desc: "Analyze your CRM leads, opportunities, and accounts.", icon: <Cloud className="w-5 h-5 text-blue-500" /> },
  { id: "sh", name: "Shopify", type: "Integration", category: "Apps", desc: "Live connection to your e-commerce orders and customers.", icon: <Box className="w-5 h-5 text-green-500" /> },
  { id: "zd", name: "Zendesk", type: "Integration", category: "Apps", desc: "Analyze your customer support tickets and resolution times.", icon: <Layers className="w-5 h-5 text-teal-600" /> },
  { id: "ga", name: "Google Ads", type: "Integration", category: "Apps", desc: "Analyze your data and manage your campaigns in Google Ads.", icon: <Box className="w-5 h-5 text-amber-500" />, isNew: true },
  { id: "ma", name: "Meta Ads", type: "Integration", category: "Apps", desc: "Analyze your data and manage your campaigns in Meta Ads.", icon: <Box className="w-5 h-5 text-blue-600" />, isNew: true },
];

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

// -----------------------------------------------------------------------------
// Data Fetching Hook
// -----------------------------------------------------------------------------
const useDatasets = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatasets = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) throw new Error("Authentication required to view datasets.");

      const response = await fetch('/api/v1/datasets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        signal
      });

      if (!response.ok) {
         if (response.status === 404) { setDatasets([]); return; }
         throw new Error("Failed to load connected data sources from the engine.");
      }
      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err: any) {
      if (err.name === 'AbortError') return; 
      console.error("Dataset retrieval error:", err);
      setError(err.message || "An error occurred while fetching datasets.");
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDatasets(controller.signal);
    return () => controller.abort();
  }, [fetchDatasets]);

  return { datasets, isLoading, error, refetch: () => fetchDatasets() };
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function IntegrationsHubPage() {
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  
  const { datasets, isLoading, error, refetch } = useDatasets();

  // Filter Connectors Grid
  const filteredConnectors = useMemo(() => {
    let filtered = CONNECTORS;
    if (activeCategory !== 'All') {
      filtered = filtered.filter(c => c.category === activeCategory);
    }
    if (searchQuery) {
      const sq = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(sq) || c.type.toLowerCase().includes(sq));
    }
    return filtered;
  }, [activeCategory, searchQuery]);

  // Open the actual connection modal, passing the selected engine type
  const handleOpenConnectModal = (connectorId: string) => {
    setSelectedConnectorId(connectorId);
    setIsConnectModalOpen(true);
  }

  // Get icon for Active Integrations list
  const getSourceIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('postgres')) return <Database className="h-4 w-4 text-blue-500" />
    if (t.includes('snowflake')) return <Snowflake className="h-4 w-4 text-sky-400" />
    if (t.includes('s3') || t.includes('parquet')) return <HardDrive className="h-4 w-4 text-amber-500" />
    if (t.includes('stripe') || t.includes('api')) return <RefreshCw className="h-4 w-4 text-indigo-500" />
    return <Database className="h-4 w-4 text-muted-foreground" /> 
  };

  return (
    <div className="flex flex-col gap-10 h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            Connectors & Integrations
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Connect your data warehouses, databases, and SaaS applications directly to run instant AI analysis.
          </p>
        </div>
      </div>

      {/* ── SECTION 1: YOUR ACTIVE INTEGRATIONS ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Your Integrations
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full px-2.5">
            {datasets.length} Active
          </Badge>
        </h2>

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl bg-muted/50" />)}
          </div>
        ) : error && datasets.length === 0 ? (
          <div className="w-full border border-destructive/20 bg-destructive/5 rounded-2xl p-6 flex items-center gap-4 text-destructive">
            <AlertCircle className="w-6 h-6" />
            <div>
              <p className="font-semibold">{error}</p>
              <Button variant="link" onClick={refetch} className="text-destructive p-0 h-auto mt-1">Try again</Button>
            </div>
          </div>
        ) : datasets.length === 0 ? (
          <div className="w-full border border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-muted/10">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <PlugZap className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No active connections.</p>
            <p className="text-sm text-muted-foreground/70 mt-1 mb-0">Select a connector below to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {datasets.map((dataset) => (
              <div key={dataset.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/30 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shadow-inner">
                    {getSourceIcon(dataset.sourceType)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{dataset.name}</h3>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 h-4 bg-muted/50 border-border">
                        {dataset.sourceType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                      <span>{formatNumber(dataset.rowCount)} rows</span>
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
                      <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-xs font-medium text-emerald-600">Connected</span></>
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
                    <DropdownMenuContent align="end" className="w-[160px] rounded-xl shadow-xl">
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Connection</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer">
                        <ArrowUpRight className="mr-2 h-4 w-4 text-muted-foreground" /> Query in Chat
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer">
                        <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" /> Force Sync
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer">
                        <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" /> Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SECTION 2: CONNECTOR LIBRARY ── */}
      <section className="space-y-6 pt-4 border-t border-border/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Add Connectors</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search connectors..."
              className="pl-9 bg-background rounded-full focus-visible:ring-primary/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {/* Category Tabs (Pills) */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredConnectors.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-2xl">
              No connectors found matching your search.
            </div>
          ) : (
            filteredConnectors.map(connector => (
              <div 
                key={connector.id} 
                onClick={() => handleOpenConnectModal(connector.id)}
                className="group flex flex-col p-5 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all cursor-pointer shadow-sm hover:shadow-md h-full relative overflow-hidden"
              >
                {/* Visual Accent */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[100px] -z-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-background border shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
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
                      {connector.type}
                    </span>
                    <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                      Connect <ArrowUpRight className="w-3 h-3 ml-1" />
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Uses the existing modal component from your codebase, but you could pass the selectedConnectorId to it if needed to pre-fill the form */}
      <IntegrationConnectModal 
        isOpen={isConnectModalOpen} 
        onClose={() => setIsConnectModalOpen(false)} 
        onSuccess={() => {
          refetch();
          setIsConnectModalOpen(false);
        }}
      />
    </div>
  )
}