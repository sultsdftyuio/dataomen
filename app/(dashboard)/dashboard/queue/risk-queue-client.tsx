// app/(dashboard)/dashboard/queue/risk-queue-client.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  MoreVertical, 
  Clock, 
  Mail, 
  AlertCircle,
  PlayCircle,
  Ban,
  RefreshCw,
  UserCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QueueItem {
  id: string;
  email: string;
  mrr: number;
  signal: string;
  signalType: "billing" | "cancellation" | "activity";
  status: string;
  cooldown: string | null;
  severity: "high" | "medium" | "critical" | "low";
}

// IDOR Fix: We no longer accept tenantId as a prop. 
export default function RiskQueueClient() {
  const { toast } = useToast();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Feature State: Filter & Action Menus
  const [filterOpen, setFilterOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchQueue = async () => {
      setLoading(true);
      try {
        // IDOR Fix: Removed ?tenant_id= parameter
        const res = await fetch(`/api/queue/active`);
        if (!res.ok) throw new Error("Failed to fetch active queue");
        
        const data = await res.json();
        if (mounted) setQueue(data.items || []);
      } catch (err) {
        console.error("Queue fetch error:", err);
        if (mounted) {
          setQueue([]); // Graceful fallback
          toast({
            title: "Connection Error",
            description: "Failed to load the deterministic risk queue.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchQueue();

    return () => {
      mounted = false;
    };
  }, [toast]); // Removed tenantId dependency

  // Deterministic Action: Force Execute Workflow Step
  const handleExecute = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch("/api/queue/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IDOR Fix: Removed tenant_id from payload
        body: JSON.stringify({ item_id: itemId })
      });
      
      if (res.ok) {
        setQueue(prev => prev.map(item => 
          item.id === itemId ? { ...item, status: "Execution Forced" } : item
        ));
        toast({
          title: "Workflow Forced",
          description: "Recovery action added to the execution queue.",
        });
      } else {
        throw new Error("API returned non-OK status");
      }
    } catch (err) {
      console.error("Force execute failed:", err);
      toast({
        title: "Execution Failed",
        description: "Could not force the recovery step. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Deterministic Action: Suppress/Skip User
  const handleSkip = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch("/api/queue/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IDOR Fix: Removed tenant_id from payload
        body: JSON.stringify({ item_id: itemId })
      });

      if (res.ok) {
        setQueue(prev => prev.filter(item => item.id !== itemId));
        toast({
          title: "User Suppressed",
          description: "User skipped and removed from active recovery.",
        });
      } else {
        throw new Error("API returned non-OK status");
      }
    } catch (err) {
      console.error("Skip action failed:", err);
      toast({
        title: "Suppression Failed",
        description: "Failed to skip user. The queue state remains unchanged.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Apply Search and Engine Severity Filters
  const filteredQueue = queue.filter(item => {
    const matchesSearch = item.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.signal.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter ? item.severity === severityFilter : true;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* ── Header & Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0A192F] tracking-tight">Active Risk Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Accounts currently flagged by deterministic churn signals.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-64 transition-all"
            />
          </div>
          
          {/* Functional Filter Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setFilterOpen(!filterOpen)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                severityFilter ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              {severityFilter ? `Risk: ${severityFilter.charAt(0).toUpperCase() + severityFilter.slice(1)}` : 'Filter'}
            </button>

            {filterOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Severity Filter</div>
                <button onClick={() => { setSeverityFilter(null); setFilterOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">All Risks</button>
                <button onClick={() => { setSeverityFilter("critical"); setFilterOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 font-medium">Critical</button>
                <button onClick={() => { setSeverityFilter("high"); setFilterOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 font-medium">High</button>
                <button onClick={() => { setSeverityFilter("medium"); setFilterOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 font-medium">Medium</button>
                <button onClick={() => { setSeverityFilter("low"); setFilterOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Low</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Data Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User / Account</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">MRR at Risk</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Deterministic Signal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Engine Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500 mt-2">Loading deterministic queue...</p>
                  </td>
                </tr>
              )}

              {!loading && filteredQueue.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                  
                  {/* User Column */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-[#0A192F]">{item.email}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{item.id}</div>
                  </td>

                  {/* MRR Column */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-[#0A192F]">${item.mrr}<span className="text-slate-400 text-xs">/mo</span></div>
                  </td>

                  {/* Signal Column */}
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium
                      ${item.signalType === 'billing' ? 'bg-rose-50 border-rose-200 text-rose-700' : ''}
                      ${item.signalType === 'cancellation' ? 'bg-purple-50 border-purple-200 text-purple-700' : ''}
                      ${item.signalType === 'activity' ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
                    `}>
                      {item.signalType === 'billing' && <AlertCircle className="h-3.5 w-3.5" />}
                      {item.signalType === 'cancellation' && <ShieldAlert className="h-3.5 w-3.5" />}
                      {item.signalType === 'activity' && <Clock className="h-3.5 w-3.5" />}
                      {item.signal}
                    </div>
                  </td>

                  {/* Status Column */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        {item.status.includes('Email') ? (
                          <Mail className="h-4 w-4 text-blue-500" />
                        ) : item.status.includes('Founder') ? (
                          <AlertCircle className="h-4 w-4 text-rose-500" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-amber-500 ml-1" />
                        )}
                        {item.status}
                      </div>
                      {item.cooldown && (
                        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold ml-6">
                          Cooldown: {item.cooldown}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 relative">
                      <button 
                        onClick={() => handleExecute(item.id)}
                        disabled={actionLoading === item.id}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        title="Force Execute Next Step"
                      >
                        {actionLoading === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      </button>
                      <button 
                        onClick={() => handleSkip(item.id)}
                        disabled={actionLoading === item.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        title="Skip / Suppress User"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      
                      {/* Functional User Drill-down Menu */}
                      <div className="relative">
                        <button 
                          onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openMenuId === item.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-left">
                            <Link 
                              href={`/dashboard/user/${item.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <UserCircle className="h-4 w-4 text-slate-400" />
                              View Deep Drill-down
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Empty State Fallback */}
          {!loading && filteredQueue.length === 0 && (
            <div className="p-12 text-center">
              <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-900">Queue is empty</h3>
              <p className="text-sm text-slate-500 mt-1">No active churn risks match your current filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}