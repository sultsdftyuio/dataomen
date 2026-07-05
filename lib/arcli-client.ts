/**
 * Arcli Tracking Client (v3.1)
 * Optimized for reliability, idempotency, and minimal overhead.
 */

const API_KEY = process.env.NEXT_PUBLIC_ARCLI_API_KEY;
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.arcli.tech").replace(/\/$/, "");

export const TRACKING_TIMEOUT_MS = 5000;

export const ARCLI_SIGNAL_EVENTS = new Set([
  "invoice_payment_failed",
  "subscription_cancelled",
  "feedback_submitted",
  "user_activity",
  "login",
  "session_started",
  "feature_used",
  "user_returned",
  "subscription_restored",
  "revenue_recovered",
  "email_sent",
  "invoice_paid",
  "charge_succeeded",
  "subscription_payment_success",
]);

const EVENT_ALIASES: Record<string, string> = {
  "stripe.invoice.payment_failed": "invoice_payment_failed",
  "invoice.payment_failed": "invoice_payment_failed",
  payment_failed: "invoice_payment_failed",
  "subscription.cancelled": "subscription_cancelled",
  "subscription.canceled": "subscription_cancelled",
  "customer.subscription.deleted": "subscription_cancelled",
  feedback: "feedback_submitted",
  "invoice.paid": "invoice_paid",
  "stripe.invoice.paid": "invoice_paid",
  "charge.succeeded": "charge_succeeded",
  "stripe.charge.succeeded": "charge_succeeded",
};

export type TrackingProperties = Record<string, unknown>;

export interface TrackResponse {
  status: "accepted" | "success" | "duplicate";
  idempotency_key: string;
}

/**
 * Tracks a user event.
 * Enforces idempotency via client-side generated keys to ensure retry safety.
 */
export async function trackEvent(
  eventName: string,
  userId: string,
  properties: TrackingProperties = {},
  idempotencyKey?: string
): Promise<TrackResponse | undefined> {
  
  // 1. Configuration Validation
  if (!API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Arcli] Tracking disabled: NEXT_PUBLIC_ARCLI_API_KEY missing.");
    }
    return;
  }

  // 2. Input Normalization & Validation
  const rawEventName = eventName.trim().toLowerCase();
  const normalizedEventName = EVENT_ALIASES[rawEventName] ?? rawEventName.replace(/\./g, "_");
  const normalizedUserId = userId.trim();

  if (!normalizedEventName || !normalizedUserId) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Arcli] eventName and userId are required.");
    }
    return;
  }

  if (!ARCLI_SIGNAL_EVENTS.has(normalizedEventName)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Arcli] Ignored non-signal event: ${normalizedEventName}`);
    }
    return;
  }

  // 3. Request Orchestration
  const finalIdempotencyKey = idempotencyKey ?? crypto.randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRACKING_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/v1/track/`, {
      method: "POST",
      keepalive: true, // Critical: keeps the request alive if the user leaves the page
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        event_name: normalizedEventName,
        user_id: normalizedUserId,
        idempotency_key: finalIdempotencyKey,
        timestamp: new Date().toISOString(),
        properties,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (process.env.NODE_ENV !== "production") {
        console.error(`[Arcli] Tracking failed (${response.status})`, errorData);
      }
      return;
    }

    return (await response.json()) as TrackResponse;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error("[Arcli] Tracking request timed out.");
      } else {
        console.error("[Arcli] Network error:", error);
      }
    }
    return;
  } finally {
    clearTimeout(timeout);
  }
}
