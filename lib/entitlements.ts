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
  isPro: boolean;
  isFreeTrial: boolean;
  canViewCustomerLists: boolean;
  canSendEmails: boolean;
  canCreateTemplates: boolean;
  restrictionMessage: string | null;
};

export const PRO_PLAN_REQUIRED_MESSAGE =
  "Upgrade to Pro to unlock customer lists, campaign sending, and custom templates.";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEntitlements(
  tenantId: string,
  planValue: unknown,
  statusValue: unknown
): WorkspaceEntitlements {
  const planTier = normalize(planValue) ?? "free_trial";
  const subscriptionStatus = normalize(statusValue);
  const hasActiveStatus = subscriptionStatus
    ? ACTIVE_STATUSES.has(subscriptionStatus)
    : false;
  const isPro = planTier === "pro" && hasActiveStatus;
  const isFreeTrial = !isPro;

  return {
    tenantId,
    planTier,
    subscriptionStatus,
    isPro,
    isFreeTrial,
    canViewCustomerLists: isPro,
    canSendEmails: isPro,
    canCreateTemplates: isPro,
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
      data.subscription_status
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
    return buildEntitlements(tenantId, "free_trial", "trialing");
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
