import type { SupabaseClient } from "@supabase/supabase-js";

type EntitlementClient = SupabaseClient<any, any, any>;

type TenantPlanRow = {
  tenant_id?: string | null;
  plan_tier?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
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
  daysUntilTrialEnds: number | null;
  isPro: boolean;
  isTrialing: boolean;
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

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTrialEndsAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / msPerDay));
}

function buildEntitlements(
  tenantId: string,
  planValue: unknown,
  statusValue: unknown,
  trialEndsAtValue?: unknown
): WorkspaceEntitlements {
  const planTier = normalize(planValue) ?? "free";
  const subscriptionStatus = normalize(statusValue) ?? (planTier === "pro" ? null : "free");
  const trialEndsAt = normalizeTrialEndsAt(trialEndsAtValue);
  const hasActiveStatus = subscriptionStatus
    ? ACTIVE_STATUSES.has(subscriptionStatus)
    : false;
  const isPro = planTier === "pro" && hasActiveStatus;
  const isTrialing = planTier === "pro" && subscriptionStatus === "trialing";
  const isFreeAccess = !isPro;
  const daysUntilTrialEnds = isTrialing ? daysUntil(trialEndsAt) : null;
  const isPastDue = planTier === "pro" && subscriptionStatus === "past_due";
  const billingLabel = isTrialing
    ? "Pro Trial"
    : isPro
      ? "Pro"
      : isPastDue
        ? "Payment Past Due"
      : "Free Access";
  const billingDescription = isTrialing
    ? daysUntilTrialEnds === null
      ? `${PRO_TRIAL_DAYS}-day Pro trial active. $${PRO_MONTHLY_PRICE}/month after the trial.`
      : `${daysUntilTrialEnds} ${daysUntilTrialEnds === 1 ? "day" : "days"} left in your ${PRO_TRIAL_DAYS}-day Pro trial. $${PRO_MONTHLY_PRICE}/month after the trial.`
    : isPro
      ? `Pro subscription active at $${PRO_MONTHLY_PRICE}/month.`
      : isPastDue
        ? "Payment is past due. Update billing to restore Pro features."
      : "Restricted Free Access. Pro features stay locked until you start the Pro trial.";

  return {
    tenantId,
    planTier,
    subscriptionStatus,
    trialEndsAt,
    daysUntilTrialEnds,
    isPro,
    isTrialing,
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

export async function getWorkspaceEntitlements(
  supabase: EntitlementClient,
  tenantId: string
): Promise<WorkspaceEntitlements> {
  const { data, error } = await supabase
    .from("tenants")
    .select("tenant_id, plan_tier, subscription_status, trial_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantPlanRow>();

  if (!error && data) {
    return buildEntitlements(
      tenantId,
      data.plan_tier,
      data.subscription_status,
      data.trial_ends_at
    );
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from("tenants")
    .select("tenant_id, plan, status")
    .eq("tenant_id", tenantId)
    .maybeSingle<LegacyTenantPlanRow>();

  if (legacyError || !legacyData) {
    console.error("[Entitlements] Failed to resolve workspace plan", {
      tenantId,
      preferredError: error,
      legacyError,
    });
    return buildEntitlements(tenantId, "free", "free");
  }

  return buildEntitlements(tenantId, legacyData.plan, legacyData.status);
}

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
