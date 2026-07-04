"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ShieldCheck, 
  Clock, 
  RefreshCw, 
  Ban, 
  ShieldAlert 
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { C } from "@/lib/tokens";

// ─── Constants ─────────────────────────────────────────────────
export const SEARCH_DEBOUNCE_MS = 400;
export const HIGH_RISK_THRESHOLD = 70;
export const MEDIUM_RISK_THRESHOLD = 50;
export const LOW_RISK_THRESHOLD = 30;
export const ITEMS_PER_PAGE = 50;

export const currencyFormatter = new Intl.NumberFormat("en-US", {
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

export interface CustomerOperationsClientProps {
  page: CustomerOperationsPage;
  isProTier?: boolean;
  restrictionMessage?: string | null;
}

// ─── Token Helpers ─────────────────────────────────────────────
export const getRiskPriority = (score: number) => {
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

export const getStateBadge = (state: CustomerOperation["state"]) => {
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

export const getSignalBadge = (signalType?: string, signal?: string) => {
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

// ─── Hook ──────────────────────────────────────────────────────
export function useCustomerOperations(page: CustomerOperationsPage) {
  const { customers, metrics, pagination } = page;
  const { currentPage, totalPages, totalItems } = pagination;
  
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentTab = searchParams.get("tab") || "critical";
  const initialQuery = searchParams.get("query") || "";

  const [localSearch, setLocalSearch] = useState(initialQuery);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CustomerOperation | null>(null);

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

  const handleAction = async (itemId: string, endpoint: string, successMsg: string) => {
    setActionLoading(itemId);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId })
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

  return {
    customers,
    metrics,
    currentPage,
    totalPages,
    totalItems,
    currentTab,
    localSearch,
    setLocalSearch,
    isPending,
    actionLoading,
    selectedItem,
    setSelectedItem,
    updateUrlParams,
    handleAction,
    handleRowClick,
    handleRowKeyDown,
    startTransition,
    router,
  };
}
