// app/(dashboard)/datasets/page.tsx
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
  AlertCircle
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
  if (t.includes('s3') || t.includes('parquet')) return <HardDrive className="h-4 w-4 text-amber-500" />
  if (t.includes('stripe') || t.includes('api')) return <RefreshCw className="h-4 w-4 text-indigo-500" />
  if (t.includes('duckdb')) return <FileSpreadsheet className="h-4 w-4 text-yellow-500" />
  return <Database className="h-4 w-4 text-slate-500" /> 
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
      setError(err.message);
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
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Datasets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your connected data sources, data lakes, and tabular files.
          </p>
        </div>
        <Button 
          className="shrink-0 group shadow-sm hover:shadow-md transition-all"
          onClick={() => setIsConnectModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90 duration-200" />
          Connect Source
        </Button>
      </div>

      {/* Toolbar Section */}
      <div className="flex items-center justify-between w-full">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tables or sources..."
            className="pl-9 bg-card shadow-sm transition-colors focus-visible:ring-1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading || error !== null}
          />
        </div>
      </div>

      {/* Data Table Section */}
      <Card className="border shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[300px]">Dataset Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last Synced</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[70px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[90px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-destructive/80">
                      <AlertCircle className="h-8 w-8 mb-2 opacity-80" />
                      <p className="text-sm font-medium">{error}</p>
                      <Button variant="link" onClick={refetch} className="mt-2 text-primary">
                        Try Again
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredDatasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    {searchQuery ? (
                      <span>No datasets found matching "{searchQuery}".</span>
                    ) : (
                      <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <Database className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-base font-medium text-foreground">No datasets connected</p>
                        <p className="text-sm mt-1 mb-4">Click "Connect Source" to integrate your first database.</p>
                        <Button variant="outline" size="sm" onClick={() => setIsConnectModalOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" /> Connect Source
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDatasets.map((dataset) => (
                  <TableRow key={dataset.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(dataset.sourceType)}
                        {dataset.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dataset.sourceType}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNumber(dataset.rowCount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {dataset.size}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={dataset.status === 'Ready' ? 'default' : 'secondary'}
                        className={dataset.status === 'Ready' 
                          ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200' 
                          : 'animate-pulse'}
                      >
                        {dataset.status === 'Syncing' && <RefreshCw className="mr-1 h-3 w-3 animate-spin inline-block" />}
                        {dataset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {dataset.lastSynced}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px]">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer">
                            <ArrowUpRight className="mr-2 h-4 w-4" /> Query Data
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer">
                            <RefreshCw className="mr-2 h-4 w-4" /> Force Sync
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10">
                            Disconnect
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