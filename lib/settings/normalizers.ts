import type { ApiKeySummary, SettingsSnapshot, TenantSettingsSnapshotRow } from "@/lib/settings/types";

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  workspace: {
    companyName: "",
    replyToEmail: "",
    timezone: "UTC",
  },
  integrations: {
    stripeConnected: false,
    emailProviderStatus: false,
    apiKeyLast4: null,
    hasApiKey: false,
    keyLastUpdated: null,
  },
  routing: {
    notifyAnomalies: true,
    notifyWeekly: true,
  },
};

export function buildSettingsSnapshot(
  row: TenantSettingsSnapshotRow | null,
  apiKeySummary: ApiKeySummary | null = null
): SettingsSnapshot {
  if (!row) {
    return {
      workspace: { ...DEFAULT_SETTINGS.workspace },
      integrations: { ...DEFAULT_SETTINGS.integrations },
      routing: { ...DEFAULT_SETTINGS.routing },
    };
  }

  const apiKeyLast4 = apiKeySummary?.keyLast4 ?? null;
  const hasApiKey = Boolean(apiKeyLast4);
  const keyLastUpdated = apiKeySummary?.keyLastUpdated ?? row.key_last_updated ?? null;

  return {
    workspace: {
      companyName: row.company_name ?? "",
      replyToEmail: row.reply_to_email ?? "",
      timezone: row.timezone ?? "UTC",
    },
    integrations: {
      stripeConnected: Boolean(row.stripe_account_id),
      emailProviderStatus: Boolean(row.email_provider_status),
      apiKeyLast4,
      hasApiKey,
      keyLastUpdated,
    },
    routing: {
      notifyAnomalies: row.notify_anomalies ?? true,
      notifyWeekly: row.notify_weekly ?? true,
    },
  };
}
