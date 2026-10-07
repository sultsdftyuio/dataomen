import type { SupabaseClient } from "@supabase/supabase-js";

type EntitlementClient = SupabaseClient<any, any, any>;

type TenantPlanRow = {
  tenant_id?: string | null;
  plan_tier?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
};

type LegacyTenantPlanRow = {
  tenant_id?: string | null;
  plan?: string | null;
  status?: string | null;
};

export type WorkspaceEntitlements = {
  tenantId: string;
  planTier: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isPro: boolean;
  isCanceling: boolean;
  isPastDue: boolean;
  isTrialing: boolean;
  isFreeAccess: boolean;
  canViewCustomerLists: boolean;
  canSendEmails: boolean;
  canCreateTemplates: boolean;
  canGenerateApiKeys: boolean;
  billingLabel: string;
  billingDescription: string;
  restrictionMessage: string | null;
};

export const PRO_PLAN_REQUIRED_MESSAGE =
  "Upgrade to Pro to unlock customer lists, campaign sending, and custom templates.";
export const PRO_MONTHLY_PRICE = 35;

// Length of the free trial a workspace gets on its first Pro subscription. A
// card is collected at checkout and charged automatically when the trial ends.
export const PRO_TRIAL_DAYS = 3;

// Shown beside every control that starts checkout. The trial is limited to
// first-time subscribers, and payments are non-refundable, so both are stated
// before the customer commits rather than only in the Terms.
export const PRO_PRICE_NOTE = `${PRO_TRIAL_DAYS}-day free trial for new subscribers, then $${PRO_MONTHLY_PRICE}/month. Cancel any time; payments are non-refundable.`;

// Supports both Pro and Enterprise tiers to prevent enterprise users from being locked out
const PAID_PLAN_TIERS = new Set(["pro", "enterprise"]);

const CANCELLATION_STATUSES = new Set(["canceling", "canceled", "cancelled"]);

// How long an active subscription keeps access after its recorded period end.
// A renewal is only recorded once Dodo's webhook is delivered, which can lag
// the charge or be retried for hours, so a customer in good standing must not
// be locked out the moment the old period lapses. A failed renewal does not
// wait for this window: it moves the workspace to past_due immediately.
export const ACTIVE_RENEWAL_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * The paid-access rule. The same rule is implemented in SQL as
 * public.tenant_has_paid_access (scripts/enforce-free-plan-limits.sql) and in
 * the worker as paid_access_sql (api/services/tenant_entitlements.py); change
 * all three together.
 *
 * - active: paid until the period end plus the renewal grace window, or
 *   indefinitely when no period end is recorded.
 * - canceling / canceled: paid only until a recorded, still-future period end.
 * - anything else (free, past_due, unknown): not paid.
 */
function hasPaidAccess(
  isPaidTier: boolean,
  subscriptionStatus: string | null,
  currentPeriodEnd: string | null,
  now: number
): boolean {
  if (!isPaidTier || !subscriptionStatus) return false;

  const periodEnd = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;

  if (subscriptionStatus === "active") {
    return !Number.isFinite(periodEnd) || periodEnd + ACTIVE_RENEWAL_GRACE_MS > now;
  }

  if (CANCELLATION_STATUSES.has(subscriptionStatus)) {
    return Number.isFinite(periodEnd) && periodEnd > now;
  }

  return false;
}

/**
 * Deterministically normalizes database strings to lowercase trimmed formats.
 * Prevents case-sensitivity mismatches against schema CHECK constraints ('FREE' vs 'free').
 */
function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function formatBillingDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

/**
 * Core entitlement state engine. Evaluates plan access deterministically.
 * Access itself is decided by hasPaidAccess; the rest is presentation.
 */
function buildEntitlements(
  tenantId: string,
  planValue: unknown,
  statusValue: unknown,
  trialEndsAtValue?: unknown,
  currentPeriodEndValue?: unknown
): WorkspaceEntitlements {
  const planTier = normalize(planValue) ?? "free";
  const isPaidTier = PAID_PLAN_TIERS.has(planTier);

  const subscriptionStatus =
    normalize(statusValue) ?? (isPaidTier ? null : "free");

  const trialEndsAt = normalizeTimestamp(trialEndsAtValue);
  const currentPeriodEnd = normalizeTimestamp(currentPeriodEndValue);

  const isPro = hasPaidAccess(isPaidTier, subscriptionStatus, currentPeriodEnd, Date.now());
  const isCanceling =
    isPro && Boolean(subscriptionStatus && CANCELLATION_STATUSES.has(subscriptionStatus));
  const isFreeAccess = !isPro;

  const isPastDue = isPaidTier && subscriptionStatus === "past_due";
  // A trial is an active subscription that has not been charged yet; it has no
  // status of its own, only a recorded end date that is still in the future.
  const isTrialing =
    isPro &&
    subscriptionStatus === "active" &&
    trialEndsAt !== null &&
    Date.parse(trialEndsAt) > Date.now();
  const currentPeriodEndLabel = formatBillingDate(currentPeriodEnd);
  const trialEndLabel = formatBillingDate(trialEndsAt);

  const billingLabel = isCanceling
      ? planTier === "enterprise" ? "Enterprise" : "Pro"
    : isPro
      ? planTier === "enterprise" ? "Enterprise" : "Pro"
      : isPastDue
        ? "Payment Past Due"
      : "Free Access";

  const billingDescription = isCanceling
      ? currentPeriodEndLabel
        ? `Active until ${currentPeriodEndLabel}.`
        : "Active until the end of the current billing period."
    : isTrialing
      ? `Free trial until ${trialEndLabel}. $${PRO_MONTHLY_PRICE}/month after that unless you cancel.`
    : isPro
      ? `Pro subscription active at $${PRO_MONTHLY_PRICE}/month.`
      : isPastDue
        ? "Payment is past due. Update billing to restore Pro features."
      : "Free prepares one website brief. Upgrade to Pro to search public conversations and review matches.";

  return {
    tenantId,
    planTier: planTier.toUpperCase(), // Returns normalized uppercase string ('PRO', 'FREE') to callers
    subscriptionStatus,
    trialEndsAt,
    currentPeriodEnd,
    isPro,
    isCanceling,
    isPastDue,
    isTrialing,
    isFreeAccess,
    canViewCustomerLists: isPro,
    canSendEmails: isPro,
    canCreateTemplates: isPro,
    // API keys are universal: custom event ingestion is required for onboarding.
    canGenerateApiKeys: true,
    billingLabel,
    billingDescription,
    restrictionMessage: isPro ? null : PRO_PLAN_REQUIRED_MESSAGE,
  };
}

/**
 * Resolves workspace entitlements by querying tenant isolation storage.
 * Enforces Arcli Rule 6 (Tenant Scope) & Rule 17 (Operator Observability).
 */
export async function getWorkspaceEntitlements(
  supabase: EntitlementClient,
  tenantId: string
): Promise<WorkspaceEntitlements> {
  const { data, error } = await supabase
    .from("tenants")
    .select("tenant_id, plan_tier, subscription_status, trial_ends_at, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantPlanRow>();

  if (!error && data) {
    return buildEntitlements(
      tenantId,
      data.plan_tier,
      data.subscription_status,
      data.trial_ends_at,
      data.current_period_end
    );
  }

  // Graceful degradation / backward compatibility fallback for older schema versions
  const { data: legacyData, error: legacyError } = await supabase
    .from("tenants")
    .select("tenant_id, plan, status")
    .eq("tenant_id", tenantId)
    .maybeSingle<LegacyTenantPlanRow>();

  if (legacyError || !legacyData) {
    // Structured Operator Observability (Rule 17)
    console.error("[Entitlements] Failed to resolve workspace plan", {
      event: "entitlement_resolution_failed",
      tenant_id: tenantId,
      primary_error: error?.message || error,
      legacy_error: legacyError?.message || legacyError,
    });
    return buildEntitlements(tenantId, "free", "free");
  }

  return buildEntitlements(tenantId, legacyData.plan, legacyData.status);
}

/**
 * Guard utility for Server Actions & API routes. Throws synchronously if entitlements are missing.
 */
export async function requireProEntitlement(
  supabase: EntitlementClient,
  tenantId: string
): Promise<WorkspaceEntitlements> {
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);

  if (!entitlements.isPro) {
    throw new Error(PRO_PLAN_REQUIRED_MESSAGE);
  }

  return entitlements;
}
