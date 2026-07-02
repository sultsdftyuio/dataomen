import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CustomerOperationsClient, {
  type CustomerOperationsPage,
  type CustomerOperation,
  type OperationsMetrics,
} from "./risk-queue-client";

export const metadata = {
  title: "Customer Health | Arcli",
  description: "Spot struggling accounts early, take action, and track your wins.",
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

// ─── Design Tokens (matching your DeepDiveFeatures style) ────────

const C = {
  navy: "#0F172A",
  navySoft: "#475569",
  blue: "#3B9AE8",
  blueLight: "#60A5FA",
  muted: "#64748B",
  faint: "#94A3B8",
  red: "#EF4444",
  redLight: "#FCA5A5",
  amber: "#F59E0B",
  amberLight: "#FCD34D",
  green: "#10B981",
  greenLight: "#34D399",
  surface: "#FFFFFF",
  bg: "#FAFAFA",
  border: "1px solid rgba(0,0,0,0.08)",
  shadow: "0 1px 3px rgba(0,0,0,0.08)",
};

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

  const metrics: OperationsMetrics = metricsData
    ? (metricsData as OperationsMetrics)
    : defaultMetrics;
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
    <div className="flex-1 space-y-6 p-8 pt-6 w-full">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between space-y-2">
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              marginBottom: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            CUSTOMER HEALTH
          </div>
          <h2
            style={{
              fontSize: 32,
              color: C.navy,
              marginBottom: 8,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              fontWeight: 600,
            }}
          >
            Accounts needing attention
          </h2>
          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62, maxWidth: 560 }}>
            See which customers need a hand, reach out at the right time, and watch them get back on track.
          </p>
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Critical Accounts"
          value={metrics.critical_count}
          subtitle="Need immediate outreach"
          color={C.red}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
        <MetricCard
          title="Dead Letters"
          value={metrics.dead_letter_count}
          subtitle="Failed recovery attempts"
          color={C.amber}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          }
        />
        <MetricCard
          title="Pending Dispatches"
          value={metrics.pending_count}
          subtitle="Queued for outreach"
          color={C.blue}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <MetricCard
          title="At Risk Accounts"
          value={metrics.at_risk_count}
          subtitle="Showing warning signals"
          color={C.navySoft}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
        />
      </div>

      {/* ── Client Radar Screen ────────────────────────────────── */}
      <CustomerOperationsClient page={pageData} />
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  color,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
  icon: React.ReactNode;
}) {
  const isAlert = color === C.red;

  return (
    <div
      style={{
        borderRadius: 8,
        border: C.border,
        background: C.surface,
        boxShadow: C.shadow,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Colored top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
        }}
      />

      <div style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.faint,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </h3>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: `${color}12`,
              border: `1px solid ${color}28`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: color,
            }}
          >
            {icon}
          </div>
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: isAlert ? C.red : C.navy,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginBottom: 4,
          }}
        >
          {value}
        </div>

        {subtitle && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.muted,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────

function QueueErrorState() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6 w-full">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              marginBottom: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            CUSTOMER HEALTH
          </div>
          <h2
            style={{
              fontSize: 32,
              color: C.navy,
              marginBottom: 8,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              fontWeight: 600,
            }}
          >
            Accounts needing attention
          </h2>
        </div>
      </div>

      <div
        style={{
          borderRadius: 8,
          border: "1px solid rgba(239,68,68,0.2)",
          background: "rgba(239,68,68,0.04)",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            margin: "0 auto 16px",
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(239,68,68,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            style={{ width: 24, height: 24, color: C.red }}
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
        <h3 style={{ fontSize: 18, fontWeight: 600, color: C.navy, marginBottom: 8 }}>
          System Error
        </h3>
        <p
          style={{
            color: C.navySoft,
            fontSize: 15,
            lineHeight: 1.62,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          Failed to load the customer list. The database may be unavailable or experiencing high
          latency. Please refresh the page or contact engineering if this persists.
        </p>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.red,
            marginTop: 20,
            display: "inline-block",
            padding: "6px 14px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          Do not assume the queue is empty. This is a failure state, not a clear state.
        </p>
      </div>
    </div>
  );
}