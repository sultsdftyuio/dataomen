"use server";

import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { DodoPayments } from "dodopayments";
import type { Database } from "@/types/supabase";
import { PRO_TRIAL_DAYS } from "@/lib/entitlements";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const DODO_SUBSCRIPTION_SCAN_LIMIT = 200;
export const DODO_SUBSCRIPTION_PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type DodoSubscriptionLookupStrategy =
  | "subscription_id"
  | "customer_id"
  | "metadata.tenant_id";

export type DodoSubscriptionMatch = {
  subscription: Record<string, unknown>;
  lookupStrategy: DodoSubscriptionLookupStrategy;
  scannedCount: number;
};

export type DodoSubscriptionListParams = NonNullable<
  Parameters<DodoPayments["subscriptions"]["list"]>[0]
>;

export type VerifyAndSyncSubscriptionStatusResult = {
  status: "already_synced" | "synced" | "no_active_subscription";
  tenantId: string;
  planTier: string | null;
  subscriptionStatus: string | null;
  dodoSubscriptionId?: string | null;
  dodoCustomerId?: string | null;
  lookupStrategy?: DodoSubscriptionLookupStrategy;
};

export type CancelProPlanResult = {
  status: "cancellation_scheduled" | "already_canceled";
  tenantId: string;
  subscriptionStatus: string | null;
  currentPeriodEnd?: string | null;
};

export type BillingTestState =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceling"
  | "canceled";

export type BillingTestStateResult = {
  status: "updated";
  tenantId: string;
  subscriptionStatus: BillingTestState;
  planTier: "free" | "pro";
};

export type TenantBillingLookupRow = {
  tenant_id: string;
  plan_tier: string;
  subscription_status: string;
  dodo_customer_id: string | null;
  dodo_subscription_id: string | null;
  current_period_end: string | null;
};

/* ------------------------------------------------------------------ */
/*  Low-level helpers                                                 */
/* ------------------------------------------------------------------ */

export function sanitizeEnvSecret(value: string | undefined): string {
  return value?.trim().replace(/^["']+|["']+$/g, "").trim() ?? "";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(
  record: Record<string, unknown> | null,
  key: string
): string | null {
  if (!record) return null;
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readNumber(
  record: Record<string, unknown> | null,
  key: string
): number | null {
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

export function readBoolean(
  record: Record<string, unknown> | null,
  key: string
): boolean | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}

export function addDays(dateValue: string | null, days: number): string {
  const start =
    dateValue && Number.isFinite(Date.parse(dateValue))
      ? new Date(dateValue)
      : new Date();
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function compact(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

/* ------------------------------------------------------------------ */
/*  Supabase service client                                           */
/* ------------------------------------------------------------------ */

export function getSupabaseServiceClient() {
  const supabaseUrl = sanitizeEnvSecret(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnvSecret(
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

/* ------------------------------------------------------------------ */
/*  Billing test helpers                                              */
/* ------------------------------------------------------------------ */

export function isBillingTestControlsEnabled(): boolean {
  const explicitFlag = sanitizeEnvSecret(
    process.env.BILLING_TEST_CONTROLS_ENABLED
  ).toLowerCase();
  if (["true", "1", "yes"].includes(explicitFlag)) {
    return true;
  }
  if (["false", "0", "no"].includes(explicitFlag)) {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

export function isBillingTestState(value: string): value is BillingTestState {
  return [
    "free",
    "trialing",
    "active",
    "past_due",
    "canceling",
    "canceled",
  ].includes(value);
}

export function billingTestUpdateFromState(
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

/* ------------------------------------------------------------------ */
/*  Dodo Payments client                                              */
/* ------------------------------------------------------------------ */

/**
 * 1. Deterministic SDK Initialization (Rule 11: Determinism & Rule 17: Observability)
 * Eliminates heuristic prefix guessing in favor of explicit configuration.
 * Automatically sanitizes accidental whitespace, quotes, or carriage returns.
 */
export function getDodoClient(): {
  client: DodoPayments;
  environment: "test_mode" | "live_mode";
} {
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
    explicitEnv === "test_mode" ? "test_mode" : "live_mode";
  const client = new DodoPayments({
    bearerToken: apiKey,
    environment,
  });
  return { client, environment };
}

/* ------------------------------------------------------------------ */
/*  Subscription field extractors                                     */
/* ------------------------------------------------------------------ */

export function extractTenantIdFromMetadata(
  record: Record<string, unknown>
): string | null {
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

export function extractCustomerId(
  subscription: Record<string, unknown>
): string | null {
  return (
    readString(subscription, "customer_id") ??
    readString(asRecord(subscription.customer), "customer_id") ??
    readString(asRecord(subscription.customer), "id")
  );
}

export function extractSubscriptionId(
  subscription: Record<string, unknown>
): string | null {
  return (
    readString(subscription, "subscription_id") ??
    readString(subscription, "id")
  );
}

export function extractCurrentPeriodEnd(
  subscription: Record<string, unknown>
): string | null {
  return (
    readString(subscription, "current_period_end") ??
    readString(subscription, "next_billing_date") ??
    readString(subscription, "renews_at") ??
    readString(subscription, "expires_at")
  );
}

export function resolveTrialEndsAt(
  subscription: Record<string, unknown>
): string | null {
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

export function isActiveOrTrialingDodoSubscription(
  subscription: Record<string, unknown>
): boolean {
  const status = readString(subscription, "status")?.toLowerCase();
  return status === "active" || status === "trialing";
}

export function tenantUpdateFromDodoSubscription(
  subscription: Record<string, unknown>
): Database["public"]["Tables"]["tenants"]["Update"] {
  const trialEndsAt = resolveTrialEndsAt(subscription);
  const trialEndsTimestamp = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const cancelAtPeriodEnd =
    readBoolean(subscription, "cancel_at_next_billing_date") === true;
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

/* ------------------------------------------------------------------ */
/*  Dodo subscription lookup (active)                                 */
/* ------------------------------------------------------------------ */

export async function retrieveActiveSubscriptionById(
  dodo: DodoPayments,
  subscriptionId: string
): Promise<Record<string, unknown> | null> {
  const subscription = asRecord(
    await dodo.subscriptions.retrieve(subscriptionId)
  );

  if (!subscription || !isActiveOrTrialingDodoSubscription(subscription)) {
    return null;
  }

  return subscription;
}

export async function findActiveSubscriptionByCustomerId(
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

    if (
      subscriptionRecord &&
      isActiveOrTrialingDodoSubscription(subscriptionRecord)
    ) {
      return {
        subscription: subscriptionRecord,
        lookupStrategy: "customer_id",
        scannedCount,
      };
    }
  }

  return null;
}

export async function findActiveSubscriptionByMetadata(
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

  console.info(
    "[Billing] Dodo active subscription metadata scan completed without match",
    {
      event: "dodo_subscription_metadata_scan_miss",
      tenant_id: tenantId,
      product_id: productId,
      scanned_count: scannedCount,
      scan_limit: DODO_SUBSCRIPTION_SCAN_LIMIT,
    }
  );

  return null;
}

export async function findActiveDodoSubscriptionForTenant(
  dodo: DodoPayments,
  params: {
    tenantId: string;
    customerId: string | null;
    subscriptionId: string | null;
    productId: string | null;
  }
): Promise<DodoSubscriptionMatch | null> {
  if (params.subscriptionId) {
    const subscription = await retrieveActiveSubscriptionById(
      dodo,
      params.subscriptionId
    );

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