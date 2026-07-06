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
import { C } from "@/lib/tokens";

// ─── Constants ─────────────────────────────────────────────────
const SEARCH_DEBOUNCE_MS = 400;
const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 50;
const LOW_RISK_THRESHOLD = 30;
const ITEMS_PER_PAGE = 50;

// ─── Types ─────────────────────────────────────────────────────
export type CustomerOperation = {
  tenant_id: string;
  id: string;
  customer_id: string;
  name: string;           
  email: string;          
  risk_score: number;
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

// ─── Token Helpers ─────────────────────────────────────────────
const getRiskPriority = (score: number) => {
  if (score >= HIGH_RISK_THRESHOLD) return { 
    label: "High Risk", 
    icon: <AlertCircle size={13} style={{ marginRight: 4 }} />, 
    color: C.red,
    bg: C.redPale,
    borderColor: C.red,
  };
  if (score >= MEDIUM_RISK_THRESHOLD) return { 
    label: "Medium Risk", 
    icon: <AlertTriangle size={13} style={{ marginRight: 4 }} />, 
    color: "#92400E",
    bg: C.amberPale,
    borderColor: C.amber,
  };
  if (score >= LOW_RISK_THRESHOLD) return { 
    label: "Low Risk", 
    icon: <Info size={13} style={{ marginRight: 4 }} />, 
    color: "#854D0E",
    bg: "#FEF9C3",
    borderColor: "#EAB308",
  };
  return { 
    label: "Healthy", 
    icon: <CheckCircle2 size={13} style={{ marginRight: 4 }} />, 
    color: "#065F46",
    bg: C.greenPale,
    borderColor: C.green,
  };
};

const getStateBadge = (state: CustomerOperation["state"]) => {
  const stateMap: Record<CustomerOperation["state"], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    healthy: { label: "No Action Needed", color: C.green, bg: C.greenPale, icon: <ShieldCheck size={12} style={{ marginRight: 4 }} /> },
    pending: { label: "Waiting to Contact", color: C.blue, bg: C.bluePale, icon: <Clock size={12} style={{ marginRight: 4 }} /> },
    processing: { label: "Sending Email...", color: C.blueMid, bg: C.bluePale, icon: <RefreshCw size={12} className="animate-spin" style={{ marginRight: 4 }} /> },
    cooldown: { label: "Recently Contacted", color: C.navySoft, bg: C.offWhite, icon: <Clock size={12} style={{ marginRight: 4 }} /> },
    suppressed: { label: "Ignored", color: C.muted, bg: C.offWhite, icon: <Ban size={12} style={{ marginRight: 4 }} /> },
    failed: { label: "Error (Trying Again)", color: C.red, bg: C.redPale, icon: <AlertTriangle size={12} style={{ marginRight: 4 }} /> },
    dead_lettered: { label: "Unreachable / Bounced", color: C.red, bg: C.redPale, icon: <ShieldAlert size={12} style={{ marginRight: 4 }} /> },
    completed: { label: "Done", color: C.green, bg: C.greenPale, icon: <CheckCircle2 size={12} style={{ marginRight: 4 }} /> },
  };
  const mapped = stateMap[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: mapped.color, background: mapped.bg, border: `1px solid ${mapped.color}30` }}>
      {mapped.icon}
      {mapped.label}
    </span>
  );
};

const getSignalBadge = (signalType?: string, signal?: string) => {
  if (!signalType) return null;
  const humanReadableType = 
    signalType === "billing" ? "Payment Issue" :
    signalType === "cancellation" ? "Might Cancel" :
    signalType === "activity" ? "Low Activity" : signalType;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: C.amberPale, color: "#92400E", border: `1px solid rgba(245, 158, 11, 0.3)` }}>
      <AlertTriangle size={11} />
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

  // Unified styling constants matching the Arcli design system
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

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
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease-in" }}>

      {/* ── Header & Global Metrics ─────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="pfd" style={{ fontSize: 24, fontWeight: 700, color: C.navy, margin: 0, letterSpacing: "-0.02em" }}>
              Customer Operations
            </h1>
            <p style={{ fontSize: 13, color: C.navySoft, margin: "4px 0 0 0" }}>
              Manage churn risks, track recovery pipelines, and monitor overall base health.
            </p>
          </div>

          <button 
            onClick={() => { startTransition(() => router.refresh()); }}
            disabled={isPending}
            style={{
              height: 36,
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: C.white,
              border: surfaceBorder,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: C.navySoft,
              cursor: isPending ? "not-allowed" : "pointer",
              boxShadow: surfaceShadow,
            }}
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <div style={{ position: "relative", maxWidth: 440, width: "100%" }}>
          <Search size={15} color={C.muted} style={{ position: "absolute", left: 12, top: 11 }} />
          <input 
            type="text" 
            placeholder="Search by name, email, or reason..." 
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              width: "100%",
              height: 36,
              padding: "0 34px",
              borderRadius: 6,
              border: surfaceBorder,
              background: C.white,
              fontSize: 13,
              color: C.navy,
              outline: "none",
              boxShadow: surfaceShadow,
            }}
          />
          {localSearch && (
            <button 
              onClick={() => setLocalSearch("")}
              style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", cursor: "pointer", color: C.muted }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs (Driven by Database Metrics) ──────────────── */}
      <Tabs value={currentTab} onValueChange={(val) => updateUrlParams({ tab: val, page: "1" })}>
        <TabsList style={{ background: C.offWhite, border: surfaceBorder, padding: 4, borderRadius: 8, display: "flex", flexWrap: "wrap", height: "auto", gap: 4 }}>
          <TabsTrigger value="critical" style={{ fontSize: 12, fontWeight: 600 }}>
            Needs Attention <span style={{ marginLeft: 6, opacity: 0.7 }}>({metrics.critical_count})</span>
          </TabsTrigger>
          <TabsTrigger value="pending" style={{ fontSize: 12, fontWeight: 600 }}>
            Waiting <span style={{ marginLeft: 6, opacity: 0.7 }}>({metrics.pending_count})</span>
          </TabsTrigger>
          <TabsTrigger value="dead_lettered" style={{ fontSize: 12, fontWeight: 600, color: currentTab === "dead_lettered" ? C.red : undefined }}>
            Unreachable <span style={{ marginLeft: 6, opacity: 0.7 }}>({metrics.dead_letter_count})</span>
          </TabsTrigger>
          <TabsTrigger value="healthy" style={{ fontSize: 12, fontWeight: 600 }}>
            Healthy <span style={{ marginLeft: 6, opacity: 0.7 }}>({metrics.total_customers - metrics.at_risk_count})</span>
          </TabsTrigger>
          <TabsTrigger value="all" style={{ fontSize: 12, fontWeight: 600 }}>
            All Customers <span style={{ marginLeft: 6, opacity: 0.7 }}>({metrics.total_customers})</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Data Table ───────────────────────────────────── */}
        <div style={{ marginTop: 16, borderRadius: 8, border: surfaceBorder, background: C.white, boxShadow: surfaceShadow, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <Table>
              <TableHeader style={{ background: C.offWhite, borderBottom: surfaceBorder }}>
                <TableRow>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Risk Level</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Queue State</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Step</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned To</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  // Loading Skeletons
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : customers.length === 0 ? (
                  // Empty State
                  <TableRow>
                    <TableCell colSpan={6} style={{ textAlign: "center", padding: 56 }}>
                      <CheckCircle2 size={38} color={C.green} style={{ margin: "0 auto 12px" }} />
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.navy }}>
                        {localSearch ? "No matches found" : "All clear!"}
                      </div>
                      <p style={{ fontSize: 13, color: C.muted, margin: "4px auto 0", maxWidth: 360 }}>
                        {localSearch 
                          ? `We couldn't find any customers matching "${localSearch}".`
                          : "No customers in this category currently need your attention."
                        }
                      </p>
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
                        style={{
                          cursor: "pointer",
                          borderLeft: `4px solid ${priority.borderColor}`,
                          background: isDeadLettered ? "rgba(245, 158, 11, 0.05)" : isSuppressed ? C.offWhite : C.white,
                          opacity: isSuppressed ? 0.6 : 1,
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* Customer Info */}
                        <TableCell style={{ padding: 14 }}>
                          <div style={{ fontWeight: 600, color: C.navy, fontSize: 13 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{item.email}</div>
                          {item.signal_type && !isHealthy && (
                            <div style={{ marginTop: 6 }}>
                              {getSignalBadge(item.signal_type, item.signal)}
                            </div>
                          )}
                        </TableCell>

                        {/* Risk Level */}
                        <TableCell style={{ padding: 14 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: priority.color, background: priority.bg }}>
                            {priority.icon} {priority.label}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell style={{ padding: 14 }}>
                          {getStateBadge(item.state)}
                        </TableCell>

                        {/* Next Step Time */}
                        <TableCell style={{ padding: 14, fontSize: 12, color: C.navySoft }}>
                          {!isHealthy && item.next_action_time ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Clock size={13} color={C.muted} />
                              {formatDistanceToNow(new Date(item.next_action_time), { addSuffix: true })}
                            </div>
                          ) : (
                            <span style={{ color: C.faint }}>--</span>
                          )}
                        </TableCell>

                        {/* Assigned To */}
                        <TableCell style={{ padding: 14, fontSize: 12 }}>
                          {item.assigned_to_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <UserCircle size={15} color={C.blue} />
                              <span style={{ color: C.navy, fontWeight: 500 }}>{item.assigned_to_name}</span>
                            </div>
                          ) : (
                            <span style={{ color: C.muted, fontStyle: "italic" }}>Unassigned</span>
                          )}
                        </TableCell>

                        {/* Quick Actions */}
                        <TableCell style={{ padding: 14, textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                            
                            {!isHealthy && !item.assigned_to_name && item.state !== "suppressed" && item.state !== "completed" && (
                              <button 
                                onClick={() => handleAction(item.id, "/api/queue/claim", "Assigned to you.")}
                                disabled={actionLoading === item.id}
                                style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.blue }}
                                title="Assign to me"
                              >
                                <UserPlus size={15} />
                              </button>
                            )}

                            {!isHealthy && item.state !== "suppressed" && item.state !== "completed" && (
                              <>
                                <button 
                                  onClick={() => handleAction(item.id, "/api/queue/execute", "Action Started.")}
                                  disabled={actionLoading === item.id}
                                  style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.green }}
                                  title="Force Execute Now"
                                >
                                  {actionLoading === item.id ? <RefreshCw size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                                </button>
                                <button 
                                  onClick={() => handleAction(item.id, "/api/queue/skip", "Customer ignored.")}
                                  disabled={actionLoading === item.id}
                                  style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.red }}
                                  title="Suppress / Ignore"
                                >
                                  <Ban size={15} />
                                </button>
                              </>
                            )}

                            {/* Dropdown Menu (Radix-based) */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                                  <MoreVertical size={15} />
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
            <div style={{ padding: "14px 20px", borderTop: surfaceBorder, background: C.offWhite, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.muted }}>
                Showing <strong style={{ color: C.navy }}>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong style={{ color: C.navy }}>{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}</strong> of <strong style={{ color: C.navy }}>{totalItems}</strong> customers
              </span>
              
              <div style={{ display: "flex", gap: 6 }}>
                <button 
                  onClick={() => updateUrlParams({ page: String(currentPage - 1) })}
                  disabled={currentPage <= 1}
                  style={{ padding: "4px 8px", background: C.white, border: surfaceBorder, borderRadius: 6, cursor: currentPage <= 1 ? "not-allowed" : "pointer", color: C.navySoft }}
                >
                  <ChevronLeft size={15} />
                </button>
                <button 
                  onClick={() => updateUrlParams({ page: String(currentPage + 1) })}
                  disabled={currentPage >= totalPages}
                  style={{ padding: "4px 8px", background: C.white, border: surfaceBorder, borderRadius: 6, cursor: currentPage >= totalPages ? "not-allowed" : "pointer", color: C.navySoft }}
                >
                  <ChevronRight size={15} />
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
