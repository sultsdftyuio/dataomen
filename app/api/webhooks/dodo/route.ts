import { NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { DodoPayments } from "dodopayments";

import type { Database } from "@/types/supabase";
import { PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS } from "@/lib/entitlements";

export const runtime = "nodejs";

type DodoWebhookEvent = {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

function getDodoClient(): DodoPayments {
  const apiKey = sanitizeEnvSecret(process.env.DODO_PAYMENTS_API_KEY);
  const webhookKey = sanitizeEnvSecret(process.env.DODO_PAYMENTS_WEBHOOK_KEY);

  if (!apiKey) {
    throw new Error("Missing DODO_PAYMENTS_API_KEY environment variable.");
  }

  if (!webhookKey) {
    throw new Error("Missing DODO_PAYMENTS_WEBHOOK_KEY environment variable.");
  }

  const explicitEnv = process.env.DODO_PAYMENTS_ENV;
  const isTestKey = apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
  const environment = explicitEnv === "test_mode" || isTestKey ? "test_mode" : "live_mode";

  return new DodoPayments({
    bearerToken: apiKey,
    webhookKey,
    environment,
  });
}

function sanitizeEnvSecret(value: string | undefined): string {
  return value?.trim().replace(/^["']+|["']+$/g, "").trim() ?? "";
}

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function topLevelKeys(record: Record<string, unknown> | null): string[] {
  return record ? Object.keys(record).sort() : [];
}

function webhookHeaderKeys(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((key) => key.startsWith("webhook-") || key.startsWith("svix-"))
    .sort();
}

function safeParseWebhookEnvelope(rawBody: string): DodoWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody);
    const record = asRecord(parsed);

    if (!record) return null;

    return {
      type: readString(record, "type") ?? "unknown",
      timestamp: readString(record, "timestamp") ?? undefined,
      data: asRecord(record.data) ?? undefined,
    };
  } catch {
    return null;
  }
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(record: Record<string, unknown> | null, key: string): boolean | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function addDays(dateValue: string | undefined, days: number): string {
  const start = dateValue && Number.isFinite(Date.parse(dateValue))
    ? new Date(dateValue)
    : new Date();
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function extractTenantIdFromPayload(data: Record<string, unknown>): string | null {
  const customer = asRecord(data.customer);
  const subscription = asRecord(data.subscription);
  const payment = asRecord(data.payment);
  const checkoutSession = asRecord(data.checkout_session);

  const metadataSources = [
    asRecord(data.metadata),
    asRecord(data.custom_data),
    asRecord(data.checkout_session_metadata),
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

async function extractTenantId(
  data: Record<string, unknown>,
  dodo: DodoPayments,
  eventType: string
): Promise<string | null> {
  const tenantId = extractTenantIdFromPayload(data);
  if (tenantId) return tenantId;

  const subscriptionId = extractSubscriptionId(data);

  if (!subscriptionId || !eventType.startsWith("subscription.")) {
    return null;
  }

  try {
    const subscription = await dodo.subscriptions.retrieve(subscriptionId);
    const subscriptionRecord = asRecord(subscription);
    const tenantIdFromSubscription = subscriptionRecord
      ? extractTenantIdFromPayload(subscriptionRecord)
      : null;

    console.info("[Dodo Webhook] Dodo subscription metadata fallback completed", {
      event_type: eventType,
      subscription_id: subscriptionId,
      resolved_tenant_id: Boolean(tenantIdFromSubscription),
      subscription_data_keys: topLevelKeys(subscriptionRecord),
      subscription_metadata_keys: topLevelKeys(asRecord(subscriptionRecord?.metadata)),
    });

    return tenantIdFromSubscription;
  } catch (error) {
    console.error("[Dodo Webhook] Dodo subscription metadata fallback failed", {
      event_type: eventType,
      subscription_id: subscriptionId,
      data_keys: topLevelKeys(data),
      error: serializeError(error),
    });

    return null;
  }
}

function extractCustomerId(data: Record<string, unknown>): string | null {
  return (
    readString(data, "customer_id") ??
    readString(asRecord(data.customer), "customer_id") ??
    readString(asRecord(data.customer), "id")
  );
}

function extractSubscriptionId(data: Record<string, unknown>): string | null {
  return (
    readString(data, "subscription_id") ??
    readString(data, "id") ??
    readString(asRecord(data.subscription), "subscription_id") ??
    readString(asRecord(data.subscription), "id")
  );
}

function extractCurrentPeriodEnd(data: Record<string, unknown>): string | null {
  return (
    readString(data, "current_period_end") ??
    readString(data, "next_billing_date") ??
    readString(data, "renews_at") ??
    readString(data, "expires_at")
  );
}

function explicitTrialEnd(data: Record<string, unknown>): string | null {
  const trialEnd =
    readString(data, "trial_ends_at") ??
    readString(data, "trial_end") ??
    readString(data, "trial_end_at") ??
    readString(data, "trial_expires_at");

  return trialEnd && Number.isFinite(Date.parse(trialEnd)) ? trialEnd : null;
}

function resolveTrialEndsAt(
  eventType: string,
  data: Record<string, unknown>,
  timestamp: string | undefined
): string | null {
  const explicitEnd = explicitTrialEnd(data);
  if (explicitEnd) return explicitEnd;

  const configuredTrialDays = readNumber(data, "trial_period_days");
  const hasTrial = configuredTrialDays !== null && configuredTrialDays > 0;

  if (!hasTrial && eventType !== "subscription.active") {
    return null;
  }

  const trialDays = hasTrial ? configuredTrialDays : PRO_TRIAL_DAYS;
  return addDays(readString(data, "created_at") ?? timestamp, trialDays);
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function tenantUpdateFor(event: DodoWebhookEvent): Record<string, unknown> | null {
  const data = event.data ?? {};
  const customerId = extractCustomerId(data);
  const subscriptionId = extractSubscriptionId(data);
  const currentPeriodEnd = extractCurrentPeriodEnd(data);
  const common = {
    dodo_customer_id: customerId ?? undefined,
    dodo_subscription_id: subscriptionId ?? undefined,
    current_period_end: currentPeriodEnd ?? undefined,
    updated_at: new Date().toISOString(),
  };

  switch (event.type) {
    case "subscription.active": {
      const trialEndsAt = resolveTrialEndsAt(event.type, data, event.timestamp);
      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
        billing_status: "trialing",
        plan: "pro",
        status: "active",
      });
    }
    case "subscription.renewed":
      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: null,
        billing_status: "active",
        plan: "pro",
        status: "active",
      });
    case "subscription.updated":
    case "subscription.plan_changed": {
      const trialEndsAt = resolveTrialEndsAt(event.type, data, event.timestamp);
      const trialEndsTimestamp = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
      const cancelAtPeriodEnd = readBoolean(data, "cancel_at_next_billing_date") === true;
      const isTrialing =
        Number.isFinite(trialEndsTimestamp) && trialEndsTimestamp > Date.now();
      const subscriptionStatus = cancelAtPeriodEnd
        ? "canceling"
        : isTrialing
          ? "trialing"
          : "active";

      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: subscriptionStatus,
        trial_ends_at: isTrialing ? trialEndsAt : null,
        billing_status: subscriptionStatus,
        plan: "pro",
        status: "active",
      });
    }
    case "subscription.failed":
    case "subscription.on_hold":
    case "subscription.paused":
      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: "past_due",
        billing_status: "past_due",
        plan: "pro",
        status: "past_due",
      });
    case "subscription.cancelled":
    case "subscription.canceled":
    case "subscription.expired":
      return compact({
        ...common,
        plan_tier: "free",
        subscription_status: "canceled",
        trial_ends_at: null,
        billing_status: "canceled",
        dodo_subscription_id: null,
        plan: "free",
        status: "active",
      });
    default:
      return null;
  }
}

export async function POST(request: Request) {
  let event: DodoWebhookEvent;
  let dodo: DodoPayments;
  let rawBody = "";
  let headers: Record<string, string> = {};

  try {
    dodo = getDodoClient();
  } catch (error) {
    console.error("[Dodo Webhook] Configuration missing", { error });
    return NextResponse.json({ error: "Dodo webhook is not configured." }, { status: 500 });
  }

  try {
    rawBody = await request.text();
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const untrustedEnvelope = safeParseWebhookEnvelope(rawBody);
    console.info("[Dodo Webhook] Verification starting", {
      event_type: untrustedEnvelope?.type ?? "unknown",
      data_keys: topLevelKeys(asRecord(untrustedEnvelope?.data)),
      body_bytes: Buffer.byteLength(rawBody, "utf8"),
      signature_header_keys: webhookHeaderKeys(headers),
    });

    event = dodo.webhooks.unwrap(rawBody, { headers }) as unknown as DodoWebhookEvent;

    console.info("[Dodo Webhook] Verification succeeded", {
      event_type: event.type,
      data_keys: topLevelKeys(asRecord(event.data)),
    });
  } catch (error) {
    const untrustedEnvelope = safeParseWebhookEnvelope(rawBody);

    console.error("[Dodo Webhook] Verification failed", {
      event_type: untrustedEnvelope?.type ?? "unknown",
      data_keys: topLevelKeys(asRecord(untrustedEnvelope?.data)),
      body_bytes: Buffer.byteLength(rawBody, "utf8"),
      signature_header_keys: webhookHeaderKeys(headers),
      error: serializeError(error),
    });

    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const data = asRecord(event.data) ?? {};
  const tenantId = await extractTenantId(data, dodo, event.type);

  if (!tenantId) {
    console.error("[Dodo Webhook] Missing tenant_id metadata", {
      event_type: event.type,
      data_keys: topLevelKeys(data),
      customer_id: extractCustomerId(data),
      subscription_id: extractSubscriptionId(data),
      metadata_keys: topLevelKeys(asRecord(data.metadata)),
      checkout_session_metadata_keys: topLevelKeys(asRecord(data.checkout_session_metadata)),
    });
    return NextResponse.json({ error: "Missing tenant_id metadata." }, { status: 400 });
  }

  const update = tenantUpdateFor(event);
  if (!update) {
    return NextResponse.json({ status: "ignored", event_type: event.type });
  }

  let supabase: ReturnType<typeof getSupabaseServiceClient>;

  try {
    supabase = getSupabaseServiceClient();
  } catch (error) {
    console.error("[Dodo Webhook] Supabase service configuration missing", { error });
    return NextResponse.json({ error: "Webhook persistence is not configured." }, { status: 500 });
  }

  const { data: updatedTenant, error } = await supabase
    .from("tenants")
    .update(update as Database["public"]["Tables"]["tenants"]["Update"])
    .eq("tenant_id", tenantId)
    .select("tenant_id")
    .maybeSingle();

  if (error) {
    console.error("[Dodo Webhook] Tenant billing update failed", {
      event_type: event.type,
      tenant_id: tenantId,
      error,
    });
    return NextResponse.json({ error: "Could not update tenant billing state." }, { status: 500 });
  }

  if (!updatedTenant) {
    console.error("[Dodo Webhook] Tenant metadata did not match a workspace", {
      event_type: event.type,
      tenant_id: tenantId,
    });
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: "ok",
    event_type: event.type,
    tenant_id: tenantId,
    terms: `$${PRO_MONTHLY_PRICE}/month after the ${PRO_TRIAL_DAYS}-day trial`,
  });
}
