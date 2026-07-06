import type { ApiKeySummary, SettingsSnapshot, TenantSettingsSnapshotRow } from "@/lib/settings/types";

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  workspace: {
    companyName: "",
    senderEmail: "", // Added senderEmail to default snapshot
    replyToEmail: "",
    websiteUrl: "",
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
      // Map sender_email directly from the Supabase row payload
      senderEmail: (row as any).sender_email ?? "",
      replyToEmail: row.reply_to_email ?? "",
      websiteUrl: row.website_url ?? "",
    },
    integrations: {
      stripeConnected: Boolean(row.stripe_account_id),
      emailProviderStatus: Boolean(row.email_provider_status),
      apiKeyLast4,
      hasApiKey,
      keyLastUpdated,
    },
    routing: { ...DEFAULT_SETTINGS.routing },
  };
}
