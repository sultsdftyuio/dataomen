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
  daysUntilTrialEnds: number | null;
  isPro: boolean;
  isTrialing: boolean;
  isCanceling: boolean;
  isFreeAccess: boolean;
  /**
   * Kept for older callers. Free Access is restricted, not a Pro trial.
   */
  isFreeTrial: boolean;
  canViewCustomerLists: boolean;
  canSendEmails: boolean;
  canCreateTemplates: boolean;
  billingLabel: string;
  billingDescription: string;
  restrictionMessage: string | null;
};

export const PRO_PLAN_REQUIRED_MESSAGE =
  "Upgrade to Pro to unlock customer lists, campaign sending, and custom templates.";
export const PRO_TRIAL_DAYS = 3;
export const PRO_MONTHLY_PRICE = 29;

// Supports both Pro and Enterprise tiers to prevent enterprise users from being locked out
const PAID_PLAN_TIERS = new Set(["pro", "enterprise"]);

// Active lifecycle statuses that permit entitlement access
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling"]);

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

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / msPerDay));
}

/**
 * Core entitlement state engine. Evaluates plan access deterministically.
 * Rule 3 & Rule 11: Enforces defensive grace-period checks during scheduled cancellations.
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

  // Validate status is active or trialing
  let hasActiveStatus = subscriptionStatus
    ? ACTIVE_STATUSES.has(subscriptionStatus)
    : false;

  // Defensive Guard: If canceling, verify current_period_end hasn't already expired
  // Protects against delayed webhook delivery (Arcli Rule 14) leaving expired workspaces enabled
  if (subscriptionStatus === "canceling" && currentPeriodEnd) {
    const periodEndTimestamp = Date.parse(currentPeriodEnd);
    if (Number.isFinite(periodEndTimestamp) && periodEndTimestamp < Date.now()) {
      hasActiveStatus = false;
    }
  }

  const isPro = isPaidTier && hasActiveStatus;
  const isTrialing = isPaidTier && subscriptionStatus === "trialing";
  const isCanceling = isPaidTier && subscriptionStatus === "canceling" && hasActiveStatus;
  const isFreeAccess = !isPro;

  const daysUntilTrialEnds = isTrialing ? daysUntil(trialEndsAt) : null;
  const isPastDue = isPaidTier && subscriptionStatus === "past_due";
  const currentPeriodEndLabel = formatBillingDate(currentPeriodEnd);

  const billingLabel = isTrialing
    ? "Pro Trial"
    : isCanceling
      ? "Pro Ending"
    : isPro
      ? planTier === "enterprise" ? "Enterprise" : "Pro"
      : isPastDue
        ? "Payment Past Due"
      : "Free Access";

  const billingDescription = isTrialing
    ? daysUntilTrialEnds === null
      ? `${PRO_TRIAL_DAYS}-day Pro trial active. $${PRO_MONTHLY_PRICE}/month after the trial.`
      : `${daysUntilTrialEnds} ${daysUntilTrialEnds === 1 ? "day" : "days"} left in your ${PRO_TRIAL_DAYS}-day Pro trial. $${PRO_MONTHLY_PRICE}/month after the trial.`
    : isCanceling
      ? currentPeriodEndLabel
        ? `Plan cancellation is scheduled. Pro features stay open until ${currentPeriodEndLabel}.`
        : "Plan cancellation is scheduled. Pro features stay open until the current billing period ends."
    : isPro
      ? `Pro subscription active at $${PRO_MONTHLY_PRICE}/month.`
      : isPastDue
        ? "Payment is past due. Update billing to restore Pro features."
      : "Restricted Free Access. Pro features stay locked until you start the Pro trial.";

  return {
    tenantId,
    planTier: planTier.toUpperCase(), // Returns normalized uppercase string ('PRO', 'FREE') to callers
    subscriptionStatus,
    trialEndsAt,
    currentPeriodEnd,
    daysUntilTrialEnds,
    isPro,
    isTrialing,
    isCanceling,
    isFreeAccess,
    isFreeTrial: isFreeAccess,
    canViewCustomerLists: isPro,
    canSendEmails: isPro,
    canCreateTemplates: isPro,
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