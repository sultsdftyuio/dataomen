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
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;

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

function addDays(dateValue: string | undefined, days: number): string {
  const start = dateValue && Number.isFinite(Date.parse(dateValue))
    ? new Date(dateValue)
    : new Date();
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function extractTenantId(data: Record<string, unknown>): string | null {
  const customer = asRecord(data.customer);
  const subscription = asRecord(data.subscription);
  const payment = asRecord(data.payment);

  const metadataSources = [
    asRecord(data.metadata),
    asRecord(data.custom_data),
    asRecord(customer?.metadata),
    asRecord(subscription?.metadata),
    asRecord(payment?.metadata),
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
      const isTrialing =
        Number.isFinite(trialEndsTimestamp) && trialEndsTimestamp > Date.now();

      return compact({
        ...common,
        plan_tier: "pro",
        subscription_status: isTrialing ? "trialing" : "active",
        trial_ends_at: isTrialing ? trialEndsAt : null,
        billing_status: isTrialing ? "trialing" : "active",
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

  try {
    dodo = getDodoClient();
  } catch (error) {
    console.error("[Dodo Webhook] Configuration missing", { error });
    return NextResponse.json({ error: "Dodo webhook is not configured." }, { status: 500 });
  }

  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    event = dodo.webhooks.unwrap(rawBody, { headers }) as unknown as DodoWebhookEvent;
  } catch (error) {
    console.error("[Dodo Webhook] Verification failed", { error });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const data = event.data ?? {};
  const tenantId = extractTenantId(data);

  if (!tenantId) {
    console.error("[Dodo Webhook] Missing tenant_id metadata", {
      event_type: event.type,
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
