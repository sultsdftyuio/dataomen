"use client";

import React, { useState, useMemo } from "react";
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  MoreVertical, 
  Clock, 
  Mail,
  PlayCircle,
  Ban,
  RefreshCw,
  UserCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  X
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityDrawer } from "./explainability-drawer";

// ─── Types ──────────────────────────────────────────────────────
export type QueueItem = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  risk_score: number;
  mrr_at_risk: number;
  state: 'pending' | 'processing' | 'cooldown' | 'suppressed' | 'failed' | 'dead_lettered' | 'completed';
  next_action_time: string | null;
  assigned_to_name: string | null;
  signal?: string;
  signal_type?: "billing" | "cancellation" | "activity";
};

interface RiskQueueClientProps {
  initialData: QueueItem[];
}

type TabValue = "critical" | "dead_lettered" | "pending" | "cooldown" | "failures" | "suppressed" | "all";

// ─── Helper: Risk Priority Visuals ──────────────────────────────
const getRiskPriority = (score: number) => {
  if (score >= 70) return { 
    label: "Critical", 
    icon: "🔴", 
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    borderColor: "border-l-red-500",
    badgeVariant: "destructive" as const
  };
  if (score >= 50) return { 
    label: "High", 
    icon: "🟠", 
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    borderColor: "border-l-orange-500",
    badgeVariant: "default" as const
  };
  if (score >= 30) return { 
    label: "Medium", 
    icon: "🟡", 
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    borderColor: "border-l-yellow-500",
    badgeVariant: "secondary" as const
  };
  return { 
    label: "Low", 
    icon: "🟢", 
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    borderColor: "border-l-green-500",
    badgeVariant: "outline" as const
  };
};

// ─── Helper: State Badges ───────────────────────────────────────
const getStateBadge = (state: QueueItem["state"]) => {
  const stateMap: Record<QueueItem["state"], { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { 
      label: "Pending Dispatch", 
      variant: "default",
      icon: <Clock className="h-3 w-3 mr-1" />
    },
    processing: { 
      label: "Processing", 
      variant: "secondary",
      icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
    },
    cooldown: { 
      label: "Cooldown Locked", 
      variant: "outline",
      icon: <Clock className="h-3 w-3 mr-1" />
    },
    suppressed: { 
      label: "Suppressed", 
      variant: "outline",
      icon: <Ban className="h-3 w-3 mr-1" />
    },
    failed: { 
      label: "Failed (Retrying)", 
      variant: "destructive",
      icon: <AlertTriangle className="h-3 w-3 mr-1" />
    },
    dead_lettered: { 
      label: "Dead Lettered", 
      variant: "destructive",
      icon: <ShieldAlert className="h-3 w-3 mr-1" />
    },
    completed: { 
      label: "Completed", 
      variant: "secondary",
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />
    },
  };
  const mapped = stateMap[state];
  return (
    <Badge variant={mapped.variant} className="flex items-center w-fit">
      {mapped.icon}
      {mapped.label}
    </Badge>
  );
};

// ─── Helper: Signal Type Badges (from old version) ─────────────
const getSignalBadge = (signalType?: string, signal?: string) => {
  if (!signalType) return null;

  const styles = {
    billing: "bg-rose-50 border-rose-200 text-rose-700",
    cancellation: "bg-purple-50 border-purple-200 text-purple-700",
    activity: "bg-amber-50 border-amber-200 text-amber-700"
  };

  const icons = {
    billing: <AlertTriangle className="h-3 w-3" />,
    cancellation: <ShieldAlert className="h-3 w-3" />,
    activity: <Clock className="h-3 w-3" />
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${styles[signalType as keyof typeof styles] || ""}`}>
      {icons[signalType as keyof typeof icons]}
      {signal || signalType}
    </span>
  );
};

// ─── Tab Configuration ─────────────────────────────────────────
const TABS: { value: TabValue; label: string; filter: (item: QueueItem) => boolean }[] = [
  { value: "critical", label: "Critical", filter: (item) => item.risk_score >= 70 },
  { value: "dead_lettered", label: "Dead Lettered", filter: (item) => item.state === "dead_lettered" },
  { value: "pending", label: "Pending", filter: (item) => item.state === "pending" },
  { value: "cooldown", label: "Cooldowns", filter: (item) => item.state === "cooldown" },
  { value: "failures", label: "Failures", filter: (item) => item.state === "failed" },
  { value: "suppressed", label: "Suppressed", filter: (item) => item.state === "suppressed" },
  { value: "all", label: "All", filter: () => true },
];

// ─── Main Component ─────────────────────────────────────────────
export default function RiskQueueClient({ initialData }: RiskQueueClientProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabValue>("critical");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Actions ──────────────────────────────────────────────────
  const handleClaim = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch("/api/queue/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId })
      });

      if (res.ok) {
        toast({
          title: "Claimed",
          description: "Account assigned to you.",
        });
      } else {
        throw new Error("Claim failed");
      }
    } catch (err) {
      toast({
        title: "Claim Failed",
        description: "Could not assign account. Try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuppress = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch("/api/queue/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId })
      });

      if (res.ok) {
        toast({
          title: "User Suppressed",
          description: "Account removed from active recovery.",
        });
      } else {
        throw new Error("Suppress failed");
      }
    } catch (err) {
      toast({
        title: "Suppression Failed",
        description: "Could not suppress account. Queue unchanged.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceExecute = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch("/api/queue/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId })
      });

      if (res.ok) {
        toast({
          title: "Workflow Forced",
          description: "Recovery action queued for execution.",
        });
      } else {
        throw new Error("Execute failed");
      }
    } catch (err) {
      toast({
        title: "Execution Failed",
        description: "Could not force recovery step.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // In production: revalidate or router.refresh()
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // ─── Filtering & Search ───────────────────────────────────────
  const filteredData = useMemo(() => {
    const tabFiltered = initialData.filter(TABS.find(t => t.value === activeTab)?.filter || (() => true));

    if (!searchQuery.trim()) return tabFiltered;

    const query = searchQuery.toLowerCase();
    return tabFiltered.filter(item => 
      item.customer_name?.toLowerCase().includes(query) ||
      item.customer_email?.toLowerCase().includes(query) ||
      item.customer_id?.toLowerCase().includes(query) ||
      item.signal?.toLowerCase().includes(query)
    );
  }, [initialData, activeTab, searchQuery]);

  // ─── Tab Counts ─────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    TABS.forEach(tab => {
      counts[tab.value] = initialData.filter(tab.filter).length;
    });
    return counts;
  }, [initialData]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#0A192F] tracking-tight">Active Risk Queue</h1>
            <p className="text-sm text-slate-500 mt-1">
              Accounts flagged by deterministic churn signals. {initialData.length} total in system.
            </p>
          </div>

          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Search Bar (from old version) ────────────────────── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, email, company, or signal..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full transition-all bg-white"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs with Counts ───────────────────────────────────── */}
      <Tabs defaultValue="critical" className="w-full" onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {TABS.map(tab => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value}
              className={tab.value === "dead_lettered" ? "text-red-500 data-[state=active]:text-red-600 data-[state=active]:bg-red-50" : ""}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] font-medium text-slate-400 tabular-nums">
                ({tabCounts[tab.value]})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Data Table ───────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[400px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Priority</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">MRR at Risk</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">State</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Next Action</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned To</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isRefreshing ? (
                  // Loading Skeletons
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredData.length === 0 ? (
                  // Polished Empty State (from old version)
                  <TableRow>
                    <TableCell colSpan={7} className="h-64">
                      <div className="flex flex-col items-center justify-center text-center">
                        <ShieldAlert className="h-10 w-10 text-slate-300 mb-3" />
                        <h3 className="text-sm font-medium text-slate-900">
                          {searchQuery ? "No matches found" : "Queue clear"}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                          {searchQuery 
                            ? `No accounts match "${searchQuery}" in the ${TABS.find(t => t.value === activeTab)?.label} queue.`
                            : "No active churn risks match your current filters."
                          }
                        </p>
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery("")}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item) => {
                    const priority = getRiskPriority(item.risk_score);
                    const isSuppressed = item.state === "suppressed";
                    const isDeadLettered = item.state === "dead_lettered";

                    return (
                      <TableRow 
                        key={item.id} 
                        className={`
                          cursor-pointer hover:bg-slate-50/80 transition-colors group
                          border-l-4 ${priority.borderColor}
                          ${isSuppressed ? "opacity-60" : ""}
                          ${isDeadLettered ? "bg-orange-50/30" : ""}
                        `}
                        onClick={() => setSelectedItem(item)}
                      >
                        {/* Customer */}
                        <TableCell className="py-4">
                          <div className="font-medium text-[#0A192F]">{item.customer_name}</div>
                          <div className="text-sm text-slate-500">{item.customer_email}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.customer_id}</div>
                          {item.signal_type && (
                            <div className="mt-1.5">
                              {getSignalBadge(item.signal_type, item.signal)}
                            </div>
                          )}
                        </TableCell>

                        {/* Risk Priority */}
                        <TableCell className="py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${priority.color}`}>
                            {priority.icon} {priority.label} ({item.risk_score})
                          </span>
                        </TableCell>

                        {/* MRR */}
                        <TableCell className="py-4 font-medium text-[#0A192F]">
                          ${item.mrr_at_risk?.toLocaleString() || 0}
                          <span className="text-slate-400 text-xs font-normal">/mo</span>
                        </TableCell>

                        {/* State */}
                        <TableCell className="py-4">
                          {getStateBadge(item.state)}
                        </TableCell>

                        {/* Next Action */}
                        <TableCell className="py-4 text-sm text-slate-500">
                          {item.next_action_time ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              {formatDistanceToNow(new Date(item.next_action_time), { addSuffix: true })}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>

                        {/* Assigned To */}
                        <TableCell className="py-4 text-sm">
                          {item.assigned_to_name ? (
                            <div className="flex items-center gap-1.5">
                              <UserCircle className="h-4 w-4 text-blue-500" />
                              <span className="text-slate-700">{item.assigned_to_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </TableCell>

                        {/* Actions (from old version) */}
                        <TableCell className="py-4 text-right">
                          <div 
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()} // Prevent row click
                          >
                            {/* Claim */}
                            {!item.assigned_to_name && item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleClaim(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Claim Account"
                              >
                                <UserCircle className="h-4 w-4" />
                              </button>
                            )}

                            {/* Force Execute */}
                            {item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleForceExecute(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Force Execute Next Step"
                              >
                                {actionLoading === item.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                              </button>
                            )}

                            {/* Suppress */}
                            {item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleSuppress(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Suppress / Skip"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}

                            {/* More Menu */}
                            <div className="relative">
                              <button 
                                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {openMenuId === item.id && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-left">
                                  <button 
                                    onClick={() => { setSelectedItem(item); setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                    View Deep Drill-down
                                  </button>
                                  <div className="border-t border-slate-100 my-1" />
                                  <button 
                                    onClick={() => { setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
                                  >
                                    <Mail className="h-4 w-4" />
                                    View Email History
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer: Results count */}
          {!isRefreshing && filteredData.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500 flex justify-between items-center">
              <span>Showing {filteredData.length} of {initialData.length} accounts</span>
              {searchQuery && (
                <span className="text-slate-400">
                  Filtered by: "{searchQuery}"
                </span>
              )}
            </div>
          )}
        </div>
      </Tabs>

      {/* ── Explainability Drawer ──────────────────────────────── */}
      <ExplainabilityDrawer 
        item={selectedItem} 
        isOpen={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />
    </div>
  );
}