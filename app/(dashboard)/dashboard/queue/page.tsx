import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { RiskQueueShell, QueueErrorState } from "@/app/(dashboard)/dashboard/queue/RiskQueueShell";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import {
  type CustomerOperationsPage,
  type CustomerOperation,
  type OperationsMetrics,
} from "@/app/(dashboard)/dashboard/queue/risk-queue-client";

export const metadata = {
  title: "Customer Health | Arcli",
  description: "Spot struggling accounts early, take action, and track your wins.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Constants & Configuration ─────────────────────────────────────

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

const DEFAULT_METRICS: OperationsMetrics = {
  total_customers: 0,
  at_risk_count: 0,
  critical_count: 0,
  pending_count: 0,
  dead_letter_count: 0,
};

// ─── Input Sanitization & Validation ───────────────────────────────

/**
 * Sanitizes raw search input to prevent PostgREST syntax injection inside .or() filters.
 * Strips commas, parentheses, quotes, and control characters while preserving standard identifiers.
 */
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
  // Next.js 15+ treats searchParams as an asynchronous Promise
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// ─── Query Builder Filter Applicator ───────────────────────────────

function applyOperationFilters<T extends { eq: any; gte: any; or: any }>(
  query: T,
  tab: ValidTab,
  searchQuery: string
): T {
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

// ─── Page Component ────────────────────────────────────────────────

export default async function CustomerOperationsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const resolvedParams = await searchParams;

  // ── Layer 1: Authentication Boundary ─────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // ── Layer 2: Tenant Isolation & Verification (Rule 6) ────────────
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    console.error(
      JSON.stringify({
        event: "tenant_membership_resolution_failed",
        user_id: user.id,
        error: membershipError?.message ?? "no_membership_found",
      })
    );
    redirect("/unauthorized");
  }

  const { tenant_id: tenantId, role } = membership;

  // ── Layer 3: Role-Based Access Control ───────────────────────────
  if (!ALLOWED_ROLES.has(role as AllowedRole)) {
    console.warn(
      JSON.stringify({
        event: "unauthorized_role_access_attempt",
        tenant_id: tenantId,
        user_id: user.id,
        attempted_role: role,
      })
    );
    redirect("/unauthorized");
  }

  const entitlements = await getWorkspaceEntitlements(supabase as any, tenantId);
  if (!entitlements.canViewCustomerLists) {
    const lockedPageData: CustomerOperationsPage = {
      customers: [],
      metrics: DEFAULT_METRICS,
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        pageSize: PAGE_SIZE,
      },
    };

    return (
      <RiskQueueShell
        page={lockedPageData}
        isProTier={false}
        restrictionMessage={entitlements.restrictionMessage}
      />
    );
  }

  // ── Layer 4: Input Normalization ─────────────────────────────────
  const tab = parseTabParam(resolvedParams.tab);
  const query = parseQueryParam(resolvedParams.query);
  const rawPage = parsePageParam(resolvedParams.page);

  // ── Layer 5: Parallel Execution — Metrics + Count Query ──────────
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

  // ── Layer 6: Graceful Degradation for Metrics (Rule 3) ───────────
  const { data: metricsData, error: metricsError } = metricsResult;

  if (metricsError && metricsError.code !== "PGRST116") {
    console.warn(
      JSON.stringify({
        event: "metrics_fetch_degraded",
        tenant_id: tenantId,
        user_id: user.id,
        error_code: metricsError.code,
        error_message: metricsError.message,
      })
    );
  }

  const metrics: OperationsMetrics = metricsData
    ? (metricsData as OperationsMetrics)
    : DEFAULT_METRICS;

  // ── Layer 7: Pagination Bounds Clamping & Loop Guard ─────────────
  const totalItems = countResult.count ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const page = totalPages > 0 ? Math.min(rawPage, totalPages) : 1;

  // Redirect if URL requested an out-of-bounds page explicitly
  if (resolvedParams.page !== undefined && page !== rawPage) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.set(key, value);
      }
    }
    params.set("tab", tab);
    if (query) params.set("query", query);
    else params.delete("query");
    params.set("page", String(page));
    redirect(`?${params.toString()}`);
  }

  // ── Layer 8: Execute Data Projection within Clamped Range ────────
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: items, error: queueError } = await applyOperationFilters(
    supabase
      .from("vw_customer_operations")
      .select("*")
      .eq("tenant_id", tenantId),
    tab,
    query
  )
    .order("risk_score", { ascending: false })
    .range(from, to);

  // ── Layer 9: Fatal Error Boundary (Rule 17 Observability) ────────
  if (queueError) {
    console.error(
      JSON.stringify({
        event: "queue_fetch_failed",
        tenant_id: tenantId,
        user_id: user.id,
        error_code: queueError.code,
        error_message: queueError.message,
      })
    );
    return <QueueErrorState />;
  }

  // Cast through unknown to safely map Supabase untyped projections to domain models
  const customerOperations: CustomerOperation[] = (items ?? []) as unknown as CustomerOperation[];

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
    <RiskQueueShell
      page={pageData}
      isProTier={entitlements.isPro}
      restrictionMessage={entitlements.restrictionMessage}
    />
  );
}
