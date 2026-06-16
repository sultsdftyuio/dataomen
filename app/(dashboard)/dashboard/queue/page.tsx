import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RiskQueueClient from "./risk-queue-client";

export const metadata = {
  title: "Risk Queues | Arcli",
  description: "Air traffic control for customer retention.",
};

// ─── Types ─────────────────────────────────────────────────────────
// Must stay synchronized with RiskQueueClientProps["initialData"][number]
type QueueItem = {
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

type MembershipRole = 'owner' | 'admin' | 'operator' | 'viewer' | 'billing_only';

interface Membership {
  tenant_id: string;
  role: MembershipRole;
}

// ─── Page Component ──────────────────────────────────────────────────
export default async function RiskQueuePage() {
  const supabase = createClient();

  // ── Layer 1: Authentication ─────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // ── Layer 2: Tenant Resolution (Immutable Membership Table) ───
  // SECURITY: Using tenant_memberships instead of users.tenant_id
  // prevents accidental tenant boundary drift if the users table is modified.
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users"))
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    // Authorization problem, not an application crash
    redirect("/unauthorized");
  }

  const { tenant_id: tenantId, role } = membership;

  // ── Layer 3: Role-Based Authorization ───────────────────────────
  // Only owners, admins, and operators can view and intervene on the queue.
  // Viewers and billing-only users are redirected.
  const allowedRoles: MembershipRole[] = ['owner', 'admin', 'operator'];
  if (!allowedRoles.includes(role)) {
    redirect("/unauthorized");
  }

  // ── Layer 4: Data Fetching (Explicitly Typed) ─────────────────
  // RECOMMENDATION: Replace "queue_items" with a read model like
  // "risk_queue_projection" containing all denormalized fields.
  // This prevents N+1 queries as the system grows.
  const { data: queueData, error: queueError } = await supabase
    .from("vw_risk_queue_radar") // TODO: Migrate to risk_queue_projection view
    .select(`
      id,
      customer_id,
      customer_name,
      customer_email,
      risk_score,
      mrr_at_risk,
      state,
      next_action_time,
      assigned_to_name,
      signal,
      signal_type
    `)
    .eq("tenant_id", tenantId)
    .order("risk_score", { ascending: false })
    .returns<QueueItem[]>();

  // ── Layer 5: Error Handling (Do Not Swallow) ──────────────────
  if (queueError) {
    console.error("Failed to fetch queue data:", queueError);
    // Return an error state so operators know the system failed,
    // rather than showing an empty queue.
    return <QueueErrorState />;
  }

  const items: QueueItem[] = queueData ?? [];

  // ── HUD Metrics Calculation ─────────────────────────────────────
  const totalMrrAtRisk = items.reduce((acc, item) => acc + (item.mrr_at_risk || 0), 0);
  const criticalAccounts = items.filter(item => item.risk_score >= 70).length;
  const pendingDispatches = items.filter(item => item.state === 'pending').length;
  const deadLetters = items.filter(item => item.state === 'dead_lettered').length;
  const activeLocks = items.filter(item => item.state === 'cooldown').length;

  const hudMetrics = {
    totalMrrAtRisk,
    criticalAccounts,
    pendingDispatches,
    deadLetters,
    activeLocks,
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
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
          value={criticalAccounts} 
          variant={criticalAccounts > 0 ? "alert" : "default"} 
        />
        <MetricCard 
          title="Dead Letters" 
          value={deadLetters} 
          variant={deadLetters > 0 ? "alert" : "default"} 
        />
        <MetricCard 
          title="Pending Dispatches" 
          value={pendingDispatches} 
        />
        <MetricCard 
          title="Total MRR at Risk" 
          value={`$${totalMrrAtRisk.toLocaleString()}`} 
        />
        <MetricCard 
          title="Active Locks" 
          value={activeLocks} 
        />
      </div>

      {/* ── The Radar Screen (Client Component) ────────────────── */}
      <RiskQueueClient initialData={items} />
    </div>
  );
}

// ─── Internal HUD Component ────────────────────────────────────────
type MetricVariant = "default" | "alert";

function MetricCard({ 
  title, 
  value, 
  variant = "default" 
}: { 
  title: string; 
  value: string | number; 
  variant?: MetricVariant;
}) {
  const isAlert = variant === "alert";

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium">{title}</h3>
      </div>
      <div className="p-6 pt-0">
        <div className={`text-2xl font-bold ${isAlert ? 'text-red-500' : ''}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Error State (When Queue Fetch Fails) ──────────────────────────
function QueueErrorState() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Risk Queues</h2>
          <p className="text-muted-foreground">
            Air traffic control for at-risk accounts.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-900 mb-2">System Error</h3>
        <p className="text-red-700 max-w-md mx-auto">
          Failed to load the risk queue. The database may be unavailable or experiencing high latency. 
          Please refresh the page or contact engineering if this persists.
        </p>
        <p className="text-sm text-red-500 mt-4">
          Do not assume the queue is empty. This is a failure state, not a clear state.
        </p>
      </div>
    </div>
  );
}