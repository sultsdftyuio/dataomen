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
  // Whitelist approach: only allow word characters, whitespace, @, ., and -.
  // This prevents malformed PostgREST filter strings while preserving
  // useful search characters for names, emails, and customer IDs.
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
// Applies tab and search filters to any PostgREST query builder instance.
// Typed as `any` internally because this is a pure, private helper with
// guaranteed inputs — the public API is fully typed above.
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

  // ── Layer 1: Authentication (Rule 1) ────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // ── Layer 2: Tenant Resolution & Security ───────────────────────
  // NOTE: .single() assumes a user belongs to exactly one tenant.
  // If multi-tenant membership is planned, replace with .maybeSingle()
  // and implement a tenant selection / active-tenant strategy.
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
  // Rule 13: Never load datasets into memory to calculate metrics.
  // We run a head-only count first to determine valid pagination bounds
  // BEFORE executing the actual data query. This prevents wasteful
  // high-offset queries when users request out-of-range pages.
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
  // NOTE: For tables with hundreds of thousands+ of rows, consider
  // switching count: "exact" to "planned" or "estimated" to avoid
  // the performance cost of an exact count.
  const { count } = countResult;
  const totalItems = count ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const page = totalPages > 0 ? Math.min(rawPage, totalPages) : 1;

  // Redirect to the last valid page if the requested page was out of range.
  // This happens BEFORE the data query, preventing huge wasteful offsets.
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
    pageSize: PAGE_SIZE, // Ensure PAGE_SIZE is available in this scope
    },
};
  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Risk Queues</h2>
          <p className="text-muted-foreground">
            Air traffic control for at-risk accounts. Triage, intervene, and monitor recovery pipelines.
          </p>
        </div>
      </div>

      {/* ── The Heads-Up Display (HUD) ─────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
        <MetricCard
          title="Total MRR at Risk"
          value={`$${metrics.total_mrr_at_risk.toLocaleString()}`}
        />
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

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium text-slate-500">{title}</h3>
      </div>
      <div className="p-6 pt-0">
        <div className={`text-3xl font-bold ${isAlert ? "text-red-500" : "text-slate-900"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Error State (When Queue Fetch Fails) ──────────────────────────
function QueueErrorState() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Risk Queues</h2>
          <p className="text-muted-foreground">
            Air traffic control for at-risk accounts.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg
            className="h-8 w-8 text-red-600"
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
        <h3 className="text-xl font-semibold text-red-900 mb-2">System Error</h3>
        <p className="text-red-700 max-w-md mx-auto">
          Failed to load the risk queue. The database may be unavailable or experiencing high
          latency. Please refresh the page or contact engineering if this persists.
        </p>
        <p className="text-sm font-medium text-red-600 mt-6 bg-white/50 inline-block px-4 py-2 rounded-md">
          Do not assume the queue is empty. This is a failure state, not a clear state.
        </p>
      </div>
    </div>
  );
} 