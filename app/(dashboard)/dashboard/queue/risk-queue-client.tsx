"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
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
  ChevronLeft,
  X,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Info
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    useRouter,
    usePathname,
    useSearchParams,
} from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityDrawer } from "./explainability-drawer";

// ─── Constants ─────────────────────────────────────────────────
const SEARCH_DEBOUNCE_MS = 400;
const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 50;
const LOW_RISK_THRESHOLD = 30;
const ITEMS_PER_PAGE = 50;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// ─── Types ─────────────────────────────────────────────────────
export type CustomerOperation = {
  tenant_id: string;
  id: string;
  customer_id: string;
  name: string;           
  email: string;          
  risk_score: number;
  mrr_at_risk: number;
  state: 'healthy' | 'pending' | 'processing' | 'cooldown' | 'suppressed' | 'failed' | 'dead_lettered' | 'completed';
  next_action_time: string | null;
  assigned_to_name: string | null;
  signal?: string;
  signal_type?: "billing" | "cancellation" | "activity";
};

export type OperationsMetrics = {
  total_customers: number;
  at_risk_count: number;
  critical_count: number;
  pending_count: number;
  dead_letter_count: number;
  total_mrr_at_risk: number;
};

export type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
};

export type CustomerOperationsPage = {
  customers: CustomerOperation[];
  metrics: OperationsMetrics;
  pagination: PaginationInfo;
};

interface CustomerOperationsClientProps {
  page: CustomerOperationsPage;
}

// ─── Helpers ───────────────────────────────────────────────────
const getRiskPriority = (score: number) => {
  if (score >= HIGH_RISK_THRESHOLD) return { 
    label: "High Risk", 
    icon: <AlertCircle className="h-3.5 w-3.5 mr-1.5" />, 
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", 
    borderColor: "border-l-red-500",
  };
  if (score >= MEDIUM_RISK_THRESHOLD) return { 
    label: "Medium Risk", 
    icon: <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />, 
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", 
    borderColor: "border-l-orange-500",
  };
  if (score >= LOW_RISK_THRESHOLD) return { 
    label: "Low Risk", 
    icon: <Info className="h-3.5 w-3.5 mr-1.5" />, 
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", 
    borderColor: "border-l-yellow-500",
  };
  return { 
    label: "Healthy", 
    icon: <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />, 
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", 
    borderColor: "border-l-emerald-500",
  };
};

const getStateBadge = (state: CustomerOperation["state"]) => {
  const stateMap: Record<CustomerOperation["state"], { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    healthy: { 
      label: "No Action Needed", variant: "outline", icon: <ShieldCheck className="h-3 w-3 mr-1 text-emerald-500" />
    },
    pending: { 
      label: "Waiting to Contact", variant: "default", icon: <Clock className="h-3 w-3 mr-1" />
    },
    processing: { 
      label: "Sending Email...", variant: "secondary", icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
    },
    cooldown: { 
      label: "Recently Contacted", variant: "outline", icon: <Clock className="h-3 w-3 mr-1" />
    },
    suppressed: { 
      label: "Ignored", variant: "outline", icon: <Ban className="h-3 w-3 mr-1" />
    },
    failed: { 
      label: "Error (Trying Again)", variant: "destructive", icon: <AlertTriangle className="h-3 w-3 mr-1" />
    },
    dead_lettered: { 
      label: "Unreachable / Bounced", variant: "destructive", icon: <ShieldAlert className="h-3 w-3 mr-1" />
    },
    completed: { 
      label: "Done", variant: "secondary", icon: <CheckCircle2 className="h-3 w-3 mr-1" />
    },
  };
  const mapped = stateMap[state];
  return (
    <Badge variant={mapped.variant} className="flex items-center w-fit bg-white shadow-sm border-slate-200">
      {mapped.icon}
      {mapped.label}
    </Badge>
  );
};

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

// ─── Main Component ─────────────────────────────────────────────
export default function CustomerOperationsClient({ 
  page 
}: CustomerOperationsClientProps) {
  const { customers, metrics, pagination } = page;
  const { currentPage, totalPages, totalItems } = pagination;
  
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-driven state
  const currentTab = searchParams.get("tab") || "critical";
  const initialQuery = searchParams.get("query") || "";

  // Local state for immediate typing feedback (debounced to URL)
  const [localSearch, setLocalSearch] = useState(initialQuery);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CustomerOperation | null>(null);

  // Debounced Search Updater
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== initialQuery) {
        updateUrlParams({ query: localSearch, page: "1" });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [localSearch, initialQuery]);

  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [searchParams, pathname, router]);

  // ─── Secure Actions ─────────────────────────────────────────
  const handleAction = async (itemId: string, endpoint: string, successMsg: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }) // Server derives tenant from auth session
      });

      if (!res.ok) throw new Error("Action failed");

      toast({ title: "Success", description: successMsg });
      router.refresh();
    } catch (err) {
      toast({
        title: "Action Failed",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRowClick = (item: CustomerOperation) => {
    setSelectedItem(item);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, item: CustomerOperation) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedItem(item);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 font-sans">

      {/* ── Header & Global Metrics ─────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Customer Operations</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage churn risks, track recovery pipelines, and monitor overall base health.
            </p>
          </div>

          <button 
            onClick={() => { startTransition(() => router.refresh()); }}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, email, or reason..." 
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full transition-all bg-white shadow-sm"
          />
          {localSearch && (
            <button 
              onClick={() => setLocalSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs (Driven by Database Metrics) ──────────────── */}
      <Tabs value={currentTab} className="w-full" onValueChange={(val) => updateUrlParams({ tab: val, page: "1" })}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="critical" className="data-[state=active]:bg-white">
            Needs Attention <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">({metrics.critical_count})</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-white">
            Waiting <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">({metrics.pending_count})</span>
          </TabsTrigger>
          <TabsTrigger value="dead_lettered" className="data-[state=active]:bg-white data-[state=active]:text-red-600">
            Unreachable <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">({metrics.dead_letter_count})</span>
          </TabsTrigger>
          <TabsTrigger value="healthy" className="data-[state=active]:bg-white">
            Healthy <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">({metrics.total_customers - metrics.at_risk_count})</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-white">
            All Customers <span className="ml-1.5 text-[11px] text-slate-500 tabular-nums">({metrics.total_customers})</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Data Table ───────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[400px] flex flex-col">
          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-[12px] font-semibold text-slate-500">Customer</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Risk Level</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Monthly Revenue</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Queue State</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Next Step</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500">Assigned To</TableHead>
                  <TableHead className="text-[12px] font-semibold text-slate-500 text-right">Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isPending ? (
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
                ) : customers.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell colSpan={7} className="h-64">
                      <div className="flex flex-col items-center justify-center text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
                        <h3 className="text-base font-semibold text-slate-900">
                          {localSearch ? "No matches found" : "All clear!"}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                          {localSearch 
                            ? `We couldn't find any customers matching "${localSearch}".`
                            : "No customers in this category currently need your attention."
                          }
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((item) => {
                    const priority = getRiskPriority(item.risk_score);
                    const isSuppressed = item.state === "suppressed";
                    const isDeadLettered = item.state === "dead_lettered";
                    const isHealthy = item.state === "healthy";

                    return (
                      <TableRow 
                        key={item.id} 
                        tabIndex={0}
                        onClick={() => handleRowClick(item)}
                        onKeyDown={(e) => handleRowKeyDown(e, item)}
                        className={`
                          cursor-pointer hover:bg-slate-50/80 transition-colors group
                          border-l-4 ${priority.borderColor}
                          ${isSuppressed ? "opacity-60 bg-slate-50" : ""}
                          ${isDeadLettered ? "bg-orange-50/30" : ""}
                          focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30
                        `}
                      >
                        {/* Customer Info */}
                        <TableCell className="py-4">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-sm text-slate-500">{item.email}</div>
                          {item.signal_type && !isHealthy && (
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
                          {currencyFormatter.format(item.mrr_at_risk || 0)}
                          <span className="text-slate-400 text-xs font-normal"> / mo</span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-4">
                          {getStateBadge(item.state)}
                        </TableCell>

                        {/* Next Step Time */}
                        <TableCell className="py-4 text-sm text-slate-600">
                          {!isHealthy && item.next_action_time ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              {formatDistanceToNow(new Date(item.next_action_time), { addSuffix: true })}
                            </div>
                          ) : (
                            <span className="text-slate-400">--</span>
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
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            
                            {!isHealthy && !item.assigned_to_name && item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleAction(item.id, "/api/queue/claim", "Assigned to you.")}
                                disabled={actionLoading === item.id}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Assign to me"
                              >
                                <UserPlus className="h-4 w-4" />
                              </button>
                            )}

                            {!isHealthy && item.state !== "suppressed" && item.state !== "completed" && (
                              <>
                                <button 
                                  onClick={() => handleAction(item.id, "/api/queue/execute", "Action Started.")}
                                  disabled={actionLoading === item.id}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Force Execute Now"
                                >
                                  {actionLoading === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                                </button>
                                <button 
                                  onClick={() => handleAction(item.id, "/api/queue/skip", "Customer ignored.")}
                                  disabled={actionLoading === item.id}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Suppress / Ignore"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              </>
                            )}

                            {/* Dropdown Menu (Radix-based) */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button 
                                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setSelectedItem(item)}>
                                  <ChevronRight className="h-4 w-4 mr-2 text-slate-400" />
                                  View Full Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { /* Past engagement handler */ }}>
                                  <Mail className="h-4 w-4 mr-2 text-slate-400" />
                                  Past Engagement
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* ── Server-Side Pagination ───────────────────────── */}
          {!isPending && totalItems > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-slate-700">{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}</span> of <span className="font-medium text-slate-700">{totalItems}</span> customers
              </span>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => updateUrlParams({ page: String(currentPage - 1) })}
                  disabled={currentPage <= 1}
                  className="p-1.5 text-slate-500 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => updateUrlParams({ page: String(currentPage + 1) })}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 text-slate-500 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </Tabs>

      {/* ── Customer Details Drawer ────────────────────────── */}
      <ExplainabilityDrawer 
        item={selectedItem}
        isOpen={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
      />
    </div>
  );
}