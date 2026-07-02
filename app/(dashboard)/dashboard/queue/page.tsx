import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { RiskQueueShell, QueueErrorState } from "@/app/(dashboard)/dashboard/queue/RiskQueueShell";
import {
  type CustomerOperationsPage,
  type CustomerOperation,
  type OperationsMetrics,
} from "@/app/(dashboard)/dashboard/queue/risk-queue-client";

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

  return <RiskQueueShell page={pageData} />;
}