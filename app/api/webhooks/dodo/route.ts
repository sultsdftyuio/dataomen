import { NextResponse } from "next/server";
import type { DodoPayments } from "dodopayments";

import { getDodoClient } from "@/lib/billing/dodo-client";
import {
  asRecord,
  extractCustomerId,
  extractSubscriptionId,
  extractTenantId,
  readString,
  serializeError,
  topLevelKeys,
  type DodoRecord,
} from "@/lib/billing/dodo-payload";
import { planSubscriptionSync } from "@/lib/billing/subscription-state";
import { createServiceRoleClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type DodoWebhookEvent = {
  type: string;
  timestamp?: string;
  data?: DodoRecord;
};

function webhookHeaderKeys(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((key) => key.startsWith("webhook-") || key.startsWith("svix-"))
    .sort();
}

function safeParseWebhookEnvelope(rawBody: string): DodoWebhookEvent | null {
  try {
    const record = asRecord(JSON.parse(rawBody));
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

/**
 * Acknowledges an event that this endpoint will never be able to apply.
 *
 * Dodo retries any non-2xx response, so a 4xx here would only replay the same
 * unusable event. The reason is logged by the caller instead.
 */
function ignored(eventType: string, reason: string) {
  return NextResponse.json({ status: "ignored", event_type: eventType, reason });
}

function verifyWebhook(
  dodo: DodoPayments,
  rawBody: string,
  headers: Record<string, string>
): DodoWebhookEvent | null {
  const untrustedEnvelope = safeParseWebhookEnvelope(rawBody);
  const logContext = {
    event_type: untrustedEnvelope?.type ?? "unknown",
    data_keys: topLevelKeys(asRecord(untrustedEnvelope?.data)),
    body_bytes: Buffer.byteLength(rawBody, "utf8"),
    signature_header_keys: webhookHeaderKeys(headers),
  };

  try {
    return dodo.webhooks.unwrap(rawBody, { headers }) as unknown as DodoWebhookEvent;
  } catch (error) {
    console.error("[Dodo Webhook] Verification failed", {
      ...logContext,
      error: serializeError(error),
    });
    return null;
  }
}

export async function POST(request: Request) {
  let dodo: DodoPayments;

  try {
    dodo = getDodoClient({ requireWebhookKey: true }).client;
  } catch (error) {
    console.error("[Dodo Webhook] Configuration missing", { error: serializeError(error) });
    return NextResponse.json({ error: "Dodo webhook is not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const event = verifyWebhook(dodo, rawBody, headers);
  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  // Only subscription events change workspace access. Checked before any
  // tenant lookup so payment, refund, and dispute events are acknowledged
  // instead of failing on metadata they are not expected to carry.
  if (!event.type.startsWith("subscription.")) {
    return ignored(event.type, "unhandled_event_type");
  }

  const payload = asRecord(event.data) ?? {};
  const subscriptionId = extractSubscriptionId(payload);

  if (!subscriptionId) {
    console.error("[Dodo Webhook] Subscription event without a subscription id", {
      event_type: event.type,
      data_keys: topLevelKeys(payload),
    });
    return ignored(event.type, "missing_subscription_id");
  }

  // The event is treated as a signal that the subscription changed, not as the
  // new state. Webhooks can arrive late, repeated, or out of order, and
  // `subscription.updated` fires for every field change, so the only reliable
  // source for what the workspace should have is the subscription as Dodo
  // reports it now.
  let subscription: DodoRecord | null;

  try {
    subscription = asRecord(await dodo.subscriptions.retrieve(subscriptionId));
  } catch (error) {
    console.error("[Dodo Webhook] Could not load the subscription from Dodo", {
      event_type: event.type,
      subscription_id: subscriptionId,
      error: serializeError(error),
    });
    return NextResponse.json({ error: "Could not load subscription state." }, { status: 500 });
  }

  if (!subscription) {
    return NextResponse.json({ error: "Could not load subscription state." }, { status: 500 });
  }

  const tenantId = extractTenantId(subscription) ?? extractTenantId(payload);

  if (!tenantId) {
    console.error("[Dodo Webhook] Missing tenant_id metadata", {
      event_type: event.type,
      subscription_id: subscriptionId,
      customer_id: extractCustomerId(subscription),
      subscription_metadata_keys: topLevelKeys(asRecord(subscription.metadata)),
    });
    return ignored(event.type, "missing_tenant_metadata");
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;

  try {
    supabase = createServiceRoleClient();
  } catch (error) {
    console.error("[Dodo Webhook] Supabase service configuration missing", {
      error: serializeError(error),
    });
    return NextResponse.json({ error: "Webhook persistence is not configured." }, { status: 500 });
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(
      "tenant_id, plan_tier, subscription_status, trial_ends_at, billing_status, plan, status, dodo_customer_id, dodo_subscription_id, current_period_end"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (tenantError) {
    console.error("[Dodo Webhook] Tenant billing state lookup failed", {
      event_type: event.type,
      tenant_id: tenantId,
      error: tenantError,
    });
    return NextResponse.json({ error: "Could not resolve workspace billing state." }, { status: 500 });
  }

  if (!tenant) {
    console.error("[Dodo Webhook] Tenant metadata did not match a workspace", {
      event_type: event.type,
      tenant_id: tenantId,
      subscription_id: subscriptionId,
    });
    return ignored(event.type, "workspace_not_found");
  }

  const plan = planSubscriptionSync(tenant, subscription);

  if (plan.action === "ignore") {
    console.info("[Dodo Webhook] Subscription event does not change workspace billing", {
      event_type: event.type,
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      subscription_status: readString(subscription, "status"),
      linked_subscription_id: tenant.dodo_subscription_id,
      reason: plan.reason,
    });
    return ignored(event.type, plan.reason);
  }

  if (plan.action === "noop") {
    return NextResponse.json({
      status: "already_processed",
      event_type: event.type,
      tenant_id: tenantId,
    });
  }

  const { error: updateError } = await supabase
    .from("tenants")
    .update(plan.update)
    .eq("tenant_id", tenantId);

  if (updateError) {
    console.error("[Dodo Webhook] Tenant billing update failed", {
      event_type: event.type,
      tenant_id: tenantId,
      error: updateError,
    });
    return NextResponse.json({ error: "Could not update tenant billing state." }, { status: 500 });
  }

  console.info("[Dodo Webhook] Workspace billing synced from Dodo", {
    event_type: event.type,
    tenant_id: tenantId,
    subscription_id: subscriptionId,
    lifecycle: plan.lifecycle,
    subscription_status: plan.update.subscription_status,
  });

  return NextResponse.json({
    status: "ok",
    event_type: event.type,
    tenant_id: tenantId,
  });
}
