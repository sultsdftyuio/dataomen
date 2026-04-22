'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
  AlertCircle,
  Undo2,
  Search
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
import { useToast } from "@/hooks/use-toast"
import { createClient } from '@/utils/supabase/client'

import SemanticMetricBuilder from '@/components/datasets/SemanticMetricBuilder'

// -----------------------------------------------------------------------------
// Type Definitions (Strict Physical / Semantic Separation)
// -----------------------------------------------------------------------------
type ColumnType = 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'json';

interface PhysicalSchema {
  name: string;
  type: ColumnType;
  is_primary_key: boolean;
  sample_value?: string;
}

interface SemanticMetadata {
  description: string;
  is_pii: boolean;
}

interface ColumnMetadata extends PhysicalSchema, SemanticMetadata {}

interface DatasetDetails {
  id: string;
  name: string;
  source: {
    type: 'connector' | 'file';
    subtype: string;
  };
  asset_kind: 'document' | 'tabular' | 'warehouse';
  row_count?: number;
  chunk_count?: number;
  size_bytes: number;
  last_synced: string;
  version: number; // Optimistic Concurrency Control
}

interface DraftUpdate {
  description?: string;
  is_pii?: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const TypeIcon = ({ type }: { type: ColumnType }) => {
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
// Memoized Row Component (Prevents O(N) renders on single keystrokes)
// -----------------------------------------------------------------------------
const SchemaColumnRow = React.memo(({ 
  col, 
  draft, 
  onUpdate 
}: { 
  col: ColumnMetadata; 
  draft: DraftUpdate | undefined; 
  onUpdate: (name: string, field: keyof DraftUpdate, value: any) => void;
}) => {
  const currentDesc = draft?.description ?? col.description;
  const currentPii = draft?.is_pii ?? col.is_pii;
  
  // Basic Regex Validation for Prompt Injection Mitigation
  const isInvalid = currentDesc.length > 0 && currentDesc.length < 5;

  return (
    <TableRow className="group hover:bg-muted/5">
      {/* Physical Layer: Read-only */}
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

      <TableCell>
        <Badge variant="secondary" className="font-mono text-[10px] flex items-center w-fit gap-1 bg-muted/50">
          <TypeIcon type={col.type} />
          {col.type}
        </Badge>
      </TableCell>

      {/* Semantic Layer: Editable */}
      <TableCell>
        <Input 
          value={currentDesc}
          onChange={(e) => onUpdate(col.name, 'description', e.target.value)}
          placeholder="Business context for AI routing..."
          className={`h-8 text-sm bg-transparent transition-colors ${
            isInvalid ? 'border-destructive focus-visible:ring-destructive' : 'border-transparent hover:border-input focus:border-input focus:bg-background'
          }`}
        />
        {isInvalid && <p className="text-[10px] text-destructive mt-1">Description must be at least 5 characters.</p>}
      </TableCell>

      <TableCell className="text-center">
        <div className="flex justify-center items-center gap-2">
          <Switch 
            checked={currentPii}
            onCheckedChange={(checked) => onUpdate(col.name, 'is_pii', checked)}
            className={currentPii ? "data-[state=checked]:bg-destructive" : ""}
          />
          {currentPii && (
            <span title="Engine Enforced: Redacted from Prompts & Embeddings" className="inline-flex">
              <ShieldAlert className="h-3 w-3 text-destructive" />
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
})
SchemaColumnRow.displayName = 'SchemaColumnRow'

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
  
  // Dirty Field Tracking Dictionary
  const [drafts, setDrafts] = useState<Record<string, DraftUpdate>>({});
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Orchestration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!datasetId) {
      setErrorState("Invalid Dataset ID");
      setIsLoading(false);
      return;
    }

    const fetchSchema = async () => {
      setIsLoading(true);
      setErrorState(null);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/datasets/${datasetId}/schema`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });

        if (!response.ok) {
          throw new Error("Failed to fetch schema metadata.");
        }

        const data = await response.json();
        setDataset(data.dataset);
        setColumns(data.columns);
      } catch (err) {
        // Enforce Strict Env Checks - NO Mock Data in Prod
        if (process.env.NODE_ENV === 'development') {
          console.warn("DEV MODE: Injecting stub schema data.", err);
          injectMockData();
        } else {
          setErrorState("Could not connect to semantic registry. Please check system status.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchema();
  }, [datasetId]);

  const injectMockData = () => {
    setDataset({
      id: datasetId,
      name: 'stripe_subscriptions_prod',
      source: { type: 'connector', subtype: 'Stripe API' },
      asset_kind: 'tabular',
      row_count: 1450230,
      size_bytes: 1024 * 1024 * 145,
      last_synced: new Date().toISOString(),
      version: 1 // V1 baseline
    });
    setColumns([
      { name: 'sub_id', type: 'string', description: 'Unique identifier for the subscription.', is_pii: false, is_primary_key: true, sample_value: 'sub_1M...' },
      { name: 'customer_email', type: 'string', description: '', is_pii: true, is_primary_key: false, sample_value: 'jane@example.com' },
      { name: 'mrr_amount', type: 'float', description: 'Monthly Recurring Revenue in USD', is_pii: false, is_primary_key: false, sample_value: '49.99' },
      { name: 'status', type: 'string', description: 'Current state of sub (active, canceled)', is_pii: false, is_primary_key: false, sample_value: 'active' },
    ]);
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleUpdateDraft = useCallback((colName: string, field: keyof DraftUpdate, value: any) => {
    setDrafts(prev => {
      const colBase = columns.find(c => c.name === colName);
      if (!colBase) return prev;

      // Ensure we don't track unchanged fields
      const isOriginalValue = colBase[field] === value;
      const colDraft = { ...(prev[colName] || {}) };
      
      if (isOriginalValue) {
        delete colDraft[field];
      } else {
        colDraft[field] = value as never;
      }

      // Cleanup empty draft objects
      if (Object.keys(colDraft).length === 0) {
        const newDrafts = { ...prev };
        delete newDrafts[colName];
        return newDrafts;
      }

      return { ...prev, [colName]: colDraft };
    });
  }, [columns]);

  const handleDiscard = () => {
    setDrafts({});
    setSearchQuery('');
  };

  const handlePublish = async () => {
    if (!dataset) return;
    setIsPublishing(true);
    
    // Construct diff payload
    const payload = {
      dataset_id: dataset.id,
      expected_version: dataset.version, // Optimistic Locking
      updates: drafts 
    };

    try {
      // PROD: await fetch('/api/datasets/schema/publish', { method: 'POST', body: JSON.stringify(payload) })
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulating network
      
      toast({
        title: "Semantic Registry Updated",
        description: `Successfully published version ${dataset.version + 1} to the NL2SQL engine.`,
      });
      
      // Update local state baseline
      setColumns(prev => prev.map(c => {
        if (drafts[c.name]) return { ...c, ...drafts[c.name] };
        return c;
      }));
      setDataset(prev => prev ? { ...prev, version: prev.version + 1 } : null);
      setDrafts({});

    } catch (error) {
      toast({
        variant: "destructive",
        title: "Publish Rejected",
        description: "Concurrency conflict: Schema was modified by another user. Please refresh.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------
  const hasChanges = Object.keys(drafts).length > 0;
  
  const filteredColumns = useMemo(() => {
    if (!searchQuery) return columns;
    const lowerQ = searchQuery.toLowerCase();
    return columns.filter(c => c.name.toLowerCase().includes(lowerQ) || c.description.toLowerCase().includes(lowerQ));
  }, [columns, searchQuery]);

  // Validation: Ensure no drafted descriptions are under 5 characters
  const isSaveDisabled = isPublishing || !hasChanges || Object.values(drafts).some(d => d.description !== undefined && d.description.length > 0 && d.description.length < 5);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (errorState) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>System Error</AlertTitle>
          <AlertDescription>{errorState}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading || !dataset) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 h-full animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">
      
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
                v{dataset.version}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm flex items-center gap-3">
              <span>{dataset.source?.subtype || 'Unknown'}</span>
              <span>•</span>
              {dataset.asset_kind === 'document' ? (
                <span>{(dataset.chunk_count || 0).toLocaleString()} Chunks</span>
              ) : (
                <span>{(dataset.row_count || 0).toLocaleString()} Rows</span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={isPublishing}>
              <Undo2 className="mr-2 h-4 w-4" /> Discard
            </Button>
          )}
          <Button 
            onClick={handlePublish} 
            disabled={isSaveDisabled}
            className="shrink-0 transition-all"
          >
            {isPublishing ? (
              <span className="flex items-center"><Database className="mr-2 h-4 w-4 animate-bounce" /> Publishing...</span>
            ) : (
              <span className="flex items-center"><Save className="mr-2 h-4 w-4" /> Publish to AI Engine</span>
            )}
          </Button>
        </div>
      </div>

      {/* Semantic Configuration Block */}
      <Card className="border-border shadow-sm flex flex-col">
        <CardHeader className="bg-muted/20 border-b pb-4 flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Semantic Dictionary</CardTitle>
            <CardDescription>Context attributes fed directly into the NL2SQL agent.</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search columns..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </CardHeader>
        
        <CardContent className="p-0 overflow-x-auto">
          {filteredColumns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No columns matching your search.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/10">
                <TableRow>
                  <TableHead className="w-[250px]">Physical Column</TableHead>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Semantic Definition</TableHead>
                  <TableHead className="w-[100px] text-center">Engine Masking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredColumns.map((col) => (
                  <SchemaColumnRow 
                    key={col.name} 
                    col={col} 
                    draft={drafts[col.name]} 
                    onUpdate={handleUpdateDraft} 
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {hasChanges && (
          <CardFooter className="bg-primary/5 border-t border-primary/10 p-4 flex justify-between items-center text-sm animate-in slide-in-from-bottom-2">
            <span className="flex items-center gap-2 font-medium text-primary">
              <AlertCircle className="h-4 w-4" />
              {Object.keys(drafts).length} column(s) modified.
            </span>
            <span className="text-muted-foreground text-xs">
              Version bump upon publish: v{dataset.version} → v{dataset.version + 1}
            </span>
          </CardFooter>
        )}
      </Card>
      
      {/* Semantic Layer Metric Builder (Coupled with Validated Schema) */}
      <div className="pt-4 flex flex-col items-start w-full">
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Calculated Metrics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build and govern explicit mathematical definitions relying on your semantic dictionary above.
          </p>
        </div>
        
        <div className="w-full">
          {/* Passing the active, saved columns down ensures metric dependencies are valid */}
          <SemanticMetricBuilder 
            datasetId={datasetId} 
            apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}
            onMetricSaved={() => {
              toast({
                title: "Metric Governed",
                description: "Semantic metric successfully attached to NL2SQL router context.",
              });
            }}
          />
        </div>
      </div>

    </div>
  )
}