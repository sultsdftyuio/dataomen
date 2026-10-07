import type { DodoPayments } from "dodopayments";

import { asRecord, extractTenantId, readString, type DodoRecord } from "./dodo-payload";

const DODO_SUBSCRIPTION_SCAN_LIMIT = 200;
const DODO_SUBSCRIPTION_PAGE_SIZE = 50;

export type DodoSubscriptionLookupStrategy =
  | "subscription_id"
  | "customer_id"
  | "metadata.tenant_id";

export type DodoSubscriptionMatch = {
  subscription: DodoRecord;
  lookupStrategy: DodoSubscriptionLookupStrategy;
  scannedCount: number;
};

type DodoSubscriptionListParams = NonNullable<
  Parameters<DodoPayments["subscriptions"]["list"]>[0]
>;

function isActiveDodoSubscription(subscription: DodoRecord): boolean {
  return readString(subscription, "status")?.toLowerCase() === "active";
}

async function retrieveActiveSubscriptionById(
  dodo: DodoPayments,
  subscriptionId: string
): Promise<DodoRecord | null> {
  const subscription = asRecord(await dodo.subscriptions.retrieve(subscriptionId));

  if (!subscription || !isActiveDodoSubscription(subscription)) {
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

    if (subscriptionRecord && isActiveDodoSubscription(subscriptionRecord)) {
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
      isActiveDodoSubscription(subscriptionRecord) &&
      extractTenantId(subscriptionRecord) === tenantId
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

/**
 * Finds the workspace's active Dodo subscription, preferring the persisted
 * ids and falling back to a bounded metadata scan for workspaces whose
 * webhook has not landed yet.
 */
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
