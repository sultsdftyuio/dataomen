'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Database, 
  AlertCircle,
  HardDrive,
  FileTerminal
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from '@/utils/supabase/client'

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface SyncDataset {
  id: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'ACTIVE' | 'FAILED';
  row_count: number | null;
  size_bytes: number;
  message: string;
}

// -----------------------------------------------------------------------------
// Helper Components
// -----------------------------------------------------------------------------
const StatusIcon = ({ status }: { status: SyncDataset['status'] }) => {
  switch (status) {
    case 'ACTIVE':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'FAILED':
      return <XCircle className="h-5 w-5 text-destructive" />;
    case 'PROCESSING':
      return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'PENDING':
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function SyncDashboard() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<SyncDataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // Simulated progress state for items currently "PROCESSING"
  const [simulatedProgress, setSimulatedProgress] = useState<Record<string, number>>({});

  // ---------------------------------------------------------------------------
  // Data Polling Orchestration
  // ---------------------------------------------------------------------------
  const fetchSyncStatus = useCallback(async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) setIsLoading(true);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      const response = await fetch('/api/datasets', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sync telemetry");
      }

      const data: SyncDataset[] = await response.json();
      setDatasets(data);
      setLastRefreshed(new Date());

      // Initialize progress for any new PROCESSING jobs
      data.forEach(ds => {
        if (ds.status === 'PROCESSING') {
          setSimulatedProgress(prev => ({
            ...prev,
            [ds.id]: prev[ds.id] || 10 // Start at 10% if newly discovered
          }));
        }
      });

    } catch (error) {
      console.error("Telemetry error:", error);
      if (!isBackgroundPoll) {
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Unable to reach the synchronization cluster.",
        });
      }
    } finally {
      if (!isBackgroundPoll) setIsLoading(false);
    }
  }, [toast]);

  // Initial Load
  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Polling Interval (every 5 seconds)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchSyncStatus(true);
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchSyncStatus]);

  // Artificial progress tick for UI responsiveness while backend crunches Parquet
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setSimulatedProgress(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          // Slowly tick up to 90%, waiting for the backend to finalize to ACTIVE
          if (next[id] < 90) {
            next[id] = next[id] + Math.random() * 5;
          }
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(tickInterval);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const activeSyncs = datasets.filter(d => d.status === 'PROCESSING' || d.status === 'PENDING').length;
  const failedSyncs = datasets.filter(d => d.status === 'FAILED').length;

  return (
    <Card className="border-border shadow-sm flex flex-col h-full bg-background/50 backdrop-blur-sm">
      <CardHeader className="border-b bg-muted/10 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Ingestion & Sync Telemetry
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2">
              Monitoring active background workers.
              <span className="text-[10px] uppercase font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                Updated: {lastRefreshed.toLocaleTimeString()}
              </span>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {failedSyncs > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {failedSyncs} Error{failedSyncs > 1 ? 's' : ''}
              </Badge>
            )}
            {activeSyncs > 0 ? (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                {activeSyncs} Active Sync{activeSyncs > 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                Idle
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-muted-foreground">
              <HardDrive className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No datasets connected yet.</p>
              <p className="text-xs mt-1">Upload a file or connect an integration to see sync telemetry.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {datasets.map((dataset) => (
                <div key={dataset.id} className="p-4 hover:bg-muted/10 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    
                    {/* Icon & Details */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcon status={dataset.status} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-foreground truncate font-mono">
                          {dataset.filename}
                        </h4>
                        
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {dataset.row_count !== null && (
                            <span className="flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              {(dataset.row_count).toLocaleString()} rows
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <FileTerminal className="h-3 w-3" />
                            {formatBytes(dataset.size_bytes)}
                          </span>
                        </div>

                        {/* Error Message Display */}
                        {dataset.status === 'FAILED' && (
                          <div className="mt-2 text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/20 flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-all">{dataset.message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Text & Actions */}
                    <div className="shrink-0 text-right">
                      <span className={`text-xs font-semibold tracking-wider uppercase ${
                        dataset.status === 'ACTIVE' ? 'text-emerald-500' :
                        dataset.status === 'FAILED' ? 'text-destructive' :
                        dataset.status === 'PROCESSING' ? 'text-blue-500' : 'text-muted-foreground'
                      }`}>
                        {dataset.status}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar for active jobs */}
                  {dataset.status === 'PROCESSING' && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-mono uppercase tracking-wider">
                        <span>Vectorizing to Parquet...</span>
                        <span>{Math.round(simulatedProgress[dataset.id] || 0)}%</span>
                      </div>
                      <Progress value={simulatedProgress[dataset.id] || 10} className="h-1.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="bg-muted/10 border-t py-2 px-4 flex justify-between items-center text-xs text-muted-foreground">
        <span>Powered by Hybrid Compute Engine</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => fetchSyncStatus()}>
          Force Refresh
        </Button>
      </CardFooter>
    </Card>
  )
}