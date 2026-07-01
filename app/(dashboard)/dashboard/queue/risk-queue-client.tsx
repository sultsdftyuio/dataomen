"use client";

import React, { useState, useMemo } from "react";
import { 
  ShieldAlert, 
  Search, 
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
  X,
  UserPlus
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// ─── Helper: Easy-to-Understand Risk Levels ─────────────────────
const getRiskPriority = (score: number) => {
  if (score >= 70) return { 
    label: "High Risk", 
    icon: "🔴", 
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    borderColor: "border-l-red-500",
  };
  if (score >= 50) return { 
    label: "Medium Risk", 
    icon: "🟠", 
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    borderColor: "border-l-orange-500",
  };
  if (score >= 30) return { 
    label: "Low Risk", 
    icon: "🟡", 
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    borderColor: "border-l-yellow-500",
  };
  return { 
    label: "Healthy", 
    icon: "🟢", 
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    borderColor: "border-l-green-500",
  };
};

// ─── Helper: Plain English Status Badges ────────────────────────
const getStateBadge = (state: QueueItem["state"]) => {
  const stateMap: Record<QueueItem["state"], { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { 
      label: "Waiting to Contact", 
      variant: "default",
      icon: <Clock className="h-3 w-3 mr-1" />
    },
    processing: { 
      label: "Sending Email...", 
      variant: "secondary",
      icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
    },
    cooldown: { 
      label: "Recently Contacted (Paused)", 
      variant: "outline",
      icon: <Clock className="h-3 w-3 mr-1" />
    },
    suppressed: { 
      label: "Ignored", 
      variant: "outline",
      icon: <Ban className="h-3 w-3 mr-1" />
    },
    failed: { 
      label: "Error (Trying Again)", 
      variant: "destructive",
      icon: <AlertTriangle className="h-3 w-3 mr-1" />
    },
    dead_lettered: { 
      label: "Unreachable / Bounced", 
      variant: "destructive",
      icon: <ShieldAlert className="h-3 w-3 mr-1" />
    },
    completed: { 
      label: "Done", 
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

// ─── Helper: Plain English Warning Signs ───────────────────────
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

  // Humanize the type
  const humanReadableType = 
    signalType === "billing" ? "Payment Issue" :
    signalType === "cancellation" ? "Might Cancel" :
    signalType === "activity" ? "Low Activity" : signalType;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${styles[signalType as keyof typeof styles] || ""}`}>
      {icons[signalType as keyof typeof icons]}
      {signal || humanReadableType}
    </span>
  );
};

// ─── Plain English Tabs ─────────────────────────────────────────
const TABS: { value: TabValue; label: string; filter: (item: QueueItem) => boolean }[] = [
  { value: "critical", label: "Needs Attention", filter: (item) => item.risk_score >= 70 },
  { value: "pending", label: "Waiting", filter: (item) => item.state === "pending" },
  { value: "cooldown", label: "Paused", filter: (item) => item.state === "cooldown" },
  { value: "dead_lettered", label: "Unreachable", filter: (item) => item.state === "dead_lettered" },
  { value: "failures", label: "Errors", filter: (item) => item.state === "failed" },
  { value: "suppressed", label: "Ignored", filter: (item) => item.state === "suppressed" },
  { value: "all", label: "All Customers", filter: () => true },
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
          title: "Assigned to You",
          description: "You are now responsible for this customer.",
        });
      } else {
        throw new Error("Claim failed");
      }
    } catch (err) {
      toast({
        title: "Assignment Failed",
        description: "We couldn't assign this customer to you. Please try again.",
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
          title: "Customer Ignored",
          description: "We won't contact this customer about this issue.",
        });
      } else {
        throw new Error("Suppress failed");
      }
    } catch (err) {
      toast({
        title: "Action Failed",
        description: "We couldn't ignore this customer. Please try again.",
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
          title: "Action Started",
          description: "We are reaching out to the customer now.",
        });
      } else {
        throw new Error("Execute failed");
      }
    } catch (err) {
      toast({
        title: "Action Failed",
        description: "We couldn't contact the customer. Please try again.",
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
    <div className="space-y-6 animate-in fade-in duration-500 font-sans">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Customers at Risk</h1>
            <p className="text-sm text-slate-500 mt-1">
              Here are the customers showing warning signs that they might leave. We have {initialData.length} customers to review.
            </p>
          </div>

          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh List
          </button>
        </div>

        {/* ── Search Bar ───────────────────────────────────────── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, email, or reason..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full transition-all bg-white shadow-sm"
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
        <TabsList className="mb-4 flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-lg">
          {TABS.map(tab => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value}
              className={tab.value === "dead_lettered" ? "data-[state=active]:text-red-600 data-[state=active]:bg-white" : "data-[state=active]:bg-white"}
            >
              {tab.label}
              <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">
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
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-[12px] font-semibold text-slate-500">Customer</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Risk Level</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Monthly Revenue</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Status</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Next Step</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Assigned To</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500 text-right">Quick Actions</TableHead>
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
                  // Friendly Empty State
                  <TableRow>
                    <TableCell colSpan={7} className="h-64">
                      <div className="flex flex-col items-center justify-center text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
                        <h3 className="text-base font-semibold text-slate-900">
                          {searchQuery ? "No matches found" : "All clear!"}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                          {searchQuery 
                            ? `We couldn't find any customers matching "${searchQuery}".`
                            : "No customers in this category currently need your attention. Great job!"
                          }
                        </p>
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery("")}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Clear your search
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
                          ${isSuppressed ? "opacity-60 bg-slate-50" : ""}
                          ${isDeadLettered ? "bg-orange-50/30" : ""}
                        `}
                        onClick={() => setSelectedItem(item)}
                      >
                        {/* Customer Info */}
                        <TableCell className="py-4">
                          <div className="font-semibold text-slate-900">{item.customer_name}</div>
                          <div className="text-sm text-slate-500">{item.customer_email}</div>
                          {item.signal_type && (
                            <div className="mt-2">
                              {getSignalBadge(item.signal_type, item.signal)}
                            </div>
                          )}
                        </TableCell>

                        {/* Risk Level */}
                        <TableCell className="py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-medium ${priority.color}`}>
                            {priority.icon} {priority.label}
                          </span>
                        </TableCell>

                        {/* Money */}
                        <TableCell className="py-4 font-semibold text-slate-900">
                          ${item.mrr_at_risk?.toLocaleString() || 0}
                          <span className="text-slate-400 text-xs font-normal"> / month</span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-4">
                          {getStateBadge(item.state)}
                        </TableCell>

                        {/* Next Step Time */}
                        <TableCell className="py-4 text-sm text-slate-600">
                          {item.next_action_time ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              {formatDistanceToNow(new Date(item.next_action_time), { addSuffix: true })}
                            </div>
                          ) : (
                            <span className="text-slate-400">Nothing planned</span>
                          )}
                        </TableCell>

                        {/* Assigned To */}
                        <TableCell className="py-4 text-sm">
                          {item.assigned_to_name ? (
                            <div className="flex items-center gap-1.5">
                              <UserCircle className="h-4 w-4 text-blue-500" />
                              <span className="text-slate-700 font-medium">{item.assigned_to_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </TableCell>

                        {/* Quick Actions */}
                        <TableCell className="py-4 text-right">
                          <div 
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()} // Prevent opening details when clicking a button
                          >
                            {/* Claim / Assign to me */}
                            {!item.assigned_to_name && item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleClaim(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Assign this to me"
                              >
                                <UserPlus className="h-4 w-4" />
                              </button>
                            )}

                            {/* Take Action Now */}
                            {item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleForceExecute(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Take action immediately"
                              >
                                {actionLoading === item.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                              </button>
                            )}

                            {/* Ignore / Don't Contact */}
                            {item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleSuppress(item.id)}
                                disabled={actionLoading === item.id}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                title="Ignore this customer"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}

                            {/* More Menu */}
                            <div className="relative">
                              <button 
                                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {openMenuId === item.id && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-left">
                                  <button 
                                    onClick={() => { setSelectedItem(item); setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                    View Full Details
                                  </button>
                                  <div className="border-t border-slate-100 my-1" />
                                  <button 
                                    onClick={() => { setOpenMenuId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                                  >
                                    <Mail className="h-4 w-4" />
                                    View Past Emails
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
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-sm text-slate-500 flex justify-between items-center">
              <span>Showing {filteredData.length} of {initialData.length} customers</span>
              {searchQuery && (
                <span className="text-slate-400">
                  Filtered by: "{searchQuery}"
                </span>
              )}
            </div>
          )}
        </div>
      </Tabs>

      {/* ── Customer Details Drawer ────────────────────────────── */}
      <ExplainabilityDrawer 
        item={selectedItem} 
        isOpen={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />
    </div>
  );
}