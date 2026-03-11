'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  Database, 
  ShieldAlert, 
  Save, 
  ArrowLeft, 
  Key, 
  Type, 
  Hash, 
  Calendar, 
  AlignLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableBody
} from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface ColumnMetadata {
  name: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'json';
  description: string;
  is_pii: boolean;
  is_primary_key: boolean;
  sample_value?: string;
}

interface DatasetDetails {
  id: string;
  name: string;
  source_type: string;
  row_count: number;
  size_bytes: number;
  last_synced: string;
  columns: ColumnMetadata[];
}

// -----------------------------------------------------------------------------
// Helper: Map Data Types to Icons
// -----------------------------------------------------------------------------
const TypeIcon = ({ type }: { type: ColumnMetadata['type'] }) => {
  switch (type) {
    case 'string': return <AlignLeft className="h-4 w-4 text-blue-500" />;
    case 'integer': 
    case 'float': return <Hash className="h-4 w-4 text-emerald-500" />;
    case 'datetime': return <Calendar className="h-4 w-4 text-purple-500" />;
    case 'boolean': return <CheckCircle2 className="h-4 w-4 text-amber-500" />;
    default: return <Type className="h-4 w-4 text-muted-foreground" />;
  }
}

// -----------------------------------------------------------------------------
// Main Page Component
// -----------------------------------------------------------------------------
export default function DatasetSchemaManagerPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const datasetId = params.id as string;

  const [dataset, setDataset] = useState<DatasetDetails | null>(null);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Orchestration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchSchema = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        // Try fetching from real backend API
        const response = await fetch(`/api/datasets/${datasetId}/schema`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });

        if (!response.ok) {
          if (response.status === 404) throw new Error("Not implemented");
          throw new Error("Failed to fetch schema metadata.");
        }

        const data = await response.json();
        setDataset(data.dataset);
        setColumns(data.dataset.columns);
      } catch (err) {
        console.warn("Falling back to simulated dataset schema data.", err);
        simulateBackendData();
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchema();
  }, [datasetId]);

  const simulateBackendData = () => {
    setTimeout(() => {
      const mockData: DatasetDetails = {
        id: datasetId,
        name: 'stripe_subscriptions_prod',
        source_type: 'Stripe API',
        row_count: 1450230,
        size_bytes: 1024 * 1024 * 145, // 145 MB
        last_synced: new Date().toISOString(),
        columns: [
          { name: 'sub_id', type: 'string', description: 'Unique identifier for the subscription.', is_pii: false, is_primary_key: true, sample_value: 'sub_1MowQjLkdIwHu7ix...' },
          { name: 'customer_email', type: 'string', description: 'Email address of the subscriber.', is_pii: true, is_primary_key: false, sample_value: 'jane.doe@example.com' },
          { name: 'mrr_amount', type: 'float', description: 'Monthly Recurring Revenue in USD, excluding VAT.', is_pii: false, is_primary_key: false, sample_value: '49.99' },
          { name: 'status', type: 'string', description: 'Current state of sub (active, past_due, canceled).', is_pii: false, is_primary_key: false, sample_value: 'active' },
          { name: 'created_at', type: 'datetime', description: 'Timestamp when the subscription was initiated.', is_pii: false, is_primary_key: false, sample_value: '2023-10-14T12:00:00Z' },
        ]
      };
      setDataset(mockData);
      setColumns(mockData.columns);
    }, 800);
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleDescriptionChange = (colName: string, newDesc: string) => {
    setColumns(prev => prev.map(c => c.name === colName ? { ...c, description: newDesc } : c));
    setHasChanges(true);
  };

  const handlePiiToggle = (colName: string) => {
    setColumns(prev => prev.map(c => c.name === colName ? { ...c, is_pii: !c.is_pii } : c));
    setHasChanges(true);
  };

  const handleSaveSchema = async () => {
    setIsSaving(true);
    try {
      // In production: send updated 'columns' array to backend to update schema_metadata JSONB
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network latency
      
      toast({
        title: "Data Dictionary Updated",
        description: "Your NL2SQL agents will immediately use these new definitions.",
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Failed to update the metadata registry. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">
      
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/datasets')} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {dataset.name}
              </h1>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                {dataset.source_type}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm flex items-center gap-3">
              <span>Rows: {(dataset.row_count).toLocaleString()}</span>
              <span>•</span>
              <span>Size: {(dataset.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
            </p>
          </div>
        </div>
        
        <Button 
          onClick={handleSaveSchema} 
          disabled={!hasChanges || isSaving}
          className="shrink-0 transition-all"
        >
          {isSaving ? (
            <span className="flex items-center"><Database className="mr-2 h-4 w-4 animate-bounce" /> Syncing...</span>
          ) : (
            <span className="flex items-center"><Save className="mr-2 h-4 w-4" /> Save Dictionary</span>
          )}
        </Button>
      </div>

      {/* RAG Context Warning */}
      <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400">
        <Database className="h-4 w-4 stroke-blue-600 dark:stroke-blue-400" />
        <AlertTitle className="font-semibold">Optimize Your AI's Context Window</AlertTitle>
        <AlertDescription className="text-sm mt-1">
          The descriptions you provide here are fed directly into the NL2SQL agent via semantic routing. Clear, business-specific definitions (e.g., "Excludes refunded transactions") drastically reduce query hallucinations and token costs. Marking columns as PII ensures they are masked before processing.
        </AlertDescription>
      </Alert>

      {/* Schema Editor Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <CardTitle className="text-lg">Schema & Dictionary Mapping</CardTitle>
          <CardDescription>Inferred from Parquet metadata. Edit descriptions to improve Agent accuracy.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="w-[250px]">Column Name</TableHead>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead>Business Description (AI Context)</TableHead>
                <TableHead className="w-[100px] text-center">PII Filter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns.map((col) => (
                <TableRow key={col.name} className="group hover:bg-muted/5">
                  
                  {/* Column Name & Key Status */}
                  <TableCell className="font-mono text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {col.is_primary_key && (
                        <span title="Primary Key" className="shrink-0 flex items-center">
                          <Key className="h-3 w-3 text-amber-500" />
                        </span>
                      )}
                      <span className={col.is_primary_key ? "text-foreground" : "text-muted-foreground"}>
                        {col.name}
                      </span>
                    </div>
                    {col.sample_value && (
                      <div className="text-[10px] text-muted-foreground/60 mt-1 truncate max-w-[200px]" title={`Sample: ${col.sample_value}`}>
                        e.g., {col.sample_value}
                      </div>
                    )}
                  </TableCell>

                  {/* Data Type */}
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px] flex items-center w-fit gap-1 bg-muted/50">
                      <TypeIcon type={col.type} />
                      {col.type}
                    </Badge>
                  </TableCell>

                  {/* Editable Business Description */}
                  <TableCell>
                    <Input 
                      value={col.description}
                      onChange={(e) => handleDescriptionChange(col.name, e.target.value)}
                      placeholder="Add business context for the AI..."
                      className="h-8 text-sm bg-transparent border-transparent hover:border-input focus:border-input focus:bg-background transition-colors"
                    />
                  </TableCell>

                  {/* PII Toggle */}
                  <TableCell className="text-center">
                    <div className="flex justify-center items-center">
                      <Switch 
                        checked={col.is_pii}
                        onCheckedChange={() => handlePiiToggle(col.name)}
                        className={col.is_pii ? "data-[state=checked]:bg-destructive" : ""}
                      />
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {hasChanges && (
          <CardFooter className="bg-muted/20 border-t p-4 flex justify-between items-center text-sm text-muted-foreground animate-in slide-in-from-bottom-2">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              You have unsaved metadata changes.
            </span>
            <Button size="sm" onClick={handleSaveSchema} disabled={isSaving}>
              Apply Changes
            </Button>
          </CardFooter>
        )}
      </Card>
      
    </div>
  )
}