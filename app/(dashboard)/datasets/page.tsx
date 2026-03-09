// app/(dashboard)/datasets/page.tsx
'use client'

import React, { useState, useMemo } from 'react'
import { 
  Search, 
  Plus, 
  Database, 
  MoreHorizontal, 
  HardDrive, 
  FileSpreadsheet,
  RefreshCw,
  ArrowUpRight
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
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

// Import our new Modular Modal
import { IntegrationConnectModal } from "@/components/ingestion/IntegrationConnectModal"

// 1. Type Safety
interface Dataset {
  id: string;
  name: string;
  sourceType: 'PostgreSQL' | 'DuckDB' | 'S3 Parquet' | 'Stripe API';
  rowCount: number;
  size: string;
  lastSynced: string;
  status: 'Ready' | 'Syncing' | 'Failed';
}

// 2. Mock State representing high-performance analytical engines
const mockDatasets: Dataset[] = [
  {
    id: 'ds_1',
    name: 'core_users_production',
    sourceType: 'PostgreSQL',
    rowCount: 1450239,
    size: '1.2 GB',
    lastSynced: '2 mins ago',
    status: 'Ready',
  },
  {
    id: 'ds_2',
    name: 'telemetry_events_2026',
    sourceType: 'S3 Parquet',
    rowCount: 89341200,
    size: '45.8 GB',
    lastSynced: '1 hr ago',
    status: 'Ready',
  },
  {
    id: 'ds_3',
    name: 'stripe_billing_history',
    sourceType: 'Stripe API',
    rowCount: 84000,
    size: '150 MB',
    lastSynced: 'Syncing...',
    status: 'Syncing',
  },
  {
    id: 'ds_4',
    name: 'local_marketing_spend',
    sourceType: 'DuckDB',
    rowCount: 1200,
    size: '5 MB',
    lastSynced: '1 day ago',
    status: 'Ready',
  }
]

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num)

export default function DatasetsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  // 3. State Management for the Connection Workflow
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

  // Compute Efficiency: Vectorized-style client filtering
  const filteredDatasets = useMemo(() => {
    return mockDatasets.filter(ds => 
      ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ds.sourceType.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery])

  const getSourceIcon = (type: Dataset['sourceType']) => {
    switch (type) {
      case 'PostgreSQL': return <Database className="h-4 w-4 text-blue-500" />
      case 'S3 Parquet': return <HardDrive className="h-4 w-4 text-amber-500" />
      case 'Stripe API': return <RefreshCw className="h-4 w-4 text-indigo-500" />
      case 'DuckDB': return <FileSpreadsheet className="h-4 w-4 text-yellow-500" />
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Datasets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your connected data sources, data lakes, and tabular files.
          </p>
        </div>
        <Button 
          className="shrink-0 group"
          onClick={() => setIsConnectModalOpen(true)} // Trigger the modal
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
            className="pl-9 bg-card shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table Section */}
      <Card className="border shadow-sm overflow-hidden flex-1">
        <Table>
          <TableHeader className="bg-muted/50">
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
            {filteredDatasets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No datasets found matching your search.
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
                      className={dataset.status === 'Ready' ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200' : 'animate-pulse'}
                    >
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
      </Card>

      {/* 4. Injection Point: The Black-Box Modal Component */}
      <IntegrationConnectModal 
        isOpen={isConnectModalOpen} 
        onClose={() => setIsConnectModalOpen(false)} 
        onSuccess={() => {
          // Future: Trigger a React Query invalidation or mutate to refresh the datasets list
          console.log("Integration connected successfully. Refreshing datasets...")
        }}
      />
    </div>
  )
}