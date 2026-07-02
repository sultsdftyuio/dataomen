import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

import CustomerOperationsClient, { 
  type CustomerOperationsPage, 
  type CustomerOperation, 
  type OperationsMetrics 
} from "./risk-queue-client";



export const metadata = {
 title: "Customer Operations | Arcli",
description: "Air traffic control for customer retention and churn recovery.",
};



// ─── Constants ───────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(["owner", "admin", "operator"] as const);
type AllowedRole = "owner" | "admin" | "operator";

const VALID_TABS = new Set([
  "critical",
  "pending",
  "cooldown",
  "dead_lettered",
  "healthy",
  "all",
] as const);
type ValidTab = "critical" | "pending" | "cooldown" | "dead_lettered" | "healthy" | "all";

const PAGE_SIZE = 50;



// ─── Input Sanitization & Validation ───────────────────────────────

function sanitizeSearchQuery(raw: string): string {
  return raw.trim().replace(/[^\w\s@.-]/g, "");
}

function parsePageParam(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseTabParam(raw: string | string[] | undefined): ValidTab {
  if (typeof raw === "string" && VALID_TABS.has(raw as ValidTab)) {
    return raw as ValidTab;
  }
  return "critical";
}

function parseQueryParam(raw: string | string[] | undefined): string {
  if (typeof raw !== "string") return "";
  return sanitizeSearchQuery(raw);
}



// ─── Types ─────────────────────────────────────────────────────────

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}



// ─── Internal Filter Applicator ────────────────────────────────────

function applyOperationFilters(
  query: any,
  tab: ValidTab,
  searchQuery: string
) {
  let q = query;

  switch (tab) {
    case "critical":
      q = q.gte("risk_score", 70);
      break;
    case "pending":
      q = q.eq("state", "pending");
      break;
    case "cooldown":
      q = q.eq("state", "cooldown");
      break;
    case "dead_lettered":
      q = q.eq("state", "dead_lettered");
      break;
    case "healthy":
      q = q.eq("state", "healthy");
      break;
    case "all":
    default:
      break;
  }

  if (searchQuery) {
    q = q.or(
      `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,customer_id.ilike.%${searchQuery}%`
    );
  }

  return q;
}



// ─── Page Component ──────────────────────────────────────────────

export default async function CustomerOperationsPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // ── Layer 1: Authentication ────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // ── Layer 2: Tenant Resolution & Security ───────────────────────
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    redirect("/unauthorized");
  }

  const { tenant_id: tenantId, role } = membership;

  // ── Layer 3: Role-Based Authorization ───────────────────────────
  if (!ALLOWED_ROLES.has(role as any)) {
    redirect("/unauthorized");
  }

  // ── Layer 4: Input Validation & Normalization ───────────────────
  const tab = parseTabParam(searchParams.tab);
  const query = parseQueryParam(searchParams.query);
  const rawPage = parsePageParam(searchParams.page);

  // ── Layer 5: Parallel Execution — Metrics + Lightweight Count ───
  const [metricsResult, countResult] = await Promise.all([
    supabase
      .from("vw_customer_operations_metrics")
      .select("*")
      .eq("tenant_id", tenantId)
      .single(),
    applyOperationFilters(
      supabase
        .from("vw_customer_operations")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      tab,
      query
    ),
  ]);

  // ── Layer 6: Handle Metrics (Graceful Degradation) ──────────────
  const { data: metricsData, error: metricsError } = metricsResult;

  if (metricsError && metricsError.code !== "PGRST116") {
    console.warn("metrics_fetch_failed", {
      tenantId,
      userId: user.id,
      error: metricsError,
    });
  }

  const defaultMetrics: OperationsMetrics = {
    total_customers: 0,
    at_risk_count: 0,
    critical_count: 0,
    pending_count: 0,
    dead_letter_count: 0,
    total_mrr_at_risk: 0,
  };

  // ── Layer 7: Pagination Bounds & Clamping ───────────────────────
  const { count } = countResult;
  const totalItems = count ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const page = totalPages > 0 ? Math.min(rawPage, totalPages) : 1;

  if (page !== rawPage) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.set(key, value);
      }
    }
    params.set("tab", tab);
    if (query) {
      params.set("query", query);
    } else {
      params.delete("query");
    }
    params.set("page", String(page));
    redirect(`?${params.toString()}`);
  }

  // ── Layer 8: Execute Data Query with Validated Range ────────────
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: items, error: queueError } = await applyOperationFilters(
    supabase
      .from("vw_customer_operations")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId),
    tab,
    query
  )
    .order("risk_score", { ascending: false })
    .range(from, to);

  // ── Layer 9: Error Handling (Fatal DB Failure) ──────────────────
  if (queueError) {
    console.error("queue_fetch_failed", {
      tenantId,
      userId: user.id,
      error: queueError,
    });
    return <QueueErrorState />;
  }
  
  const metrics: OperationsMetrics = metricsData ? (metricsData as OperationsMetrics) : defaultMetrics;
  const customerOperations: CustomerOperation[] = items || [];
  const pageData: CustomerOperationsPage = {
    customers: customerOperations,
    metrics: metrics,
    pagination: {
      currentPage: page,
      totalPages: totalPages,
      totalItems: totalItems,
      pageSize: PAGE_SIZE,
    },
  };

  return (
<div className="flex-1 space-y-6 p-8 pt-6 max-w-full mx-auto">
        <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 style={{ fontSize: 42, color: "#0F172A", marginBottom: 8, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Risk Queues
          </h2>
          <p style={{ color: "#475569", fontSize: 17, lineHeight: 1.62 }}>
            Air traffic control for at-risk accounts. Triage, intervene, and monitor recovery pipelines.
          </p>
        </div>
      </div>

      {/* ── The Heads-Up Display (HUD) ─────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Critical Accounts"
          value={metrics.critical_count}
          variant={metrics.critical_count > 0 ? "alert" : "default"}
        />
        <MetricCard
          title="Dead Letters"
          value={metrics.dead_letter_count}
          variant={metrics.dead_letter_count > 0 ? "alert" : "default"}
        />
        <MetricCard title="Pending Dispatches" value={metrics.pending_count} />
        <MetricCard title="At Risk Accounts" value={metrics.at_risk_count} />
      </div>

      {/* ── The Radar Screen (Client Component) ────────────────── */}
      <CustomerOperationsClient page={pageData} />
    </div>
  );
}



// ─── Internal HUD Component ────────────────────────────────────────

type MetricVariant = "default" | "alert";

function MetricCard({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: string | number;
  variant?: MetricVariant;
}) {
  const isAlert = variant === "alert";
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  return (
    <div style={{ 
      borderRadius: 8, 
      border: surfaceBorder, 
      background: "#fff", 
      boxShadow: surfaceShadow,
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{ padding: "20px 20px 12px" }}>
        <h3 style={{ 
          fontSize: 11, 
          fontWeight: 600, 
          color: "#94A3B8", 
          letterSpacing: "0.05em", 
          textTransform: "uppercase",
          marginBottom: 8
        }}>
          {title}
        </h3>
        <div style={{ 
          fontSize: 28, 
          fontWeight: 700, 
          color: isAlert ? "#EF4444" : "#0F172A",
          letterSpacing: "-0.02em",
          lineHeight: 1.2
        }}>
          {value}
        </div>
      </div>
      {isAlert && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "#EF4444"
        }} />
      )}
    </div>
  );
}



// ─── Error State (When Queue Fetch Fails) ──────────────────────────

function QueueErrorState() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-full mx-auto">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 style={{ fontSize: 42, color: "#0F172A", marginBottom: 8, lineHeight: 1.06, letterSpacing: "-0.015em", fontWeight: 600 }}>
            Risk Queues
          </h2>
          <p style={{ color: "#475569", fontSize: 17, lineHeight: 1.62 }}>
            Air traffic control for at-risk accounts.
          </p>
        </div>
      </div>

      <div style={{ 
        borderRadius: 8, 
        border: "1px solid rgba(239,68,68,0.2)", 
        background: "rgba(239,68,68,0.04)", 
        padding: "48px 24px", 
        textAlign: "center" 
      }}>
        <div style={{ 
          margin: "0 auto 16px", 
          width: 48, 
          height: 48, 
          borderRadius: "50%", 
          background: "rgba(239,68,68,0.1)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center" 
        }}>
          <svg
            style={{ width: 24, height: 24, color: "#EF4444" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0F172A", marginBottom: 8 }}>System Error</h3>
        <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.62, maxWidth: 480, margin: "0 auto" }}>
          Failed to load the risk queue. The database may be unavailable or experiencing high
          latency. Please refresh the page or contact engineering if this persists.
        </p>
        <p style={{ 
          fontSize: 12, 
          fontWeight: 600, 
          color: "#EF4444", 
          marginTop: 20, 
          display: "inline-block", 
          padding: "6px 14px", 
          borderRadius: 6, 
          background: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(239,68,68,0.15)"
        }}>
          Do not assume the queue is empty. This is a failure state, not a clear state.
        </p>
      </div>
    </div>
  );
}