'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { 
  Search, 
  Plus, 
  Database, 
  MoreHorizontal, 
  HardDrive, 
  FileSpreadsheet,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
  Snowflake,
  ShieldAlert
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
// Types & Constants
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

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

// Extracted from component to avoid reallocation on render
const getSourceIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('postgres')) return <Database className="h-4 w-4 text-blue-500" />
  if (t.includes('snowflake')) return <Snowflake className="h-4 w-4 text-sky-400" />
  if (t.includes('s3') || t.includes('parquet')) return <HardDrive className="h-4 w-4 text-amber-500" />
  if (t.includes('stripe') || t.includes('api')) return <RefreshCw className="h-4 w-4 text-indigo-500" />
  if (t.includes('duckdb')) return <FileSpreadsheet className="h-4 w-4 text-yellow-500" />
  return <Database className="h-4 w-4 text-muted-foreground" /> 
};

// -----------------------------------------------------------------------------
// Custom Data Hook (Separation of Concerns & Request Deduping)
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
      
      if (authError || !session) {
        throw new Error("Authentication required to view datasets.");
      }

      // Routed securely through /api/v1/ to leverage next.config.mjs rewrite
      const response = await fetch('/api/v1/datasets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        signal
      });

      if (!response.ok) {
         if (response.status === 404) {
           // API route doesn't exist yet - default to true empty state
           setDatasets([]);
           return; 
         }
         throw new Error("Failed to load connected data sources from the engine.");
      }

      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err: any) {
      if (err.name === 'AbortError') return; // Ignore canceled requests
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
    return () => controller.abort(); // Cleanup on unmount
  }, [fetchDatasets]);

  return { datasets, isLoading, error, refetch: () => fetchDatasets() };
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function DatasetsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  
  // Use custom hook for declarative state
  const { datasets, isLoading, error, refetch } = useDatasets();

  // Vectorized client-side filtering
  const filteredDatasets = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    if (!lowerQuery) return datasets;

    return datasets.filter(ds => 
      ds.name.toLowerCase().includes(lowerQuery) ||
      ds.sourceType.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, datasets]);

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 pb-10">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Datasets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your connected data sources, data lakes, and tabular files.
          </p>
        </div>
        <Button 
          className="shrink-0 group bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md transition-all"
          onClick={() => setIsConnectModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90 duration-200" />
          Connect Source
        </Button>
      </div>

      {/* Toolbar Section */}
      <div className="flex items-center justify-between w-full">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tables, sources, or schemas..."
            className="pl-9 bg-background shadow-sm transition-colors focus-visible:ring-1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading || error !== null}
          />
        </div>
      </div>

      {/* Data Table Section */}
      <Card className="border-border shadow-sm overflow-hidden flex-1 flex flex-col bg-background/50 backdrop-blur-sm">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="w-[300px] font-semibold">Dataset Name</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
                <TableHead className="text-right font-semibold">Rows</TableHead>
                <TableHead className="text-right font-semibold">Size</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Last Synced</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-border/50">
                    <TableCell><Skeleton className="h-5 w-[200px] rounded" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px] rounded" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px] ml-auto rounded" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[60px] ml-auto rounded" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[70px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[90px] ml-auto rounded" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : error && datasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-destructive/80">
                      <AlertCircle className="h-10 w-10 mb-3 opacity-80" />
                      <p className="text-base font-medium">{error}</p>
                      <Button variant="outline" onClick={refetch} className="mt-4">
                        Try Again
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredDatasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-[400px] text-center text-muted-foreground">
                    {searchQuery ? (
                      <div className="flex flex-col items-center justify-center">
                        <Search className="h-8 w-8 mb-3 opacity-20" />
                        <span>No datasets found matching "{searchQuery}".</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 border shadow-sm">
                          <Database className="h-8 w-8 text-muted-foreground opacity-60" />
                        </div>
                        <p className="text-lg font-medium text-foreground">No datasets connected</p>
                        <p className="text-sm mt-1 mb-6 max-w-sm text-center">
                          Connect your first data source to enable the semantic routing engine and deploy AI agents.
                        </p>
                        <Button onClick={() => setIsConnectModalOpen(true)} variant="outline">
                          <Plus className="h-4 w-4 mr-2" /> Connect Source
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDatasets.map((dataset) => (
                  <TableRow 
                    key={dataset.id} 
                    className={`group transition-colors border-b border-border/50 ${dataset.status === 'Failed' ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/30'}`}
                  >
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-background rounded-md border shadow-sm">
                          {getSourceIcon(dataset.sourceType)}
                        </div>
                        {dataset.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {dataset.sourceType}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tracking-tight text-foreground/80">
                      {formatNumber(dataset.rowCount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {dataset.size}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        className={
                          dataset.status === 'Ready' 
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium' 
                            : dataset.status === 'Syncing'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/20 font-medium animate-pulse'
                            : 'bg-destructive/10 text-destructive border-destructive/20 font-medium'
                        }
                      >
                        {dataset.status === 'Syncing' && <RefreshCw className="mr-1.5 h-3 w-3 animate-spin inline-block" />}
                        {dataset.status === 'Failed' && <ShieldAlert className="mr-1.5 h-3 w-3 inline-block" />}
                        {dataset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {dataset.lastSynced}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[180px]">
                          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer py-2">
                            <ArrowUpRight className="mr-2 h-4 w-4 text-muted-foreground" /> Query Data
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer py-2">
                            <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" /> Force Sync
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive py-2">
                            Disconnect Source
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

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