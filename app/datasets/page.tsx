// app/datasets/page.tsx

'use client'

import React, { useState } from 'react'
import { Database, Plus, Search, Table as TableIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUploadZone } from '@/components/ingestion/FileUploadZone'
import { Badge } from '@/components/ui/badge'
import { IntegrationConnectModal } from '@/components/integrations/IntegrationConnectModal'

// Mock interface for type safety - eventually this connects to your dataset_service.py types
interface Dataset {
  id: string
  name: string
  type: 'csv' | 'postgres' | 'snowflake' | 'stripe' | 'shopify'
  size: string
  lastUpdated: string
  status: 'ready' | 'processing' | 'error'
}

const mockDatasets: Dataset[] = [
  { id: '1', name: 'Q4_Financials.csv', type: 'csv', size: '2.4 MB', lastUpdated: '10 mins ago', status: 'ready' },
  { id: '2', name: 'Stripe_Live_Revenue', type: 'stripe', size: 'Live Sync', lastUpdated: 'Just now', status: 'ready' },
]

export default function DatasetsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const filteredDatasets = mockDatasets.filter(ds => 
    ds.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 p-6 h-full w-full max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Datasets & Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect live SaaS platforms via OAuth or upload flat files for Zero-ETL analytics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* The New OAuth Connection Modal */}
          <IntegrationConnectModal />
          
          {/* The File Upload Toggle */}
          <Button 
            onClick={() => setIsUploading(!isUploading)} 
            variant={isUploading ? "secondary" : "outline"}
            className="flex items-center gap-2"
          >
            {isUploading ? 'Cancel Upload' : (
              <>
                <Plus className="h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Conditional Upload Zone */}
      {isUploading && (
        <Card className="border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-4">
          <CardHeader>
            <CardTitle>Ingest Flat Files</CardTitle>
            <CardDescription>Upload CSV or Parquet files directly. We will automatically normalize them.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Reusing your existing FileUploadZone component */}
            <FileUploadZone />
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      <div className="flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Datasets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDatasets.map((dataset) => (
          <Card key={dataset.id} className="group hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-secondary rounded-md">
                  {dataset.type === 'csv' ? (
                    <TableIcon className="h-4 w-4 text-secondary-foreground" />
                  ) : dataset.type === 'stripe' ? (
                    <span className="text-xl">💳</span>
                  ) : dataset.type === 'shopify' ? (
                    <span className="text-xl">🛍️</span>
                  ) : (
                    <Database className="h-4 w-4 text-secondary-foreground" />
                  )}
                </div>
                <CardTitle className="text-base font-medium truncate max-w-[180px]" title={dataset.name}>
                  {dataset.name}
                </CardTitle>
              </div>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-sm mt-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Type:</span>
                  <span className="uppercase font-mono text-xs">{dataset.type}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Size:</span>
                  <span>{dataset.size}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-muted-foreground">{dataset.lastUpdated}</span>
                  <Badge variant={dataset.status === 'ready' ? 'default' : 'secondary'} className="text-[10px] uppercase">
                    {dataset.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredDatasets.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            No datasets found. Connect a database or upload a file to get started.
          </div>
        )}
      </div>
    </div>
  )
}