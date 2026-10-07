/**
 * Defensive readers for Dodo webhook and API payloads.
 *
 * Both sources are treated as untyped records: field names have varied between
 * API versions, and a missing field must never be mistaken for a paid state.
 */

export type DodoRecord = Record<string, unknown>;

export function asRecord(value: unknown): DodoRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DodoRecord)
    : null;
}

export function readString(record: DodoRecord | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readNumber(record: DodoRecord | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readBoolean(record: DodoRecord | null, key: string): boolean | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
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

export function topLevelKeys(record: DodoRecord | null): string[] {
  return record ? Object.keys(record).sort() : [];
}

/**
 * Reads the workspace id that checkout attached as metadata. Dodo copies
 * checkout metadata onto different objects depending on the event, so every
 * known location is checked.
 */
export function extractTenantId(record: DodoRecord): string | null {
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

export function extractCustomerId(record: DodoRecord): string | null {
  return (
    readString(record, "customer_id") ??
    readString(asRecord(record.customer), "customer_id") ??
    readString(asRecord(record.customer), "id")
  );
}

export function extractSubscriptionId(record: DodoRecord): string | null {
  return (
    readString(record, "subscription_id") ??
    readString(record, "id") ??
    readString(asRecord(record.subscription), "subscription_id") ??
    readString(asRecord(record.subscription), "id")
  );
}

export function extractCurrentPeriodEnd(record: DodoRecord): string | null {
  return (
    readString(record, "current_period_end") ??
    readString(record, "next_billing_date") ??
    readString(record, "renews_at") ??
    readString(record, "expires_at")
  );
}
