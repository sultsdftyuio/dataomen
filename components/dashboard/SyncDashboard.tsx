// components/dashboard/SyncDashboard.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Database, 
  AlertCircle,
  HardDrive,
  FileText,
  Play,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from '@/utils/supabase/client';

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
  integration_name?: string; 
}

// -----------------------------------------------------------------------------
// Pure Helper Functions
// -----------------------------------------------------------------------------
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const StatusIcon = ({ status }: { status: SyncDataset['status'] }) => {
  switch (status) {
    case 'ACTIVE':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'FAILED':
      return <XCircle className="h-5 w-5 text-rose-500" />;
    case 'PROCESSING':
      return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'PENDING':
    default:
      return <Clock className="h-5 w-5 text-slate-400" />;
  }
};

const getFriendlyStatus = (status: SyncDataset['status']) => {
  switch (status) {
    case 'ACTIVE': return 'Connected';
    case 'FAILED': return 'Sync Error';
    case 'PROCESSING': return 'Syncing...';
    case 'PENDING': return 'Waiting';
    default: return status;
  }
};

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function SyncDashboard() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<SyncDataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // Simulated progress state for items currently "PROCESSING"
  const [simulatedProgress, setSimulatedProgress] = useState<Record<string, number>>({});
  
  // Refs for safe interval cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

      if (!response.ok) throw new Error("Failed to fetch connection status");

      const data: SyncDataset[] = await response.json();
      setDatasets(data);
      setLastRefreshed(new Date());

      // Initialize or reset progress for processing jobs
      setSimulatedProgress(prev => {
        const next = { ...prev };
        data.forEach(ds => {
          if (ds.status === 'PROCESSING') {
            next[ds.id] = prev[ds.id] || Math.floor(Math.random() * 15) + 5; // Start between 5-20%
          } else {
            delete next[ds.id]; // Clean up finished jobs
          }
        });
        return next;
      });

    } catch (error) {
      console.error("Telemetry error:", error);
      if (!isBackgroundPoll) {
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Unable to reach the synchronization server. We'll keep trying.",
        });
      }
    } finally {
      if (!isBackgroundPoll) setIsLoading(false);
    }
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Manual Sync Action
  // ---------------------------------------------------------------------------
  const triggerSync = async (datasetId: string) => {
    setIsTriggering(datasetId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      const response = await fetch(`/api/ingest/trigger/${datasetId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) throw new Error("Trigger failed");

      toast({
        title: "Sync Started",
        description: "We are securely pulling your latest data.",
      });

      fetchSyncStatus(true);
    } catch (error) {
      console.error("Trigger error:", error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Could not start the sync. Please try again in a moment.",
      });
    } finally {
      setIsTriggering(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Lifecycle Management
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchSyncStatus();

    // Background Polling (every 6 seconds)
    pollIntervalRef.current = setInterval(() => fetchSyncStatus(true), 6000);

    // Artificial progress tick for a responsive UI feel
    progressIntervalRef.current = setInterval(() => {
      setSimulatedProgress(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          // Asymptotic progress: slows down as it gets closer to 95%
          if (next[id] < 95) {
            const increment = Math.max(0.5, (95 - next[id]) * 0.05); 
            next[id] = Math.min(95, next[id] + increment);
          }
        });
        return next;
      });
    }, 1500);

    // Strict cleanup on unmount
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [fetchSyncStatus]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const activeSyncs = datasets.filter(d => d.status === 'PROCESSING' || d.status === 'PENDING').length;
  const failedSyncs = datasets.filter(d => d.status === 'FAILED').length;

  return (
    <Card className="border-slate-200 shadow-sm flex flex-col h-full bg-white">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-5">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Data Connections
            </CardTitle>
            <CardDescription className="mt-1.5 flex items-center gap-2 text-slate-500">
              Live status of your connected tools.
              <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-200/60 px-2 py-0.5 rounded-full text-slate-500">
                Updated: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </CardDescription>
          </div>
          
          <div className="flex gap-2">
            {failedSyncs > 0 && (
              <Badge variant="destructive" className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100">
                {failedSyncs} Error{failedSyncs > 1 ? 's' : ''}
              </Badge>
            )}
            {activeSyncs > 0 ? (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse mr-1.5" />
                {activeSyncs} Syncing
              </Badge>
            ) : (
              <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-50">
                All Systems Go
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : datasets.length === 0 ? (
            
            /* Enhanced Non-Technical Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in duration-500">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                <HardDrive className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No data sources connected</h3>
              <p className="text-sm text-slate-500 max-w-[250px] mb-6 leading-relaxed">
                Connect an app or upload a file to let the AI build your first dashboard.
              </p>
              <Button onClick={() => window.location.href = '/dashboard/onboarding'} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">
                Connect Data <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

          ) : (
            <div className="divide-y divide-slate-100">
              {datasets.map((dataset) => (
                <div key={dataset.id} className="p-5 hover:bg-slate-50/80 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    
                    {/* Icon & Details */}
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="mt-0.5 shrink-0 bg-white p-1 rounded-lg shadow-sm border border-slate-100">
                        <StatusIcon status={dataset.status} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                          {dataset.integration_name || dataset.filename}
                        </h4>
                        
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                          {dataset.row_count !== null && (
                            <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Database className="h-3 w-3" />
                              {(dataset.row_count).toLocaleString()} records
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <FileText className="h-3 w-3 text-slate-400" />
                            {formatBytes(dataset.size_bytes)}
                          </span>
                        </div>

                        {/* User-Friendly Error State */}
                        {dataset.status === 'FAILED' && (
                          <div className="mt-3 text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-100 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                              {dataset.message || "We lost connection to this source. Please try syncing again."}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Actions */}
                    <div className="shrink-0 text-right flex flex-col items-end gap-3">
                      <span className={`text-[11px] font-bold tracking-wider uppercase px-2 py-1 rounded-md ${
                        dataset.status === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50' :
                        dataset.status === 'FAILED' ? 'text-rose-700 bg-rose-50' :
                        dataset.status === 'PROCESSING' ? 'text-blue-700 bg-blue-50' : 'text-slate-500 bg-slate-100'
                      }`}>
                        {getFriendlyStatus(dataset.status)}
                      </span>

                      {(dataset.status === 'ACTIVE' || dataset.status === 'FAILED') && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-3 text-xs font-semibold gap-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all rounded-full border border-slate-200 hover:border-blue-200"
                          onClick={() => triggerSync(dataset.id)}
                          disabled={isTriggering === dataset.id}
                        >
                          {isTriggering === dataset.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3 fill-current" />
                          )}
                          Sync Now
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Clean Progress Bar */}
                  {dataset.status === 'PROCESSING' && (
                    <div className="mt-4 animate-in fade-in duration-300">
                      <div className="flex justify-between text-xs text-slate-500 mb-2 font-medium">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                          {dataset.integration_name 
                            ? `Securely pulling data from ${dataset.integration_name}...` 
                            : 'Optimizing file for AI analysis...'}
                        </span>
                        <span className="text-blue-600 font-bold">{Math.round(simulatedProgress[dataset.id] || 0)}%</span>
                      </div>
                      <Progress 
                        value={simulatedProgress[dataset.id] || 10} 
                        className="h-2 bg-slate-100 [&>div]:bg-blue-500 [&>div]:transition-all [&>div]:duration-500 [&>div]:ease-out" 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="bg-slate-50 border-t border-slate-100 py-3 px-5 flex justify-between items-center text-xs text-slate-500 font-medium">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Secure, read-only data sync
        </span>
        <button 
          onClick={() => fetchSyncStatus()}
          className="hover:text-slate-800 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </CardFooter>
    </Card>
  );
}