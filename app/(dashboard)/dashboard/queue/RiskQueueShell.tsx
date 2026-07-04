"use client";

import React from "react";
import {
  Search,
  MoreVertical,
  Clock,
  Mail,
  PlayCircle,
  Ban,
  RefreshCw,
  UserCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  UserPlus,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ExplainabilityDrawer } from "./explainability-drawer";
import { C } from "@/lib/tokens";
import {
  CustomerOperationsClientProps,
  useCustomerOperations,
  getRiskPriority,
  getStateBadge,
  getSignalBadge,
  ITEMS_PER_PAGE,
  currencyFormatter,
} from "@/app/(dashboard)/dashboard/queue/customer-operations-logic";
import UpgradeButton from "@/components/ui/UpgradeButton";

export function RiskQueueShell({
  page,
  isProTier = true,
  restrictionMessage = "Upgrade to Pro to unlock customer lists, campaign sending, and custom templates.",
}: CustomerOperationsClientProps) {
  const {
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
  } = useCustomerOperations(page);

  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

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
      {!isProTier ? (
        <div
          style={{
            marginTop: 16,
            borderRadius: 8,
            border: surfaceBorder,
            background: C.white,
            boxShadow: surfaceShadow,
            padding: 40,
            minHeight: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 460 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: C.bluePale,
                color: C.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid rgba(27, 110, 191, 0.25)`,
              }}
            >
              <Lock size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>
                Customer operations are locked on Free Access
              </div>
              <p style={{ fontSize: 13, color: C.navySoft, margin: "6px 0 0" }}>
                {restrictionMessage}
              </p>
            </div>
            <UpgradeButton className="h-9 px-4 rounded-md bg-[#0B1120] hover:bg-slate-800" />
          </div>
        </div>
      ) : (
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
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly Revenue</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Queue State</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Step</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned To</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 700, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
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
                  <TableRow>
                    <TableCell colSpan={7} style={{ textAlign: "center", padding: 56 }}>
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
                        <TableCell style={{ padding: 14 }}>
                          <div style={{ fontWeight: 600, color: C.navy, fontSize: 13 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{item.email}</div>
                          {item.signal_type && !isHealthy && (
                            <div style={{ marginTop: 6 }}>
                              {getSignalBadge(item.signal_type, item.signal)}
                            </div>
                          )}
                        </TableCell>

                        <TableCell style={{ padding: 14 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: priority.color, background: priority.bg }}>
                            {priority.icon} {priority.label}
                          </span>
                        </TableCell>

                        <TableCell style={{ padding: 14, fontWeight: 600, color: C.navy, fontSize: 13 }}>
                          {currencyFormatter.format(item.mrr_at_risk || 0)}
                          <span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}> / mo</span>
                        </TableCell>

                        <TableCell style={{ padding: 14 }}>
                          {getStateBadge(item.state)}
                        </TableCell>

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
      )}

      <ExplainabilityDrawer
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}

export default RiskQueueShell;

export function QueueErrorState() {
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  return (
    <div
      style={{
        fontFamily: sans,
        minHeight: 360,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: C.white,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            background: C.redPale,
            color: C.red,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}
        >
          <AlertTriangle size={20} />
        </div>
        <h2 style={{ margin: 0, fontSize: 17, color: C.navy, fontWeight: 700 }}>
          Unable to load customer operations
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: C.navySoft }}>
          Please refresh the page. If this continues, contact support.
        </p>
      </div>
    </div>
  );
}
