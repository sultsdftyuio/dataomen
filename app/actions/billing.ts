// app/actions/billing.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceEntitlements, PRO_TRIAL_DAYS } from "@/lib/entitlements";
import { DodoPayments } from "dodopayments";
import type { Database } from "@/types/supabase";

const DODO_SUBSCRIPTION_SCAN_LIMIT = 200;
const DODO_SUBSCRIPTION_PAGE_SIZE = 50;

type DodoSubscriptionLookupStrategy =
  | "subscription_id"
  | "customer_id"
  | "metadata.tenant_id";

type DodoSubscriptionMatch = {
  subscription: Record<string, unknown>;
  lookupStrategy: DodoSubscriptionLookupStrategy;
  scannedCount: number;
};

type DodoSubscriptionListParams = NonNullable<
  Parameters<DodoPayments["subscriptions"]["list"]>[0]
>;

type VerifyAndSyncSubscriptionStatusResult = {
  status: "already_synced" | "synced" | "no_active_subscription";
  tenantId: string;
  planTier: string | null;
  subscriptionStatus: string | null;
  dodoSubscriptionId?: string | null;
  dodoCustomerId?: string | null;
  lookupStrategy?: DodoSubscriptionLookupStrategy;
};

type CancelProPlanResult = {
  status: "cancellation_scheduled" | "already_canceled";
  tenantId: string;
  subscriptionStatus: string | null;
  currentPeriodEnd?: string | null;
};

type BillingTestState =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceling"
  | "canceled";

type BillingTestStateResult = {
  status: "updated";
  tenantId: string;
  subscriptionStatus: BillingTestState;
  planTier: "free" | "pro";
};

type BillingSessionResult =
  | {
      status: "checkout_created" | "portal_created";
      url: string;
      message?: string;
    }
  | {
      status: "already_active";
      url: null;
      message: string;
    };

type TenantBillingLookupRow = {
  tenant_id: string;
  plan_tier: string;
  subscription_status: string;
  dodo_customer_id: string | null;
  dodo_subscription_id: string | null;
  current_period_end: string | null;
};

async function scheduleSubscriptionCancellationForTenant(
  tenantId: string,
  userId: string
): Promise<CancelProPlanResult> {
  const serviceSupabase = getSupabaseServiceClient();
  const { data: tenant, error: tenantError } = await serviceSupabase
    .from("tenants")
    .select(
      "tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id, current_period_end"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantBillingLookupRow>();

  if (tenantError || !tenant) {
    console.error("[Billing] Tenant lookup failed during cancellation", {
      event: "billing_cancel_tenant_lookup_failed",
      tenant_id: tenantId,
      user_id: userId,
      error: tenantError,
    });
    throw new Error("Unable to resolve workspace billing status.");
  }

  if (tenant.subscription_status === "canceling") {
    return {
      status: "already_canceled",
      tenantId,
      subscriptionStatus: tenant.subscription_status,
      currentPeriodEnd: tenant.current_period_end,
    };
  }

  const entitlements = await getWorkspaceEntitlements(serviceSupabase, tenantId);
  const planTier = entitlements.planTier.toLowerCase();
  const canCancel =
    planTier === "pro" &&
    ["active", "trialing", "past_due"].includes(entitlements.subscriptionStatus ?? "");

  if (!canCancel) {
    throw new Error("No active subscription found to cancel.");
  }

  const { client: dodo, environment } = getDodoClient();
  const productId = sanitizeEnvSecret(process.env.DODO_PRO_PLAN_ID) || null;

  let match: DodoSubscriptionMatch | null = null;
  let subscriptionId = tenant.dodo_subscription_id;

  if (!subscriptionId) {
    try {
      match = await findActiveDodoSubscriptionForTenant(dodo, {
        tenantId,
        customerId: tenant.dodo_customer_id,
        subscriptionId: tenant.dodo_subscription_id,
        productId,
      });
    } catch (error) {
      console.error("[Billing] Dodo subscription lookup failed during cancellation", {
        event: "billing_cancel_dodo_lookup_failed",
        tenant_id: tenantId,
        user_id: userId,
        environment,
        product_id: productId,
        has_dodo_customer_id: Boolean(tenant.dodo_customer_id),
        has_dodo_subscription_id: Boolean(tenant.dodo_subscription_id),
        error: serializeError(error),
      });
      throw new Error("Unable to verify subscription before cancellation.");
    }

    subscriptionId = match ? extractSubscriptionId(match.subscription) : null;
  } else {
    console.info("[Billing] Using persisted Dodo subscription id during cancellation", {
      event: "billing_cancel_using_persisted_subscription_id",
      tenant_id: tenantId,
      user_id: userId,
      environment,
      subscription_id: subscriptionId,
    });
  }

  if (!subscriptionId) {
    console.error("[Billing] Missing Dodo subscription id during cancellation", {
      event: "billing_cancel_subscription_id_missing",
      tenant_id: tenantId,
      user_id: userId,
      has_dodo_customer_id: Boolean(tenant.dodo_customer_id),
    });
    throw new Error("No Dodo subscription is linked to this workspace.");
  }

  let canceledSubscription: Record<string, unknown>;

  try {
    canceledSubscription = asRecord(
      await dodo.subscriptions.update(subscriptionId, {
        cancel_at_next_billing_date: true,
        cancel_reason: "cancelled_by_customer",
        cancellation_comment: "Canceled from Arcli workspace settings.",
      })
    ) ?? match?.subscription ?? { subscription_id: subscriptionId };
  } catch (error) {
    console.error("[Billing] Dodo subscription cancellation failed", {
      event: "billing_cancel_dodo_update_failed",
      tenant_id: tenantId,
      user_id: userId,
      environment,
      subscription_id: subscriptionId,
      error: serializeError(error),
    });
    throw new Error("Unable to cancel subscription. Please try again.");
  }

  const currentPeriodEnd = extractCurrentPeriodEnd(canceledSubscription) ?? tenant.current_period_end;
  const update = compact({
    plan_tier: "pro",
    subscription_status: "canceling",
    billing_status: "canceling",
    plan: "pro",
    status: "active",
    trial_ends_at: null,
    dodo_customer_id:
      extractCustomerId(canceledSubscription) ?? tenant.dodo_customer_id ?? undefined,
    dodo_subscription_id: subscriptionId,
    current_period_end: currentPeriodEnd ?? undefined,
    updated_at: new Date().toISOString(),
  }) as Database["public"]["Tables"]["tenants"]["Update"];

  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", tenantId)
    .select("tenant_id, subscription_status, current_period_end")
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error("[Billing] Tenant cancellation sync update failed", {
      event: "billing_cancel_local_sync_failed",
      tenant_id: tenantId,
      user_id: userId,
      subscription_id: subscriptionId,
      error: updateError,
    });
    throw new Error("Subscription was updated, but workspace billing state could not sync.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  console.info("[Billing] Workspace subscription cancellation scheduled", {
    event: "billing_cancel_completed",
    tenant_id: tenantId,
    user_id: userId,
    environment,
    subscription_id: subscriptionId,
    current_period_end: updatedTenant.current_period_end,
  });

  return {
    status: "cancellation_scheduled",
    tenantId,
    subscriptionStatus: updatedTenant.subscription_status,
    currentPeriodEnd: updatedTenant.current_period_end,
  };
}

function sanitizeEnvSecret(value: string | undefined): string {
  return value?.trim().replace(/^["']+|["']+$/g, "").trim() ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(record: Record<string, unknown> | null, key: string): boolean | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

function addDays(dateValue: string | null, days: number): string {
  const start = dateValue && Number.isFinite(Date.parse(dateValue))
    ? new Date(dateValue)
    : new Date();

  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function getSupabaseServiceClient() {
  const supabaseUrl = sanitizeEnvSecret(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration.");
  }

  return createSupabaseServiceClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isBillingTestControlsEnabled(): boolean {
  const explicitFlag = sanitizeEnvSecret(process.env.BILLING_TEST_CONTROLS_ENABLED)
    .toLowerCase();

  if (["true", "1", "yes"].includes(explicitFlag)) {
    return true;
  }

  if (["false", "0", "no"].includes(explicitFlag)) {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

function isDodoTestApiKey(apiKey: string): boolean {
  return apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
}

function isBillingTestState(value: string): value is BillingTestState {
  return ["free", "trialing", "active", "past_due", "canceling", "canceled"].includes(
    value
  );
}

function billingTestUpdateFromState(
  state: BillingTestState
): Database["public"]["Tables"]["tenants"]["Update"] {
  const now = new Date().toISOString();

  switch (state) {
    case "trialing": {
      const trialEndsAt = addDays(null, PRO_TRIAL_DAYS);

      return {
        plan_tier: "pro",
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
        billing_status: "trialing",
        plan: "pro",
        status: "active",
        current_period_end: trialEndsAt,
        updated_at: now,
      };
    }
    case "active":
      return {
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: null,
        billing_status: "active",
        plan: "pro",
        status: "active",
        current_period_end: addDays(null, 30),
        updated_at: now,
      };
    case "past_due":
      return {
        plan_tier: "pro",
        subscription_status: "past_due",
        trial_ends_at: null,
        billing_status: "past_due",
        plan: "pro",
        status: "past_due",
        current_period_end: addDays(null, -1),
        updated_at: now,
      };
    case "canceling":
      return {
        plan_tier: "pro",
        subscription_status: "canceling",
        trial_ends_at: null,
        billing_status: "canceling",
        plan: "pro",
        status: "active",
        current_period_end: addDays(null, 14),
        updated_at: now,
      };
    case "canceled":
      return {
        plan_tier: "free",
        subscription_status: "canceled",
        trial_ends_at: null,
        billing_status: "canceled",
        plan: "free",
        status: "active",
        current_period_end: null,
        updated_at: now,
      };
    case "free":
      return {
        plan_tier: "free",
        subscription_status: "free",
        trial_ends_at: null,
        billing_status: "free",
        plan: "free",
        status: "active",
        current_period_end: null,
        updated_at: now,
      };
  }
}

/**
 * 1. Deterministic SDK Initialization (Rule 11: Determinism & Rule 17: Observability)
 * Eliminates heuristic prefix guessing in favor of explicit configuration.
 * Automatically sanitizes accidental whitespace, quotes, or carriage returns.
 */
function getDodoClient(): { client: DodoPayments; environment: "test_mode" | "live_mode" } {
  const apiKey = sanitizeEnvSecret(process.env.DODO_PAYMENTS_API_KEY);
  if (!apiKey) {
    throw new Error("Missing DODO_PAYMENTS_API_KEY environment variable.");
  }

  const explicitEnv = sanitizeEnvSecret(process.env.DODO_PAYMENTS_ENV);
  if (explicitEnv !== "test_mode" && explicitEnv !== "live_mode") {
    console.warn(
      "[Billing] DODO_PAYMENTS_ENV is not explicitly set to 'test_mode' or 'live_mode'. Defaulting to 'live_mode'."
    );
  }

  const environment: "test_mode" | "live_mode" =
    explicitEnv === "test_mode" || explicitEnv === "live_mode"
      ? explicitEnv
      : "live_mode";

  if (process.env.NODE_ENV === "production" && environment === "test_mode") {
    console.warn(
      "[Billing] DODO_PAYMENTS_ENV=test_mode is enabled in production. Using Dodo test API."
    );
  }

  if (environment === "live_mode" && isDodoTestApiKey(apiKey)) {
    throw new Error(
      "DODO_PAYMENTS_API_KEY appears to be a test key while Dodo Payments is configured for live_mode."
    );
  }

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment,
  });

  return { client, environment };
}

function extractTenantIdFromMetadata(record: Record<string, unknown>): string | null {
  const customer = asRecord(record.customer);
  const subscription = asRecord(record.subscription);
  const payment = asRecord(record.payment);
  const checkoutSession = asRecord(record.checkout_session);

  const metadataSources = [
    asRecord(record.metadata),
    asRecord(record.custom_data),
    asRecord(record.checkout_session_metadata),
    asRecord(customer?.metadata),
    asRecord(subscription?.metadata),
    asRecord(payment?.metadata),
    asRecord(checkoutSession?.metadata),
    asRecord(checkoutSession?.checkout_session_metadata),
  ];

  for (const metadata of metadataSources) {
    const tenantId =
      readString(metadata, "tenant_id") ??
      readString(metadata, "tenantId") ??
      readString(metadata, "workspace_id") ??
      readString(metadata, "workspaceId");

    if (tenantId) return tenantId;
  }

  return null;
}

function extractCustomerId(subscription: Record<string, unknown>): string | null {
  return (
    readString(subscription, "customer_id") ??
    readString(asRecord(subscription.customer), "customer_id") ??
    readString(asRecord(subscription.customer), "id")
  );
}

function extractSubscriptionId(subscription: Record<string, unknown>): string | null {
  return readString(subscription, "subscription_id") ?? readString(subscription, "id");
}

function extractCurrentPeriodEnd(subscription: Record<string, unknown>): string | null {
  return (
    readString(subscription, "current_period_end") ??
    readString(subscription, "next_billing_date") ??
    readString(subscription, "renews_at") ??
    readString(subscription, "expires_at")
  );
}

function resolveTrialEndsAt(subscription: Record<string, unknown>): string | null {
  const explicitTrialEnd =
    readString(subscription, "trial_ends_at") ??
    readString(subscription, "trial_end") ??
    readString(subscription, "trial_end_at") ??
    readString(subscription, "trial_expires_at");

  if (explicitTrialEnd && Number.isFinite(Date.parse(explicitTrialEnd))) {
    return explicitTrialEnd;
  }

  const trialPeriodDays = readNumber(subscription, "trial_period_days");
  if (!trialPeriodDays || trialPeriodDays <= 0) {
    return null;
  }

  return addDays(readString(subscription, "created_at"), trialPeriodDays);
}

function isActiveOrTrialingDodoSubscription(subscription: Record<string, unknown>): boolean {
  const status = readString(subscription, "status")?.toLowerCase();
  return status === "active" || status === "trialing";
}

function tenantUpdateFromDodoSubscription(
  subscription: Record<string, unknown>
): Database["public"]["Tables"]["tenants"]["Update"] {
  const trialEndsAt = resolveTrialEndsAt(subscription);
  const trialEndsTimestamp = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const cancelAtPeriodEnd = readBoolean(subscription, "cancel_at_next_billing_date") === true;
  const isTrialing =
    Number.isFinite(trialEndsTimestamp) && trialEndsTimestamp > Date.now();
  const subscriptionStatus = cancelAtPeriodEnd
    ? "canceling"
    : isTrialing
      ? "trialing"
      : "active";

  return compact({
    plan_tier: "pro",
    subscription_status: subscriptionStatus,
    trial_ends_at: isTrialing ? trialEndsAt : null,
    billing_status: subscriptionStatus,
    plan: "pro",
    status: "active",
    dodo_customer_id: extractCustomerId(subscription) ?? undefined,
    dodo_subscription_id: extractSubscriptionId(subscription) ?? undefined,
    current_period_end: extractCurrentPeriodEnd(subscription) ?? undefined,
    updated_at: new Date().toISOString(),
  }) as Database["public"]["Tables"]["tenants"]["Update"];
}

async function retrieveActiveSubscriptionById(
  dodo: DodoPayments,
  subscriptionId: string
): Promise<Record<string, unknown> | null> {
  const subscription = asRecord(await dodo.subscriptions.retrieve(subscriptionId));

  if (!subscription || !isActiveOrTrialingDodoSubscription(subscription)) {
    return null;
  }

  return subscription;
}

async function findActiveSubscriptionByCustomerId(
  dodo: DodoPayments,
  customerId: string,
  productId: string | null
): Promise<DodoSubscriptionMatch | null> {
  let scannedCount = 0;

  const listParams: DodoSubscriptionListParams = {
    customer_id: customerId,
    status: "active",
    page_size: DODO_SUBSCRIPTION_PAGE_SIZE,
  };

  if (productId) {
    listParams.product_id = productId;
  }

  for await (const subscription of dodo.subscriptions.list(listParams)) {
    const subscriptionRecord = asRecord(subscription);
    scannedCount += 1;

    if (subscriptionRecord && isActiveOrTrialingDodoSubscription(subscriptionRecord)) {
      return {
        subscription: subscriptionRecord,
        lookupStrategy: "customer_id",
        scannedCount,
      };
    }
  }

  return null;
}

async function findActiveSubscriptionByMetadata(
  dodo: DodoPayments,
  tenantId: string,
  productId: string | null
): Promise<DodoSubscriptionMatch | null> {
  let scannedCount = 0;

  const listParams: DodoSubscriptionListParams = {
    status: "active",
    page_size: DODO_SUBSCRIPTION_PAGE_SIZE,
  };

  if (productId) {
    listParams.product_id = productId;
  }

  for await (const subscription of dodo.subscriptions.list(listParams)) {
    const subscriptionRecord = asRecord(subscription);
    scannedCount += 1;

    if (
      subscriptionRecord &&
      isActiveOrTrialingDodoSubscription(subscriptionRecord) &&
      extractTenantIdFromMetadata(subscriptionRecord) === tenantId
    ) {
      return {
        subscription: subscriptionRecord,
        lookupStrategy: "metadata.tenant_id",
        scannedCount,
      };
    }

    if (scannedCount >= DODO_SUBSCRIPTION_SCAN_LIMIT) {
      break;
    }
  }

  console.info("[Billing] Dodo active subscription metadata scan completed without match", {
    event: "dodo_subscription_metadata_scan_miss",
    tenant_id: tenantId,
    product_id: productId,
    scanned_count: scannedCount,
    scan_limit: DODO_SUBSCRIPTION_SCAN_LIMIT,
  });

  return null;
}

async function findActiveDodoSubscriptionForTenant(
  dodo: DodoPayments,
  params: {
    tenantId: string;
    customerId: string | null;
    subscriptionId: string | null;
    productId: string | null;
  }
): Promise<DodoSubscriptionMatch | null> {
  if (params.subscriptionId) {
    const subscription = await retrieveActiveSubscriptionById(dodo, params.subscriptionId);

    if (subscription) {
      return {
        subscription,
        lookupStrategy: "subscription_id",
        scannedCount: 1,
      };
    }
  }

  if (params.customerId) {
    const customerMatch = await findActiveSubscriptionByCustomerId(
      dodo,
      params.customerId,
      params.productId
    );

    if (customerMatch) return customerMatch;
  }

  return findActiveSubscriptionByMetadata(dodo, params.tenantId, params.productId);
}

/**
 * Initiates a checkout session to upgrade the current tenant workspace to the Pro plan.
 * Enforces strict synchronous tenant isolation and prevents duplicate checkouts.
 */
export async function upgradeToProPlan(): Promise<BillingSessionResult> {
  const supabase = await createClient();

  // 3. Authenticate User & Validate Identity
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  if (!user.email) {
    throw new Error("User account is missing an associated email address.");
  }

  // 4. Secure Tenant Authorization & Discovery (Rule 6: Scope by Tenant)
  const { data: tenantMembership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !tenantMembership) {
    console.error("[Billing] Workspace membership lookup failed", {
      event: "tenant_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  const tenantId = tenantMembership.tenant_id;

  // 5. Prevent Duplicate Subscriptions & Handle Lookup Errors (Rule 11: Idempotency)
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);

  if (entitlements.isPro && entitlements.subscriptionStatus !== "canceling") {
    console.info("[Billing] Handling duplicate checkout attempt for active workspace", {
      event: "duplicate_checkout_detected",
      tenant_id: tenantId,
      user_id: user.id,
      subscription_status: entitlements.subscriptionStatus,
    });

    try {
      return await manageBillingPortal();
    } catch (error) {
      console.warn("[Billing] Duplicate checkout resolved without portal redirect", {
        event: "duplicate_checkout_portal_redirect_failed",
        tenant_id: tenantId,
        user_id: user.id,
        subscription_status: entitlements.subscriptionStatus,
        error: serializeError(error),
      });

      return {
        status: "already_active",
        url: null,
        message: "Workspace already has an active subscription.",
      };
    }
  }

  // 6. Strict Environment Variable Validation
  const productId = process.env.DODO_PRO_PLAN_ID?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!productId || !siteUrl) {
    console.error("[Billing] Missing critical billing environment variables (DODO_PRO_PLAN_ID or NEXT_PUBLIC_SITE_URL).");
    throw new Error("Billing service is currently unavailable.");
  }

  const { client: dodo, environment } = getDodoClient();

  // 6. Resilient Checkout Creation
  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      allowed_payment_method_types: ["credit", "debit"],
      customer: {
        email: user.email,
      },
      metadata: {
        tenant_id: tenantId, // Mandatory: deterministic routing for asynchronous webhooks (Rule 14)
        user_id: user.id,
      },
      subscription_data: {
        trial_period_days: PRO_TRIAL_DAYS,
      },
      return_url: `${siteUrl}/dashboard?billing=trial_started`,
    });

    if (!session || !session.checkout_url) {
      throw new Error("Checkout session returned without a valid URL.");
    }

    return { status: "checkout_created", url: session.checkout_url };
  } catch (error) {
    // 7. Operator-Focused Structured Observability (Rule 17)
    console.error("[Billing] Checkout creation failed", {
      event: "checkout_creation_failed",
      tenant_id: tenantId,
      user_id: user.id,
      environment, // Explicitly logs the active SDK routing environment
      product_id: productId,
      error,
    });

    throw new Error("Unable to create checkout session. Please try again later.");
  }
}

/**
 * Synchronous checkout-return fallback.
 *
 * Webhooks remain the source of truth, but this closes the UX gap when the user
 * returns from Dodo before the async webhook has updated Supabase.
 */
export async function verifyAndSyncSubscriptionStatus(
  tenantId: string,
  options?: { skipRevalidate?: boolean }
): Promise<VerifyAndSyncSubscriptionStatusResult> {
  const normalizedTenantId = tenantId.trim();

  if (!normalizedTenantId) {
    throw new Error("A workspace is required to verify billing status.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", normalizedTenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("[Billing] Unauthorized subscription verification attempt", {
      event: "billing_sync_unauthorized",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  const serviceSupabase = getSupabaseServiceClient();
  const { data: tenant, error: tenantError } = await serviceSupabase
    .from("tenants")
    .select(
      "tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id, current_period_end"
    )
    .eq("tenant_id", normalizedTenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    console.error("[Billing] Tenant lookup failed during subscription verification", {
      event: "billing_sync_tenant_lookup_failed",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      error: tenantError,
    });
    throw new Error("Unable to resolve workspace billing status.");
  }

  const { client: dodo, environment } = getDodoClient();
  const productId = sanitizeEnvSecret(process.env.DODO_PRO_PLAN_ID) || null;

  console.info("[Billing] Starting synchronous Dodo subscription verification", {
    event: "billing_sync_started",
    tenant_id: normalizedTenantId,
    user_id: user.id,
    environment,
    product_id: productId,
    has_dodo_customer_id: Boolean(tenant.dodo_customer_id),
    has_dodo_subscription_id: Boolean(tenant.dodo_subscription_id),
    current_plan_tier: tenant.plan_tier,
    current_subscription_status: tenant.subscription_status,
  });

  let match: DodoSubscriptionMatch | null;

  try {
    match = await findActiveDodoSubscriptionForTenant(dodo, {
      tenantId: normalizedTenantId,
      customerId: tenant.dodo_customer_id,
      subscriptionId: tenant.dodo_subscription_id,
      productId,
    });
  } catch (error) {
    console.error("[Billing] Dodo subscription verification failed", {
      event: "billing_sync_dodo_lookup_failed",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      environment,
      product_id: productId,
      error: serializeError(error),
    });
    throw new Error("Unable to verify subscription status. Please try again.");
  }

  if (!match) {
    console.info("[Billing] No active Dodo subscription found for workspace", {
      event: "billing_sync_no_active_subscription",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      environment,
      product_id: productId,
    });

    return {
      status: "no_active_subscription",
      tenantId: normalizedTenantId,
      planTier: tenant.plan_tier,
      subscriptionStatus: tenant.subscription_status,
      dodoCustomerId: tenant.dodo_customer_id,
      dodoSubscriptionId: tenant.dodo_subscription_id,
    };
  }

  const update = tenantUpdateFromDodoSubscription(match.subscription);
  const desiredSubscriptionId = update.dodo_subscription_id ?? null;
  const desiredCustomerId = update.dodo_customer_id ?? null;
  const desiredSubscriptionStatus =
    typeof update.subscription_status === "string" ? update.subscription_status : null;
  const activeLocalStatus = ["active", "trialing", "canceling"].includes(
    tenant.subscription_status?.toLowerCase() ?? ""
  );
  const shouldSync =
    tenant.plan_tier !== "pro" ||
    !activeLocalStatus ||
    tenant.dodo_customer_id !== desiredCustomerId ||
    tenant.dodo_subscription_id !== desiredSubscriptionId;

  if (!shouldSync) {
    console.info("[Billing] Workspace billing state already matches Dodo", {
      event: "billing_sync_already_synced",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      lookup_strategy: match.lookupStrategy,
      scanned_count: match.scannedCount,
      dodo_subscription_id: desiredSubscriptionId,
      dodo_customer_id: desiredCustomerId,
    });

    return {
      status: "already_synced",
      tenantId: normalizedTenantId,
      planTier: tenant.plan_tier,
      subscriptionStatus: tenant.subscription_status,
      dodoCustomerId: tenant.dodo_customer_id,
      dodoSubscriptionId: tenant.dodo_subscription_id,
      lookupStrategy: match.lookupStrategy,
    };
  }

  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", normalizedTenantId)
    .select("tenant_id, plan_tier, subscription_status, dodo_customer_id, dodo_subscription_id")
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error("[Billing] Tenant billing sync update failed", {
      event: "billing_sync_update_failed",
      tenant_id: normalizedTenantId,
      user_id: user.id,
      lookup_strategy: match.lookupStrategy,
      dodo_subscription_id: desiredSubscriptionId,
      dodo_customer_id: desiredCustomerId,
      error: updateError,
    });
    throw new Error("Unable to sync workspace billing status.");
  }

  if (!options?.skipRevalidate) {
    revalidatePath("/dashboard");
    revalidatePath("/settings");
  }

  console.info("[Billing] Workspace billing state synced from Dodo", {
    event: "billing_sync_completed",
    tenant_id: normalizedTenantId,
    user_id: user.id,
    lookup_strategy: match.lookupStrategy,
    scanned_count: match.scannedCount,
    dodo_subscription_id: desiredSubscriptionId,
    dodo_customer_id: desiredCustomerId,
    subscription_status: desiredSubscriptionStatus,
  });

  return {
    status: "synced",
    tenantId: normalizedTenantId,
    planTier: updatedTenant.plan_tier,
    subscriptionStatus: updatedTenant.subscription_status,
    dodoCustomerId: updatedTenant.dodo_customer_id,
    dodoSubscriptionId: updatedTenant.dodo_subscription_id,
    lookupStrategy: match.lookupStrategy,
  };
}

/**
 * Schedules the current workspace's Dodo subscription cancellation at period end.
 * Pro access remains open until Dodo emits the final cancellation/expiry event.
 */
export async function cancelProPlan(): Promise<CancelProPlanResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("[Billing] Workspace membership lookup failed during cancellation", {
      event: "billing_cancel_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  return scheduleSubscriptionCancellationForTenant(membership.tenant_id, user.id);
}

/**
 * Workspace-scoped cancellation action for UI flows that already know the tenant id.
 * Schedules subscription expiry at the end of the billing cycle without deleting any payment method.
 */
export async function removePaymentMethodAndScheduleDowngrade(
  workspaceId: string
): Promise<CancelProPlanResult> {
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedWorkspaceId) {
    throw new Error("A workspace is required to update billing.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", normalizedWorkspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("[Billing] Unauthorized billing downgrade attempt", {
      event: "billing_downgrade_unauthorized",
      tenant_id: normalizedWorkspaceId,
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  return scheduleSubscriptionCancellationForTenant(normalizedWorkspaceId, user.id);
}

/**
 * Local/testing-only subscription state override for exercising gated UI.
 * This intentionally preserves persisted Dodo customer/subscription IDs.
 */
export async function setBillingTestState(state: string): Promise<BillingTestStateResult> {
  if (!isBillingTestControlsEnabled()) {
    console.warn("[Billing] Blocked billing test state update outside allowed environment", {
      event: "billing_test_state_blocked",
      node_env: process.env.NODE_ENV,
    });
    throw new Error("Billing test controls are disabled in this environment.");
  }

  const normalizedState = state.trim().toLowerCase();

  if (!isBillingTestState(normalizedState)) {
    throw new Error("Unsupported billing test state.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("[Billing] Workspace membership lookup failed during test state update", {
      event: "billing_test_state_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  const tenantId = membership.tenant_id;
  const update = billingTestUpdateFromState(normalizedState);
  const serviceSupabase = getSupabaseServiceClient();
  const { data: updatedTenant, error: updateError } = await serviceSupabase
    .from("tenants")
    .update(update)
    .eq("tenant_id", tenantId)
    .select("tenant_id, plan_tier, subscription_status")
    .maybeSingle();

  if (updateError || !updatedTenant) {
    console.error("[Billing] Billing test state update failed", {
      event: "billing_test_state_update_failed",
      tenant_id: tenantId,
      user_id: user.id,
      requested_state: normalizedState,
      error: updateError,
    });
    throw new Error("Unable to update billing test state.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  console.info("[Billing] Billing test state updated", {
    event: "billing_test_state_updated",
    tenant_id: tenantId,
    user_id: user.id,
    requested_state: normalizedState,
    plan_tier: updatedTenant.plan_tier,
    subscription_status: updatedTenant.subscription_status,
  });

  return {
    status: "updated",
    tenantId,
    subscriptionStatus: normalizedState,
    planTier: updatedTenant.plan_tier === "pro" ? "pro" : "free",
  };
}

/**
 * Generates a Dodo Payments Customer Portal session for active subscribers.
 * Eliminates live email scanning in favor of deterministic database resolution with 100% type safety.
 */
export async function manageBillingPortal(): Promise<BillingSessionResult> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    console.error("[Billing] Missing NEXT_PUBLIC_SITE_URL environment variable.");
    throw new Error("Billing service is currently unavailable.");
  }

  const { client: dodo, environment } = getDodoClient();
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  // 1. Resolve Tenant Context (Rule 6: Scope by Tenant)
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    console.error("[Billing] Workspace membership lookup failed during portal creation", {
      event: "tenant_membership_lookup_failed",
      user_id: user.id,
      error: membershipError,
    });
    throw new Error("No valid workspace found for user.");
  }

  // 2. Deterministic Tenant & Billing Profile Resolution (Rule 11)
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("tenant_id, dodo_customer_id")
    .eq("tenant_id", membership.tenant_id)
    .single();

  if (tenantError || !tenant) {
    console.error("[Billing] Tenant lookup failed during portal creation", {
      event: "tenant_lookup_failed",
      tenant_id: membership.tenant_id,
      error: tenantError,
    });
    throw new Error("Unable to resolve workspace billing status.");
  }

  const entitlements = await getWorkspaceEntitlements(supabase, membership.tenant_id);
  const planTier = entitlements.planTier.toLowerCase();

  const canManageBilling =
    planTier === "pro" &&
    ["active", "trialing", "past_due", "canceling"].includes(entitlements.subscriptionStatus ?? "");

  if (!canManageBilling) {
    throw new Error("No active subscription found to manage.");
  }

  const customerId = tenant.dodo_customer_id;

  if (!customerId) {
    console.error("[Billing] Workspace missing persisted dodo_customer_id", {
      event: "portal_customer_id_missing",
      tenant_id: membership.tenant_id,
      user_id: user.id,
    });
    throw new Error("No billing profile linked to this workspace. Please contact support.");
  }

  try {
    // 3. Create Customer Portal session deterministically via canonical customer ID
    const portalSession = await dodo.customers.customerPortal.create(customerId);

    if (!portalSession || !portalSession.link) {
      throw new Error("Portal session returned without a valid link.");
    }

    return { status: "portal_created", url: portalSession.link };
  } catch (error) {
    console.error("[Billing] Customer portal creation failed", {
      event: "portal_creation_failed",
      tenant_id: membership.tenant_id,
      user_id: user.id,
      customer_id: customerId,
      environment, // Explicitly logs the active SDK routing environment
      error,
    });
    throw new Error("Unable to open billing portal. Please try again later.");
  }
}
